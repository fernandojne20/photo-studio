import type { PortableTextBlock } from '@portabletext/types';
import type {
  HOME_PAGE_QUERY_RESULT,
  PORTFOLIO_IMAGES_QUERY_RESULT,
  SERVICE_CATEGORIES_QUERY_RESULT,
} from '../sanity/sanity.types';
import type {
  BiographyContent,
  BiographyCta,
  CmsImage,
  HeroContent,
  PortfolioCategory,
  PortfolioItem,
  ServiceCard,
} from './types';

/**
 * Maps Sanity query results (typed from `../sanity/sanity.types.ts`) into the
 * domain types in `types.ts`. Kept separate from `home.ts` so the fallback
 * policy and the shape translation stay independently readable.
 */

type HomePageDoc = NonNullable<HOME_PAGE_QUERY_RESULT>;
type RawHero = HomePageDoc['hero'];
type RawBiography = HomePageDoc['biography'];
type RawCta = NonNullable<RawBiography>['cta'];
type RawImage = NonNullable<PORTFOLIO_IMAGES_QUERY_RESULT[number]['image']>;
type RawBlock = NonNullable<RawBiography>['body'][number];

function mapImage(raw: RawImage): CmsImage {
  const dimensions = raw.asset?.metadata?.dimensions;

  return {
    source: raw.asset
      ? {
          asset: { _id: raw.asset._id, url: raw.asset.url },
          hotspot: raw.hotspot ?? undefined,
          crop: raw.crop ?? undefined,
        }
      : undefined,
    // Missing asset/dimensions should not happen for a published image field,
    // but the query result types allow it (dereferenced assets can be null).
    url: raw.asset?.url ?? '',
    alt: raw.alt,
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
    lqip: raw.asset?.metadata?.lqip ?? undefined,
  };
}

function mapBlock(block: RawBlock): PortableTextBlock {
  return {
    _type: block._type,
    _key: block._key,
    style: block.style,
    children: (block.children ?? []).map((span) => ({
      _type: span._type,
      _key: span._key,
      text: span.text ?? '',
      marks: span.marks,
    })),
    // Annotations are disabled on this field (see `home-page.ts`), so there
    // are never mark definitions to carry over.
    markDefs: [],
  };
}

function mapCta(raw: RawCta): BiographyCta | undefined {
  if (!raw?.label || !raw.target) return undefined;
  return {
    label: raw.label,
    target: raw.target,
    url: raw.url ?? undefined,
  };
}

export function mapHero(raw: RawHero): HeroContent | null {
  if (!raw) return null;
  return {
    image: mapImage(raw.image),
    mobileImage: raw.mobileImage ? mapImage(raw.mobileImage) : undefined,
  };
}

export function mapBiography(raw: RawBiography): BiographyContent | null {
  if (!raw) return null;
  return {
    portrait: mapImage(raw.portrait),
    body: raw.body.map(mapBlock),
    cta: mapCta(raw.cta),
  };
}

export function mapPortfolioItem(raw: PORTFOLIO_IMAGES_QUERY_RESULT[number]): PortfolioItem {
  const categories: PortfolioCategory[] = (raw.categories ?? []).map((category) => ({
    id: category._id,
    title: category.title,
    slug: category.slug,
  }));

  return {
    id: raw._id,
    image: mapImage(raw.image),
    caption: raw.caption ?? undefined,
    categories,
  };
}

export function mapServiceCard(raw: SERVICE_CATEGORIES_QUERY_RESULT[number]): ServiceCard {
  return {
    id: raw._id,
    title: raw.title,
    slug: raw.slug,
    image: mapImage(raw.image),
  };
}
