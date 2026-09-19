import type { APIRoute } from 'astro';
import { PUBLIC_SITE_URL } from 'astro:env/client';
import { sitemapXmlForSiteUrl } from '../lib/seo';

/**
 * Prerendered `sitemap.xml` (see `odd/tasks/production-delivery.md`,
 * PD-03). Hand-written instead of `@astrojs/sitemap`: a one-page site needs
 * exactly one `<url>`.
 *
 * Without a canonical URL there must be NO sitemap, because an empty
 * `<urlset>` is not valid (see `seo.ts`). This handler then answers a
 * bodyless 404, which is all `astro dev` needs. The static build under the
 * Cloudflare adapter still writes a 0-byte file for that response, so the
 * `remove-empty-sitemap` integration in `astro.config.mjs` deletes it after
 * the build. `Content-Type` only matters for `astro dev`: the deployed
 * Worker serves static assets by file extension.
 */
export const GET: APIRoute = () => {
  const body = sitemapXmlForSiteUrl(PUBLIC_SITE_URL);
  if (body === undefined) {
    return new Response(null, { status: 404 });
  }

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
