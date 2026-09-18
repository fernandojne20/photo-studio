import { describe, expect, it } from 'vitest';
import { mapBiography, mapHero, mapPortfolioItem, mapServiceCard } from './mappers';
import type {
  HOME_PAGE_QUERY_RESULT,
  PORTFOLIO_IMAGES_QUERY_RESULT,
  SERVICE_CATEGORIES_QUERY_RESULT,
} from '../sanity/sanity.types';

/**
 * Fixture shapes are derived from the generated query result types
 * (`src/sanity/sanity.types.ts`) rather than hand-typed, so a schema/query
 * change that breaks the mappers also breaks `tsc` on these fixtures.
 */
type HomePageDoc = NonNullable<HOME_PAGE_QUERY_RESULT>;
type RawHero = HomePageDoc['hero'];
type RawBiography = HomePageDoc['biography'];
type RawCta = NonNullable<RawBiography>['cta'];
type RawBody = NonNullable<RawBiography>['body'];
type RawImage = NonNullable<PORTFOLIO_IMAGES_QUERY_RESULT[number]['image']>;

function buildRawImage(overrides: Partial<RawImage> = {}): RawImage {
  return {
    asset: {
      _id: 'image-58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000-jpg',
      url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000.jpg',
      metadata: {
        lqip: 'data:image/jpeg;base64,AAAA',
        dimensions: { width: 1600, height: 1000, aspectRatio: 1.6 },
      },
    },
    alt: 'Retrato de familia al aire libre',
    hotspot: { _type: 'sanity.imageHotspot', x: 0.5, y: 0.4, height: 0.6, width: 0.6 },
    crop: { _type: 'sanity.imageCrop', top: 0, bottom: 0, left: 0, right: 0 },
    ...overrides,
  };
}

describe('mapHero (image mapping)', () => {
  it('maps a complete Sanity image, keeping the source for the URL builder', () => {
    const raw: RawHero = { image: buildRawImage(), mobileImage: null };

    const mapped = mapHero(raw);

    expect(mapped?.image).toEqual({
      source: {
        asset: {
          _id: 'image-58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000-jpg',
          url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000.jpg',
        },
        hotspot: { _type: 'sanity.imageHotspot', x: 0.5, y: 0.4, height: 0.6, width: 0.6 },
        crop: { _type: 'sanity.imageCrop', top: 0, bottom: 0, left: 0, right: 0 },
      },
      url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000.jpg',
      alt: 'Retrato de familia al aire libre',
      width: 1600,
      height: 1000,
      lqip: 'data:image/jpeg;base64,AAAA',
    });
  });

  it('falls back to an empty url, zero dimensions, no source and no lqip when the asset is unresolved', () => {
    const raw: RawHero = {
      image: buildRawImage({ asset: null, hotspot: null, crop: null }),
      mobileImage: null,
    };

    const mapped = mapHero(raw);

    expect(mapped?.image).toEqual({
      source: undefined,
      url: '',
      alt: 'Retrato de familia al aire libre',
      width: 0,
      height: 0,
      lqip: undefined,
    });
  });
});

describe('mapHero', () => {
  it('maps both the desktop and mobile image when mobileImage is present', () => {
    const raw: RawHero = {
      image: buildRawImage(),
      mobileImage: buildRawImage({
        asset: {
          _id: 'image-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-393x560-jpg',
          url: 'https://cdn.sanity.io/images/testproject/testdataset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-393x560.jpg',
          metadata: {
            lqip: null,
            dimensions: { width: 393, height: 560, aspectRatio: 0.7 },
          },
        },
      }),
    };

    const mapped = mapHero(raw);

    expect(mapped?.mobileImage).toBeDefined();
    expect(mapped?.mobileImage?.width).toBe(393);
    expect(mapped?.mobileImage?.height).toBe(560);
  });

  it('leaves mobileImage undefined when it is absent from the query result', () => {
    const raw: RawHero = { image: buildRawImage(), mobileImage: null };

    const mapped = mapHero(raw);

    expect(mapped?.mobileImage).toBeUndefined();
  });

  it('returns null when there is no hero content at all', () => {
    expect(mapHero(null)).toBeNull();
  });
});

