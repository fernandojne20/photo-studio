// @ts-check
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import { defineConfig, envField, fontProviders } from 'astro/config';
import {
  CSP_DIRECTIVES,
  SCRIPT_RESOURCES,
  STYLE_RESOURCES,
  assertHomepageIndexingConsistent,
  assertNotFoundPageNonIndexable,
  assertNoForeignHeadersContent,
  buildContentSecurityPolicyHeader,
  buildHeadersFile,
  extractCspMetaContent,
  extractRobotsMetaContent,
  findBlockedImageOrigins,
} from './src/lib/security-headers.mjs';

/**
 * `src/pages/sitemap.xml.ts` answers a bodyless 404 without a canonical
 * URL, but the Cloudflare adapter's prerender step still writes a 0-byte
 * file for it (`@astrojs/cloudflare/dist/utils/prerender.js`). An empty
 * sitemap is invalid, so this hook deletes it, only when empty.
 */
/** @type {import('astro').AstroIntegration} */
const removeEmptySitemap = {
  name: 'remove-empty-sitemap',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const sitemapPath = fileURLToPath(new URL('sitemap.xml', dir));
      try {
        if (statSync(sitemapPath).size === 0) rmSync(sitemapPath);
      } catch {
        // Already absent — nothing to clean up.
      }
    },
  },
};

/**
 * Writes `dist/client/_headers` (PD-04): security headers, the CSP merged
 * from every built page's `<meta>`, and `X-Robots-Tag` when non-indexable.
 * `@astrojs/cloudflare` is unshifted to the front of Astro's integration
 * list (`astro/dist/integrations/hooks.js`), so its own `astro:build:done`
 * — which writes a starter `_headers` with only the `/_astro/*` cache rule
 * — always runs first; this hook asserts that, then replaces it.
 */
/** @type {import('astro').AstroIntegration} */
const injectSecurityHeaders = {
  name: 'inject-security-headers',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const root = fileURLToPath(dir);
      const headersPath = join(root, '_headers');
      const indexPath = join(root, 'index.html');
      const sitemapPath = join(root, 'sitemap.xml');

      let existingHeaders = '';
      try {
        existingHeaders = readFileSync(headersPath, 'utf8');
      } catch {
        // No adapter output yet — nothing foreign to guard against.
      }
      assertNoForeignHeadersContent(existingHeaders);

      const sitemapExists = existsSync(sitemapPath);
      assertHomepageIndexingConsistent({
        robotsContent: extractRobotsMetaContent(readFileSync(indexPath, 'utf8')),
        sitemapExists,
      });

      const notFoundPath = join(root, '404.html');
      if (existsSync(notFoundPath)) {
        assertNotFoundPageNonIndexable(
          extractRobotsMetaContent(readFileSync(notFoundPath, 'utf8')),
        );
      }

      const htmlDocuments = readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((entry) => entry.endsWith('.html'))
        .map((entry) => readFileSync(join(root, entry), 'utf8'));
      const contentSecurityPolicy = buildContentSecurityPolicyHeader(htmlDocuments);

      // Fallback content uses remote placeholder photos the policy blocks.
      const blockedImageOrigins = [
        ...new Set(
          htmlDocuments.flatMap((html) =>
            findBlockedImageOrigins(html, extractCspMetaContent(html)),
          ),
        ),
      ];
      if (blockedImageOrigins.length > 0) {
        logger.warn(
          `Images from ${blockedImageOrigins.join(', ')} are blocked by the Content Security Policy. ` +
            'This looks like fallback content: the build is not deployable as is.',
        );
      }

      writeFileSync(
        headersPath,
        buildHeadersFile({ indexable: sitemapExists, contentSecurityPolicy }),
      );
    },
  },
};

