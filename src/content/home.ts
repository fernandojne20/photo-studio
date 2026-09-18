import { site } from '../config/site';
import {
  biographyPortraitPlaceholder,
  heroPlaceholder,
  portfolioPlaceholders,
  servicePlaceholders,
} from '../data/placeholders';
import { sanityClient } from '../sanity/client';
import {
  HOME_PAGE_QUERY,
  PORTFOLIO_IMAGES_QUERY,
  SERVICE_CATEGORIES_QUERY,
} from '../sanity/queries';
import type {
  HOME_PAGE_QUERY_RESULT,
  PORTFOLIO_IMAGES_QUERY_RESULT,
  SERVICE_CATEGORIES_QUERY_RESULT,
} from '../sanity/sanity.types';
import { mapBiography, mapHero, mapPortfolioItem, mapServiceCard } from './mappers';
import type {
  BiographyContent,
  CmsImage,
  ContentSection,
  ContentSource,
  HeroContent,
  HomeContent,
  PortfolioItem,
  ServiceCard,
} from './types';

export interface GetHomeContentOptions {
  fallbacks?: 'allow' | 'deny';
}

const WARNING_PREFIX = '[content]';

/**
 * Fallback policy (see `odd/tasks/content-management.md`):
 * - Development, or `CONTENT_FALLBACKS=true`: a fetch error, a missing
 *   `homePage`, or an empty list falls back to `src/data/placeholders.ts`
 *   with a `console.warn`.
 * - Otherwise (production build): a fetch error or a missing `homePage`
 *   throws; an empty portfolio/services list returns an empty array.
 *
 * Pure decision function, kept separate from environment access so the
 * rule itself can be unit-tested without stubbing `import.meta.env` /
 * `process.env` (see `home.test.ts`): an explicit `option` always wins;
 * otherwise fallbacks are allowed in dev, or when `flag` is exactly the
 * string `'true'`.
 */
export function resolveFallbackPolicy(input: {
  option?: 'allow' | 'deny';
  dev: boolean;
  flag?: string;
}): boolean {
  if (input.option) return input.option === 'allow';
  return input.dev || input.flag === 'true';
}

/**
 * Thin environment reader: gathers `dev` and `flag` exactly as before and
 * delegates the decision to `resolveFallbackPolicy`.
 */
function resolveAllowFallbacks(options?: GetHomeContentOptions): boolean {
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, unknown> }).env
      : undefined;
  const dev = Boolean(metaEnv?.DEV);
  const flag = (metaEnv?.CONTENT_FALLBACKS as string | undefined) ?? process.env.CONTENT_FALLBACKS;

  return resolveFallbackPolicy({ option: options?.fallbacks, dev, flag });
}

function warn(message: string): string {
  const full = `${WARNING_PREFIX} ${message}`;
  console.warn(full);
  return full;
}

function placeholderImage(img: {
  src: string;
  alt: string;
  width: number;
  height: number;
}): CmsImage {
  // Placeholders have no Sanity asset, so `source` stays unset; callers must
  // use `url` directly instead of `urlFor()` for these images.
  return { url: img.src, alt: img.alt, width: img.width, height: img.height };
}

function placeholderHero(): HeroContent {
  return {
    image: placeholderImage(heroPlaceholder.desktop),
    mobileImage: placeholderImage(heroPlaceholder.mobile),
  };
}

function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function placeholderBiography(): BiographyContent {
  return {
    portrait: placeholderImage(biographyPortraitPlaceholder),
    body: site.copy.biographyFallback.paragraphs.map((text, index) => ({
      _type: 'block',
      _key: `placeholder-${index}`,
      style: 'normal',
      children: [{ _type: 'span', _key: `placeholder-${index}-span`, text, marks: [] }],
      markDefs: [],
    })),
    cta: {
      label: site.copy.biographyCtaLabel,
      target: 'whatsapp',
    },
  };
}

function placeholderPortfolio(): PortfolioItem[] {
  return portfolioPlaceholders.map((image, index) => ({
    id: `placeholder-${index}`,
    image: placeholderImage(image),
    caption: image.caption,
    categories: [],
  }));
}

function placeholderServices(): ServiceCard[] {
  return servicePlaceholders.map((service, index) => ({
    id: `placeholder-${index}`,
    title: service.label,
    slug: slugify(service.label),
    image: placeholderImage(service),
  }));
}

function placeholderContent(warnings: string[]): HomeContent {
  return {
    hero: placeholderHero(),
    biography: placeholderBiography(),
    portfolio: placeholderPortfolio(),
    services: placeholderServices(),
    meta: {
      sources: {
        hero: 'placeholder',
        biography: 'placeholder',
        portfolio: 'placeholder',
        services: 'placeholder',
      },
      warnings,
    },
  };
}

/**
 * Content port for the homepage. Fetches the singleton `homePage` document
 * plus the visible portfolio images and service categories, maps them to the
 * domain types in `types.ts`, and applies the fallback policy above.
 */
export async function getHomeContent(options?: GetHomeContentOptions): Promise<HomeContent> {
  const allowFallbacks = resolveAllowFallbacks(options);
  const warnings: string[] = [];

  let homeDoc: HOME_PAGE_QUERY_RESULT;
  let portfolioRaw: PORTFOLIO_IMAGES_QUERY_RESULT;
  let servicesRaw: SERVICE_CATEGORIES_QUERY_RESULT;

  try {
    [homeDoc, portfolioRaw, servicesRaw] = await Promise.all([
      sanityClient.fetch(HOME_PAGE_QUERY),
      sanityClient.fetch(PORTFOLIO_IMAGES_QUERY),
      sanityClient.fetch(SERVICE_CATEGORIES_QUERY),
    ]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!allowFallbacks) {
      throw new Error(`Failed to fetch content from Sanity and fallbacks are disabled: ${reason}`, {
        cause: error,
      });
    }
    warnings.push(warn(`Failed to fetch content from Sanity, using placeholders. (${reason})`));
    return placeholderContent(warnings);
  }

  const sources: Record<ContentSection, ContentSource> = {
    hero: 'sanity',
    biography: 'sanity',
    portfolio: 'sanity',
    services: 'sanity',
  };

  let hero = mapHero(homeDoc?.hero ?? null);
  if (!hero) {
    if (!allowFallbacks) {
      throw new Error(
        'Missing "hero" content: create the "Página de inicio" document (with a hero image) in the Sanity Studio.',
      );
    }
    warnings.push(warn('Missing hero content, using placeholders.'));
    hero = placeholderHero();
    sources.hero = 'placeholder';
  }

  let biography = mapBiography(homeDoc?.biography ?? null);
  if (!biography) {
    if (!allowFallbacks) {
      throw new Error(
        'Missing "biography" content: create the "Página de inicio" document (with a biography) in the Sanity Studio.',
      );
    }
    warnings.push(warn('Missing biography content, using placeholders.'));
    biography = placeholderBiography();
    sources.biography = 'placeholder';
  }

  let portfolio = portfolioRaw.map(mapPortfolioItem);
  if (portfolio.length === 0 && allowFallbacks) {
    warnings.push(warn('No portfolio images found, using placeholders.'));
    portfolio = placeholderPortfolio();
    sources.portfolio = 'placeholder';
  }
  // else: an empty result outside the fallback path stays an empty array;
  // `studio-page` decides how to render it.

  let services = servicesRaw.map(mapServiceCard);
  if (services.length === 0 && allowFallbacks) {
    warnings.push(warn('No service categories found, using placeholders.'));
    services = placeholderServices();
    sources.services = 'placeholder';
  }

  return { hero, biography, portfolio, services, meta: { sources, warnings } };
}
