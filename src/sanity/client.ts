import {createClient} from '@sanity/client'
import {apiVersion, dataset, projectId} from './env'

/**
 * Server-side client for the static build. The dataset is public, `useCdn`
 * is off (build-time fetches are not repeated per-visitor, so freshness
 * matters more than CDN caching), and `perspective` is pinned to published
 * content only (drafts never leak into the production build).
 */
export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'published',
})