// https://astro.build/config
export default defineConfig({
  integrations: [removeEmptySitemap, injectSecurityHeaders],
  // No `site:` option here on purpose: this file is loaded with a plain
  // Node `import()` before Vite (and its `.env` loading) ever starts, so
  // `process.env.PUBLIC_SITE_URL` here would only ever see a shell
  // variable, never a `.env` value — a silent footgun (validates, but
  // `Astro.site` stays `undefined`). `PUBLIC_SITE_URL` is read once Vite is
  // running instead, via `astro:env/client` in `Seo.astro`,
  // `robots.txt.ts` and `sitemap.xml.ts` (see the schema entry below and
  // `resolveSiteUrl` in `src/lib/seo.ts`), where both `.env` and shell
  // variables work the same way.
  //
  // The homepage stays a prerendered static file that fetches Sanity content
  // at build time (see `src/content/home.ts`); only `src/pages/api/contact.ts`
  // opts out with `export const prerender = false`. `@astrojs/cloudflare`
  // supports this mix directly: `output: 'static'` still emits a Worker for
  // the on-demand route (see `odd/tasks/contact-conversion.md`).
  output: 'static',
  // This project uses neither Astro sessions nor Cloudflare Images: without
  // these two options, `@astrojs/cloudflare` adds a KV namespace binding
  // (session storage) and an Images binding to the generated Worker
  // config regardless, so a deploy would have to provision resources the
  // site never uses. `session: false` is the documented way to opt out of session
  // support since Astro v7.2.0 (see `astro/dist/types/public/config.d.ts`,
  // the `session` option doc comment). `imageService: 'compile'` processes
  // images at build time with a `passthrough` runtime service instead of
  // Cloudflare's Images binding (confirmed by reading
  // `@astrojs/cloudflare/dist/utils/image-config.js`:
  // `normalizeImageServiceConfig` — the default, undefined config maps to
  // `cloudflare-binding` for both build and runtime, which is what was
  // requesting the binding).
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
  // `<meta http-equiv="content-security-policy">` on every page: the only
  // delivery mechanism here, since `@astrojs/cloudflare` does not declare
  // `adapterFeatures.staticHeaders` (`astro/dist/manifest/serialized.js`).
  // `injectSecurityHeaders` above also merges this into a real header;
  // see the "Security headers" section of `README.md` for the full
  // rationale behind each directive and resource below.
  security: {
    csp: {
      directives: CSP_DIRECTIVES,
      scriptDirective: { resources: SCRIPT_RESOURCES },
      styleDirective: { resources: STYLE_RESOURCES },
    },
  },
  env: {
    schema: {
      // Secrets are read at *runtime* from the Worker's own environment
      // (`cloudflare:workers`' `env`, populated from `wrangler.jsonc`
      // `vars`, `wrangler secret put`, or `.dev.vars` locally — see
      // `@astrojs/cloudflare/dist/utils/handler.js`:
      // `setGetEnv(createGetEnv(globalEnv))`), never inlined into the
      // built bundle. All optional so `pnpm build`/`pnpm check`/CI need no
      // value; the contact use case reports `not_configured` when they
      // are missing.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Also runtime secrets, not public: an `access: 'public'` field is
      // inlined as a *build-time* literal (`astro/dist/env/vite-plugin-env.js`:
      // `getTemplates` — `access: 'public'` fields become
      // `export const KEY = <value known at build time>`, so a value only
      // set later, e.g. as a Cloudflare Worker `vars` entry, would never
      // reach the already-built bundle). These two addresses must be
      // readable without rebuilding whenever they change, exactly like the
      // two keys above, so they are `secret` too even though they are not
      // sensitive.
      CONTACT_FROM_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_TO_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Client-safe, and the one genuinely build-time variable in this
      // schema: `access: 'public'` fields are inlined as literals at build
      // time (see the comment above), so this must exist in the
      // environment that RUNS `astro build` (locally: `.env` or
      // `.dev.vars`; in the deploy pipeline: the build environment itself)
      // — setting it only as a deployed Worker `vars` entry has no effect
      // on an already-built bundle.
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      // Build-time, optional, same rules as `PUBLIC_TURNSTILE_SITE_KEY`
      // above. The single source of truth for the production origin: read
      // via `astro:env/client` and normalized by `resolveSiteUrl`
      // (`src/lib/seo.ts`). `url: true` only checks it parses as *some*
      // URL; the stricter https-only-plus-bare-origin policy lives in
      // `resolveSiteUrl`, so a syntactically valid but rejected value never
      // fails the build — it safely degrades to "not indexable" instead.
      PUBLIC_SITE_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
        url: true,
      }),
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Adelia',
      cssVariable: '--font-adelia',
      fallbacks: ['cursive'],
      options: {
        variants: [
          {
            weight: '400',
            style: 'normal',
            src: ['./src/assets/fonts/adelia.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Futura Light BT',
      cssVariable: '--font-futura-light',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            weight: '300',
            style: 'normal',
            src: ['./src/assets/fonts/futura-light-bt.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'DM Sans',
      cssVariable: '--font-dm-sans',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            // Variable font axis range confirmed from the source file's `fvar` table.
            weight: '100 1000',
            style: 'normal',
            src: ['./src/assets/fonts/dm-sans-variable.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Minion Variable Concept',
      cssVariable: '--font-minion',
      fallbacks: ['serif'],
      options: {
        variants: [
          {
            // Variable font axis range confirmed from the source file's `fvar` table.
            weight: '400 700',
            style: 'normal',
            src: ['./src/assets/fonts/minion-variable-concept-roman.otf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.google(),
      name: 'Montserrat',
      cssVariable: '--font-montserrat',
      weights: [500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
  ],
});
