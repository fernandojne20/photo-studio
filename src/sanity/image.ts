import {createImageUrlBuilder} from '@sanity/image-url'
import type {SanityImageSource} from '@sanity/image-url'
import {dataset, projectId} from './env'

const builder = createImageUrlBuilder({projectId, dataset})

/** Builds a Sanity image URL builder chain for the given image source. */
export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}
