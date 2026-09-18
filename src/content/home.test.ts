import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HOME_PAGE_QUERY_RESULT,
  PORTFOLIO_IMAGES_QUERY_RESULT,
  SERVICE_CATEGORIES_QUERY_RESULT,
} from '../sanity/sanity.types';
import {
  HOME_PAGE_QUERY,
  PORTFOLIO_IMAGES_QUERY,
  SERVICE_CATEGORIES_QUERY,
} from '../sanity/queries';

/**
 * `sanityClient.fetch` is heavily overloaded in `@sanity/client`'s types
 * (generic result inferred from the literal query string via the global
 * `SanityQueries` registry), which makes it awkward to type through
 * `vi.mocked`. `vi.hoisted` gives us a plainly-typed mock we control
 * directly, wired into the module mock below.
 */
const fetchMock = vi.hoisted(() => vi.fn<(query: string) => Promise<unknown>>());

vi.mock('../sanity/client', () => ({
  sanityClient: { fetch: fetchMock },
}));

import { getHomeContent } from './home';

type HomePageDoc = NonNullable<HOME_PAGE_QUERY_RESULT>;
type RawImage = NonNullable<PORTFOLIO_IMAGES_QUERY_RESULT[number]['image']>;

function rawImage(id: string): RawImage {
  return {
    asset: {
      _id: `image-${id}-800x600-jpg`,
      url: `https://cdn.sanity.io/images/testproject/testdataset/${id}-800x600.jpg`,
      metadata: { lqip: null, dimensions: { width: 800, height: 600, aspectRatio: 1.333 } },
    },
    alt: `Imagen ${id}`,
    hotspot: null,
    crop: null,
  };
}

const completeHomeDoc: HomePageDoc = {
  hero: {
    image: rawImage('hero'),
    mobileImage: rawImage('hero-mobile'),
  },
  biography: {
    portrait: rawImage('bio'),
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'Hola', marks: [] }],
      },
    ],
    cta: { label: 'Reserva tu sesión', target: 'whatsapp', url: null },
  },
};

const heroOnlyHomeDoc: HomePageDoc = {
  hero: completeHomeDoc.hero,
  biography: null,
};

const biographyOnlyHomeDoc: HomePageDoc = {
  hero: null,
  biography: completeHomeDoc.biography,
};

const nonEmptyPortfolio: PORTFOLIO_IMAGES_QUERY_RESULT = [
  {
    _id: 'portfolio-1',
    image: rawImage('portfolio-1'),
    caption: 'Sesión familiar',
    categories: [{ _id: 'cat-1', title: 'Familia', slug: 'familia' }],
  },
];

const nonEmptyServices: SERVICE_CATEGORIES_QUERY_RESULT = [
  {
    _id: 'service-1',
    title: 'Estudio',
    slug: 'estudio',
    image: rawImage('service-1'),
  },
];

function mockFetchResolving(responses: {
  home: HOME_PAGE_QUERY_RESULT;
  portfolio: PORTFOLIO_IMAGES_QUERY_RESULT;
  services: SERVICE_CATEGORIES_QUERY_RESULT;
}) {
  fetchMock.mockImplementation((query) => {
    if (query === HOME_PAGE_QUERY) return Promise.resolve(responses.home);
    if (query === PORTFOLIO_IMAGES_QUERY) return Promise.resolve(responses.portfolio);
    if (query === SERVICE_CATEGORIES_QUERY) return Promise.resolve(responses.services);
    return Promise.reject(new Error(`Unexpected query in test: ${query}`));
  });
}

