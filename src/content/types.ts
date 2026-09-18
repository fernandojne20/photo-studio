import type { SanityImageSource } from '@sanity/image-url';
import type { PortableTextBlock } from '@portabletext/types';

/**
 * Domain types for the homepage content, independent of Sanity's field
 * naming. `getHomeContent()` (in `home.ts`) maps Sanity query results (or
 * `src/data/placeholders.ts`) into these shapes so `studio-page` never has to
 * know whether a value came from the CMS or a fallback.
 */

/**
 * A resolved, render-ready image. `source` carries the raw Sanity image
 * value (asset reference, hotspot, crop) for `urlFor()` when further
 * cropping is needed; it is absent for placeholder images, which only ever
 * provide a plain `url`.
 */
export interface CmsImage {
  source?: SanityImageSource;
  url: string;
  alt: string;
  width: number;
  height: number;
  lqip?: string;
}

export interface HeroContent {
  image: CmsImage;
  mobileImage?: CmsImage;
}

export interface BiographyCta {
  label: string;
  target: 'whatsapp' | 'contact' | 'url';
  url?: string;
}

export interface BiographyContent {
  portrait: CmsImage;
  body: PortableTextBlock[];
  cta?: BiographyCta;
}

export interface PortfolioCategory {
  id: string;
  title: string;
  slug: string;
}

export interface PortfolioItem {
  id: string;
  image: CmsImage;
  caption?: string;
  categories: PortfolioCategory[];
}

export interface ServiceCard {
  id: string;
  title: string;
  slug: string;
  image: CmsImage;
}

export type ContentSection = 'hero' | 'biography' | 'portfolio' | 'services';
export type ContentSource = 'sanity' | 'placeholder';

export interface HomeContent {
  hero: HeroContent;
  biography: BiographyContent;
  portfolio: PortfolioItem[];
  services: ServiceCard[];
  meta: {
    sources: Record<ContentSection, ContentSource>;
    warnings: string[];
  };
}
