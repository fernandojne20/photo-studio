/**
 * Exercises the content port against the live dataset without going through
 * an Astro build. Run with:
 *
 *   node --env-file=.env --import tsx scripts/print-home-content.ts
 *
 * Node's native TypeScript type stripping (unflagged on Node >= 23.6) cannot
 * run this file directly: Node's ESM resolver requires explicit file
 * extensions on relative imports, while the rest of this project (and Astro
 * itself) uses extensionless imports resolved by the bundler. `tsx` handles
 * that resolution instead, so the script imports plain `./content/home`
 * paths like every other file in `src/`.
 */
import { getHomeContent } from '../src/content/home';

async function main() {
  const content = await getHomeContent({ fallbacks: 'allow' });
  const { sources } = content.meta;

  console.log('Home content report');
  console.log('--------------------');
  console.log(`hero:       ${sources.hero}`);
  console.log(`biography:  ${sources.biography}`);
  console.log(`portfolio:  ${sources.portfolio} (${content.portfolio.length} item(s))`);
  console.log(`services:   ${sources.services} (${content.services.length} item(s))`);

  if (content.meta.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const message of content.meta.warnings) {
      console.log(`  - ${message}`);
    }
  } else {
    console.log('\nWarnings: none');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
