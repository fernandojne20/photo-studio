// @ts-check
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Type-aware rules are not enabled: they need a project service per package
// and are not required by this task, so the config sticks to the
// non-type-checked `recommended` rule sets.
export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'studio/',
      'tmp/',
      '.playwright-mcp/',
      '.atl/',
      'src/sanity/sanity.types.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  eslintPluginAstro.configs.recommended,
  // `jsx-a11y-recommended` extends `eslint-plugin-jsx-a11y-x` rules for
  // `.astro` templates (see `astro/jsx-a11y/*`); the a11y plugin itself is
  // resolved internally by `eslint-plugin-astro`, no explicit import needed.
  eslintPluginAstro.configs['jsx-a11y-recommended'],
  {
    // Astro component frontmatter (the `---` script block) runs server-side
    // at build/SSR time, like every other `.ts` module in this project.
    files: ['**/*.astro', '**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Node-only entry points: CLI scripts and build/config files.
    files: ['scripts/**', '*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Inline `<script>` blocks inside `.astro` files are shipped to, and run
    // in, the browser. `eslint-plugin-astro` lints them as virtual
    // `*.astro/*.js` / `*.astro/*.ts` files.
    files: ['**/*.astro/*.js', '**/*.astro/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.astro'],
    rules: {
      // `src/styles/global.css` resets `ul[role='list'], ol[role='list']` to
      // restore list semantics after `list-style: none`, a documented fix
      // for Safari/VoiceOver dropping the implicit list role (see
      // https://www.scottohara.me/blog/2019/01/12/lists-and-safari.html).
      // The explicit `role="list"` is required by that fix, not redundant.
      'astro/jsx-a11y/no-redundant-roles': 'off',
    },
  },
);