function mockFetchRejecting(error: Error) {
  fetchMock.mockImplementation(() => Promise.reject(error));
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('getHomeContent fallback policy', () => {
  it('returns every section from sanity with no warnings when all content is present', async () => {
    mockFetchResolving({
      home: completeHomeDoc,
      portfolio: nonEmptyPortfolio,
      services: nonEmptyServices,
    });

    const result = await getHomeContent({ fallbacks: 'deny' });

    expect(result.meta.sources).toEqual({
      hero: 'sanity',
      biography: 'sanity',
      portfolio: 'sanity',
      services: 'sanity',
    });
    expect(result.meta.warnings).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to placeholders for every section, with one warning naming the failure reason, when the fetch rejects and fallbacks are allowed', async () => {
    mockFetchRejecting(new Error('network down'));

    const result = await getHomeContent({ fallbacks: 'allow' });

    expect(result.meta.sources).toEqual({
      hero: 'placeholder',
      biography: 'placeholder',
      portfolio: 'placeholder',
      services: 'placeholder',
    });
    const expectedWarning =
      '[content] Failed to fetch content from Sanity, using placeholders. (network down)';
    expect(result.meta.warnings[0]).toContain('[content]');
    expect(result.meta.warnings).toEqual([expectedWarning]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expectedWarning);
  });

  it('throws with the original error as cause when the fetch rejects and fallbacks are denied', async () => {
    const original = new Error('network down');
    mockFetchRejecting(original);

    await expect(getHomeContent({ fallbacks: 'deny' })).rejects.toMatchObject({
      message: expect.stringContaining('fallbacks are disabled'),
      cause: original,
    });
  });

  it('throws the actionable "Página de inicio" message when the homePage document is missing and fallbacks are denied', async () => {
    mockFetchResolving({ home: null, portfolio: nonEmptyPortfolio, services: nonEmptyServices });

    await expect(getHomeContent({ fallbacks: 'deny' })).rejects.toThrow(/Página de inicio/);
  });

  it('uses placeholder hero and biography but keeps sanity portfolio and services when homePage is missing and fallbacks are allowed', async () => {
    mockFetchResolving({ home: null, portfolio: nonEmptyPortfolio, services: nonEmptyServices });

    const result = await getHomeContent({ fallbacks: 'allow' });

    expect(result.meta.sources).toEqual({
      hero: 'placeholder',
      biography: 'placeholder',
      portfolio: 'sanity',
      services: 'sanity',
    });
    expect(result.portfolio).toHaveLength(nonEmptyPortfolio.length);
    expect(result.services).toHaveLength(nonEmptyServices.length);
    expect(result.meta.warnings).toEqual([
      '[content] Missing hero content, using placeholders.',
      '[content] Missing biography content, using placeholders.',
    ]);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      '[content] Missing hero content, using placeholders.',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      '[content] Missing biography content, using placeholders.',
    );
  });

  it('keeps hero from sanity but falls back to placeholder biography when only biography is missing and fallbacks are allowed', async () => {
    mockFetchResolving({
      home: heroOnlyHomeDoc,
      portfolio: nonEmptyPortfolio,
      services: nonEmptyServices,
    });

    const result = await getHomeContent({ fallbacks: 'allow' });

    expect(result.meta.sources.hero).toBe('sanity');
    expect(result.meta.sources.biography).toBe('placeholder');
    expect(result.meta.warnings).toEqual([
      '[content] Missing biography content, using placeholders.',
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[content] Missing biography content, using placeholders.',
    );
  });

  it('keeps biography from sanity but falls back to placeholder hero when only hero is missing and fallbacks are allowed', async () => {
    mockFetchResolving({
      home: biographyOnlyHomeDoc,
      portfolio: nonEmptyPortfolio,
      services: nonEmptyServices,
    });

    const result = await getHomeContent({ fallbacks: 'allow' });

    expect(result.meta.sources.hero).toBe('placeholder');
    expect(result.meta.sources.biography).toBe('sanity');
    expect(result.meta.warnings).toEqual(['[content] Missing hero content, using placeholders.']);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[content] Missing hero content, using placeholders.');
  });

  it('throws a message naming "biography" when only biography is missing and fallbacks are denied', async () => {
    mockFetchResolving({
      home: heroOnlyHomeDoc,
      portfolio: nonEmptyPortfolio,
      services: nonEmptyServices,
    });

    await expect(getHomeContent({ fallbacks: 'deny' })).rejects.toThrow(/biography/);
  });

  it('throws a message naming "hero" when only hero is missing and fallbacks are denied', async () => {
    mockFetchResolving({
      home: biographyOnlyHomeDoc,
      portfolio: nonEmptyPortfolio,
      services: nonEmptyServices,
    });

    await expect(getHomeContent({ fallbacks: 'deny' })).rejects.toThrow(/hero/);
  });

  it('returns empty portfolio and services arrays with no warnings when the lists are empty and fallbacks are denied', async () => {
    mockFetchResolving({ home: completeHomeDoc, portfolio: [], services: [] });

    const result = await getHomeContent({ fallbacks: 'deny' });

    expect(result.portfolio).toEqual([]);
    expect(result.services).toEqual([]);
    expect(result.meta.sources.portfolio).toBe('sanity');
    expect(result.meta.sources.services).toBe('sanity');
    expect(result.meta.warnings).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to placeholder lists with warnings when the lists are empty and fallbacks are allowed', async () => {
    mockFetchResolving({ home: completeHomeDoc, portfolio: [], services: [] });

    const result = await getHomeContent({ fallbacks: 'allow' });

    expect(result.meta.sources.portfolio).toBe('placeholder');
    expect(result.meta.sources.services).toBe('placeholder');
    expect(result.portfolio.length).toBeGreaterThan(0);
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.meta.warnings).toEqual([
      '[content] No portfolio images found, using placeholders.',
      '[content] No service categories found, using placeholders.',
    ]);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      '[content] No portfolio images found, using placeholders.',
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      '[content] No service categories found, using placeholders.',
    );
  });

  it('allows fallbacks through CONTENT_FALLBACKS=true when no explicit option is given', async () => {
    vi.stubEnv('CONTENT_FALLBACKS', 'true');
    mockFetchRejecting(new Error('network down'));

    const result = await getHomeContent();

    expect(result.meta.sources.hero).toBe('placeholder');
    expect(result.meta.warnings).toHaveLength(1);
  });

  // Vitest defaults `import.meta.env.DEV` to true, which already allows
  // fallbacks on its own, so a "default denies fallbacks outside dev" case
  // cannot be isolated from the CONTENT_FALLBACKS switch above by stubbing
  // env vars: `vi.stubEnv('DEV', ...)` only patches `process.env.DEV`, and
  // `import.meta.env.DEV` is a separate Vite-managed boolean that Vitest
  // does not expose a supported way to override per test. The
  // fallbacks-denied code path this would exercise is already covered by
  // the explicit `fallbacks: 'deny'` tests above, which take the same
  // `!allowFallbacks` branch in `getHomeContent`.
});
