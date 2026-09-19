/**
 * Generates the static Open Graph/Twitter Card sharing-image fallback
 * (`public/og-fallback.png`), used by `resolveShareImage`
 * (`src/lib/seo-image.ts`) when the homepage hero has no Sanity source (see
 * `odd/tasks/production-delivery.md`, PD-02). No photograph exists in this
 * repository, so the fallback is a brand card, not a photo: the `lh`
 * monogram (`src/assets/logo/lh-monogram.svg`) centered on a plain card, in
 * the same colors as the page (`--color-text` on `--color-bg`, from
 * `src/styles/tokens.css`). No text: the brand fonts are not available to a
 * rasterizer, and a substitute font would misrepresent the brand.
 *
 * Deterministic: reads the same SVG, computes the same layout and asks
 * `sharp` for the same encoding every time, so re-running this script on
 * the same platform produces a byte-identical file.
 *
 * Run with:
 *
 *   pnpm share-image:generate
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MONOGRAM_SVG_PATH = `${ROOT}src/assets/logo/lh-monogram.svg`;
const OUTPUT_PATH = `${ROOT}public/og-fallback.png`;

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
// Large enough to read in a small link preview, with generous margins.
const MONOGRAM_HEIGHT_RATIO = 0.45;
const BACKGROUND_COLOR = '#ffffff'; // --color-bg, src/styles/tokens.css
const MONOGRAM_COLOR = '#4a4a4a'; // --color-text, src/styles/tokens.css

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Reads the monogram's own `viewBox` instead of hardcoding its numbers a second time. */
function readViewBox(svg: string): ViewBox {
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) {
    throw new Error(`No viewBox attribute found in ${MONOGRAM_SVG_PATH}`);
  }
  const [minX, minY, width, height] = match[1].split(/\s+/).map(Number);
  return { minX, minY, width, height };
}

/** The monogram's own `<g>` (its three paths), reused verbatim. */
function readGroup(svg: string): string {
  const match = svg.match(/<g[\s\S]*<\/g>/);
  if (!match) {
    throw new Error(`No <g> element found in ${MONOGRAM_SVG_PATH}`);
  }
  return match[0];
}

/**
 * Builds the 1200x630 card as SVG: a flat background rect, and the
 * monogram's own group re-embedded in a nested, sized/positioned `<svg>`
 * that reuses its original `viewBox` (so the monogram's own proportions
 * decide the scaling, not a hand-picked transform). The nested element
 * carries `fill` directly (the monogram's own paths set none, only
 * inheriting `currentColor` from its original root `<svg>`, which this
 * card does not reuse), so the whole shape renders in `MONOGRAM_COLOR`.
 */
function buildCardSvg(monogramSvg: string): string {
  const viewBox = readViewBox(monogramSvg);
  const group = readGroup(monogramSvg);

  const monogramHeight = CARD_HEIGHT * MONOGRAM_HEIGHT_RATIO;
  const monogramWidth = monogramHeight * (viewBox.width / viewBox.height);
  const x = (CARD_WIDTH - monogramWidth) / 2;
  const y = (CARD_HEIGHT - monogramHeight) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BACKGROUND_COLOR}"/>
  <svg x="${x}" y="${y}" width="${monogramWidth}" height="${monogramHeight}" viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" fill="${MONOGRAM_COLOR}">
    ${group}
  </svg>
</svg>
`;
}

async function main() {
  const monogramSvg = readFileSync(MONOGRAM_SVG_PATH, 'utf-8');
  const cardSvg = buildCardSvg(monogramSvg);

  // The background rect already covers the whole canvas opaquely, so
  // `flatten` drops the otherwise-unused alpha channel entirely (letting
  // PNG encode as plain 8-bit grayscale instead of grayscale+alpha); both
  // colors are achromatic (equal R/G/B), so grayscale loses nothing.
  // Palette/`effort` quantization is left off on purpose (it also enables
  // Floyd-Steinberg dithering), since it would only trade a few bytes for
  // visible noise on a flat two-tone card.
  await sharp(Buffer.from(cardSvg))
    .flatten({ background: BACKGROUND_COLOR })
    .toColourspace('b-w')
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT_PATH);

  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
