/**
 * Development-only placeholder imagery. Real assets are owned by
 * `content-management` (Sanity) once that module lands; these references
 * exist so `site-foundation` and `studio-page` can validate layout, cropping,
 * and loading behavior before production photography is available.
 *
 * Deliberately typed for plain `<img>` usage (not Astro's `<Image>`), so the
 * build does not attempt to fetch or optimize these remote URLs.
 */

export interface PlaceholderImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface PortfolioPlaceholder extends PlaceholderImage {
  caption?: string;
}

export interface ServicePlaceholder extends PlaceholderImage {
  label: string;
}

export interface HeroPlaceholder {
  desktop: PlaceholderImage;
  mobile: PlaceholderImage;
}

export const heroPlaceholder: HeroPlaceholder = {
  desktop: {
    src: 'https://picsum.photos/seed/lh-hero/1366/850',
    alt: 'Retrato de familia al aire libre, imagen de referencia para desarrollo.',
    width: 1366,
    height: 850,
  },
  mobile: {
    src: 'https://picsum.photos/seed/lh-hero-m/393/560',
    alt: 'Retrato de familia al aire libre, imagen de referencia para desarrollo.',
    width: 393,
    height: 560,
  },
};

export const portfolioPlaceholders: PortfolioPlaceholder[] = [
  {
    src: 'https://picsum.photos/seed/lh-p1/480/600',
    alt: 'Fotografía de portafolio de referencia 1.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p2/480/600',
    alt: 'Fotografía de portafolio de referencia 2.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p3/480/600',
    alt: 'Fotografía de portafolio de referencia 3.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p4/480/600',
    alt: 'Fotografía de portafolio de referencia 4.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p5/480/600',
    alt: 'Fotografía de portafolio de referencia 5.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p6/480/600',
    alt: 'Fotografía de portafolio de referencia 6.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p7/480/600',
    alt: 'Fotografía de portafolio de referencia 7.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p8/480/600',
    alt: 'Fotografía de portafolio de referencia 8.',
    width: 480,
    height: 600,
  },
  {
    src: 'https://picsum.photos/seed/lh-p9/480/600',
    alt: 'Fotografía de portafolio de referencia 9.',
    width: 480,
    height: 600,
  },
];

export const biographyPortraitPlaceholder: PlaceholderImage = {
  src: 'https://picsum.photos/seed/lh-bio/600/800?grayscale',
  alt: 'Retrato de la fotógrafa Laury Herrera, imagen de referencia para desarrollo.',
  width: 600,
  height: 800,
};

export const servicePlaceholders: ServicePlaceholder[] = [
  {
    label: 'Estudio',
    src: 'https://picsum.photos/seed/lh-s1/600/600',
    alt: 'Sesión de estudio, imagen de referencia para desarrollo.',
    width: 600,
    height: 600,
  },
  {
    label: 'Exterior',
    src: 'https://picsum.photos/seed/lh-s2/600/600',
    alt: 'Sesión al exterior, imagen de referencia para desarrollo.',
    width: 600,
    height: 600,
  },
  {
    label: 'Domicilio',
    src: 'https://picsum.photos/seed/lh-s3/600/600',
    alt: 'Sesión a domicilio, imagen de referencia para desarrollo.',
    width: 600,
    height: 600,
  },
  {
    label: 'Eventos',
    src: 'https://picsum.photos/seed/lh-s4/600/600',
    alt: 'Sesión de eventos, imagen de referencia para desarrollo.',
    width: 600,
    height: 600,
  },
];
