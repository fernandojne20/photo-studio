/**
 * Reads Sanity project configuration from the environment. Works both under
 * Astro/Vite (`import.meta.env`) and under plain Node scripts (`process.env`,
 * e.g. `node --env-file=.env scripts/print-home-content.ts`).
 */

interface RuntimeEnv {
  PUBLIC_SANITY_PROJECT_ID?: string
  PUBLIC_SANITY_DATASET?: string
}

function readEnv(): RuntimeEnv {
  const metaEnv =
    typeof import.meta !== 'undefined' ? (import.meta as {env?: RuntimeEnv}).env : undefined
  if (metaEnv?.PUBLIC_SANITY_PROJECT_ID || metaEnv?.PUBLIC_SANITY_DATASET) {
    return metaEnv
  }
  return {
    PUBLIC_SANITY_PROJECT_ID: process.env.PUBLIC_SANITY_PROJECT_ID,
    PUBLIC_SANITY_DATASET: process.env.PUBLIC_SANITY_DATASET,
  }
}

const env = readEnv()

const missing: string[] = []
if (!env.PUBLIC_SANITY_PROJECT_ID) missing.push('PUBLIC_SANITY_PROJECT_ID')
if (!env.PUBLIC_SANITY_DATASET) missing.push('PUBLIC_SANITY_DATASET')

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. Copy .env.example to .env and fill them in.`,
  )
}

export const projectId = env.PUBLIC_SANITY_PROJECT_ID as string
export const dataset = env.PUBLIC_SANITY_DATASET as string
export const apiVersion = '2026-09-17'
