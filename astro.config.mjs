// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Adelia',
      cssVariable: '--font-adelia',
      fallbacks: ['cursive'],
      options: {
        variants: [
          {
            weight: '400',
            style: 'normal',
            src: ['./src/assets/fonts/adelia.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Futura Light BT',
      cssVariable: '--font-futura-light',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            weight: '300',
            style: 'normal',
            src: ['./src/assets/fonts/futura-light-bt.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'DM Sans',
      cssVariable: '--font-dm-sans',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            // Variable font axis range confirmed from the source file's `fvar` table.
            weight: '100 1000',
            style: 'normal',
            src: ['./src/assets/fonts/dm-sans-variable.ttf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Minion Variable Concept',
      cssVariable: '--font-minion',
      fallbacks: ['serif'],
      options: {
        variants: [
          {
            // Variable font axis range confirmed from the source file's `fvar` table.
            weight: '400 700',
            style: 'normal',
            src: ['./src/assets/fonts/minion-variable-concept-roman.otf'],
          },
        ],
      },
    },
    {
      provider: fontProviders.google(),
      name: 'Montserrat',
      cssVariable: '--font-montserrat',
      weights: [500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
  ],
});
