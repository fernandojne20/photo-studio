import {defineQuery} from 'groq'

/**
 * Shared image projection: the asset reference resolved to its URL and
 * metadata, plus the fields the URL builder needs for hotspot/crop-aware
 * cropping.
 */
const imageProjection = /* groq */ `{
  asset->{
    _id,
    url,
    metadata{
      lqip,
      dimensions{
        width,
        height,
        aspectRatio
      }
    }
  },
  alt,
  hotspot,
  crop
}`

export const HOME_PAGE_QUERY = defineQuery(/* groq */ `
  *[_id == "homePage"][0]{
    hero{
      image${imageProjection},
      mobileImage${imageProjection}
    },
    biography{
      portrait${imageProjection},
      body,
      cta{
        label,
        target,
        url
      }
    }
  }
`)

export const PORTFOLIO_IMAGES_QUERY = defineQuery(/* groq */ `
  *[_type == "portfolioImage" && visible == true] | order(orderRank asc){
    _id,
    image${imageProjection},
    caption,
    "categories": categories[]->{
      _id,
      title,
      "slug": slug.current
    }
  }
`)

export const SERVICE_CATEGORIES_QUERY = defineQuery(/* groq */ `
  *[_type == "serviceCategory" && visible == true] | order(orderRank asc){
    _id,
    title,
    "slug": slug.current,
    image${imageProjection}
  }
`)
