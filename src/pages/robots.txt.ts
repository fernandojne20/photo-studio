import type { APIRoute } from 'astro';
import { PUBLIC_SITE_URL } from 'astro:env/client';
import { robotsTxtForSiteUrl } from '../lib/seo';

/**
 * Prerendered `robots.txt` (see `odd/tasks/production-delivery.md`, PD-03).
 * No `export const prerender = false`, so this inherits the project's
 * `output: 'static'` default and is written as a static file under
 * `dist/client/`, not a Worker route. The `Content-Type` header below only
 * matters for `astro dev`: the deployed Cloudflare Worker serves this file
 * from static assets and picks the content type from the `.txt` extension,
 * ignoring whatever header this handler sets.
 */
export const GET: APIRoute = () => {
  return new Response(robotsTxtForSiteUrl(PUBLIC_SITE_URL), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