describe('mapBiography', () => {
  const rawCta: RawCta = { label: 'Reserva tu sesión', target: 'whatsapp', url: null };
  const rawBody: RawBody = [
    {
      _type: 'block',
      _key: 'block-1',
      style: 'normal',
      children: [
        { _type: 'span', _key: 'span-1', text: 'Hola', marks: ['strong'] },
        { _type: 'span', _key: 'span-2', text: undefined, marks: undefined },
      ],
    },
    {
      _type: 'block',
      _key: 'block-2',
      style: 'normal',
    },
  ];

  it('maps the portrait, every body block and its children, and the CTA', () => {
    const raw: RawBiography = { portrait: buildRawImage(), body: rawBody, cta: rawCta };

    const mapped = mapBiography(raw);

    expect(mapped?.portrait.width).toBe(1600);
    expect(mapped?.body).toEqual([
      {
        _type: 'block',
        _key: 'block-1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 'span-1', text: 'Hola', marks: ['strong'] },
          { _type: 'span', _key: 'span-2', text: '', marks: undefined },
        ],
        markDefs: [],
      },
      {
        _type: 'block',
        _key: 'block-2',
        style: 'normal',
        children: [],
        markDefs: [],
      },
    ]);
    expect(mapped?.cta).toEqual({ label: 'Reserva tu sesión', target: 'whatsapp', url: undefined });
  });

  it('omits the CTA when it is absent from the query result', () => {
    const raw: RawBiography = { portrait: buildRawImage(), body: rawBody, cta: null };

    const mapped = mapBiography(raw);

    expect(mapped?.cta).toBeUndefined();
  });

  it('drops the CTA when its label is missing', () => {
    const raw: RawBiography = {
      portrait: buildRawImage(),
      body: rawBody,
      cta: { label: null, target: 'whatsapp', url: null },
    };

    expect(mapBiography(raw)?.cta).toBeUndefined();
  });

  it('drops the CTA when its target is missing', () => {
    const raw: RawBiography = {
      portrait: buildRawImage(),
      body: rawBody,
      cta: { label: 'Reserva tu sesión', target: null, url: null },
    };

    expect(mapBiography(raw)?.cta).toBeUndefined();
  });

  it('returns null when there is no biography content at all', () => {
    expect(mapBiography(null)).toBeNull();
  });
});

describe('mapPortfolioItem', () => {
  function buildRaw(
    overrides: Partial<PORTFOLIO_IMAGES_QUERY_RESULT[number]> = {},
  ): PORTFOLIO_IMAGES_QUERY_RESULT[number] {
    return {
      _id: 'portfolio-1',
      image: buildRawImage(),
      caption: 'Sesión de familia en el parque',
      categories: [{ _id: 'cat-1', title: 'Familia', slug: 'familia' }],
      ...overrides,
    };
  }

  it('maps id, image, caption and categories', () => {
    const mapped = mapPortfolioItem(buildRaw());

    expect(mapped.id).toBe('portfolio-1');
    expect(mapped.caption).toBe('Sesión de familia en el parque');
    expect(mapped.categories).toEqual([{ id: 'cat-1', title: 'Familia', slug: 'familia' }]);
  });

  it('maps a null caption to undefined', () => {
    const mapped = mapPortfolioItem(buildRaw({ caption: null }));

    expect(mapped.caption).toBeUndefined();
  });

  it('maps a null categories list to an empty array', () => {
    const mapped = mapPortfolioItem(buildRaw({ categories: null }));

    expect(mapped.categories).toEqual([]);
  });

  it('keeps an empty categories list empty', () => {
    const mapped = mapPortfolioItem(buildRaw({ categories: [] }));

    expect(mapped.categories).toEqual([]);
  });
});

describe('mapServiceCard', () => {
  it('maps id, title, slug and image', () => {
    const raw: SERVICE_CATEGORIES_QUERY_RESULT[number] = {
      _id: 'service-1',
      title: 'Estudio',
      slug: 'estudio',
      image: buildRawImage(),
    };

    const mapped = mapServiceCard(raw);

    expect(mapped).toEqual({
      id: 'service-1',
      title: 'Estudio',
      slug: 'estudio',
      image: expect.objectContaining({ width: 1600, height: 1000 }),
    });
  });
});
