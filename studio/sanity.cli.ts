import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'r781btme',
    dataset: 'production',
  },
  vite: (config) => ({
    ...config,
    ssr: {
      ...config.ssr,
      external: ['lexorank'],
    },
  }),
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
    // Hosted Studio application id (https://laury-herrera.sanity.studio).
    appId: 'pafio1dfnssyspf3p4kpwwu6',
  },
  typegen: {
    // Queries live in the Astro site (`../src`), not the Studio.
    path: '../src/**/*.{ts,astro}',
    schema: 'schema.json',
    generates: '../src/sanity/sanity.types.ts',
    overloadClientMethods: true,
    // Keep generation explicit: `pnpm typegen` runs extract + generate by
    // hand instead of on every `sanity dev`/`sanity build`.
    enabled: false,
  },
})
