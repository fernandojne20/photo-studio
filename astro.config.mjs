// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig, envField, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
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
