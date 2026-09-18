# Feature: ci-validation

Pulled forward from `production-delivery` ("automated verification") at the user's request, before the interactive modules land. No module dependency beyond the current `main`.

## Objective

Every pull request and every push to `main` runs automated checks on GitHub Actions: lint, format check, type check, generated-types drift check, and production builds of the site and the Studio. The same checks run locally through package scripts.

## Problem and why

The repository has no lint or format tooling and no CI. Delivery now goes through pull requests, so reviewers (human and automated) need a machine-verified baseline, and regressions such as stale generated types or a broken Studio build should fail before merge.

## Scope

In scope:

- Root tooling: ESLint 10 flat config for TypeScript and Astro (`typescript-eslint`, `eslint-plugin-astro`, accessibility rules for `.astro` templates when a compatible a11y plugin exists), Prettier 3 with `prettier-plugin-astro`, ignore files.
- Scripts at the root: `lint`, `lint:fix`, `format`, `format:check`, `typecheck` (`astro check`), `typegen:check` (regenerate and fail on diff), `check` (everything, for local use). Scripts in `studio/`: `lint`, `typecheck` (`tsc --noEmit`), `format:check`.
- One-time formatting pass over the existing source, in its own commit.
- `.nvmrc` (Node 24) and the `packageManager` field (pnpm 10.30.3) so CI and local runs use the same toolchain.
- `.github/workflows/ci.yml` with three jobs, `lint`, `typecheck`, `build`, on `pull_request` and `push` to `main`, with pnpm caching, `--frozen-lockfile`, concurrency cancellation and read-only permissions.
- README section describing the checks.

Out of scope: a test runner and tests (none exist today; decision pending with the user), deployment workflows, Dependabot or Renovate, branch protection rules (repository setting, needs explicit authorization), content monitoring of the Sanity dataset.

## Constraints and decisions

- Action versions verified on 2026-09-18: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`.
- Package versions verified on 2026-09-18: `eslint@10.10.0`, `typescript-eslint@8.70.0` (TypeScript `<6.1.0`, compatible with the root TypeScript 6.0.3), `eslint-plugin-astro@3.2.1` (needs ESLint >= 10), `astro-eslint-parser@3.1.0`, `prettier@3.9.8`, `prettier-plugin-astro@1.0.1`. `eslint-plugin-jsx-a11y@6.10.2` only declares ESLint <= 9; evaluate `eslint-plugin-jsx-a11y-x` (listed as an alternative peer by the Astro plugin) and enable the a11y config only if it installs cleanly on ESLint 10.
- CI validates code, not content: the site build runs with `CONTENT_FALLBACKS=true` so an editor's change or a Sanity outage cannot turn a pull request red. The strict production build stays with the future deploy workflow. `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET` are public values set in the workflow `env`; no secrets are needed.
- The generated file `src/sanity/sanity.types.ts` is excluded from ESLint and Prettier. TypeGen formats its own output with Prettier, so adding a root Prettier config may change that output: regenerate after adding the config and commit the result so `typegen:check` starts green.
- `studio/` keeps its own ESLint config (`@sanity/eslint-config-studio`) and its own Prettier settings (no semicolons); the root tools ignore `studio/`.
- Prettier settings for the site follow the existing code: 2 spaces, single quotes, semicolons, print width 100.
- Lint findings in existing code are fixed, not silenced. A rule is disabled only with a written reason in the config.
- Conventional commits: `ci:` for the workflow, `chore:` for tooling, `style:` for the formatting pass.

## Delivery strategy

User rule (2026-09-18): keep pull requests under 1000 changed lines of reviewable, authored code and slice bigger work into stacked pull requests. A larger raw diff is valid when it comes from content nobody reviews line by line, such as a `pnpm-lock.yaml` update, generated types, or a purely mechanical formatter pass; those are not split artificially. Planned stack, each green on its own:

1. `ci/tooling`: toolchain pins, ESLint and Prettier configuration, scripts, lint fixes, README. No workflow yet, so nothing can be red.
2. `ci/format` (on 1): the mechanical formatting pass only. It may exceed the limit legitimately because it is a formatter run with no behavior change; it stays one pull request.
3. `ci/workflow` (on 2): `.github/workflows/ci.yml`. Its first run happens on an already formatted tree.
4. `ci/tests` (on 3): Vitest, unit tests for the pure logic (WhatsApp URL builder, srcset and aspect-ratio helper, Sanity mappers, fallback policy), a `test` script and a `test` job in the workflow. The user approved adding tests, as a stacked pull request.

`pnpm-lock.yaml` and `src/sanity/sanity.types.ts` are generated; pull request bodies report authored lines separately from them.

## TDD

- Mode: off (no project or session configuration enables it; the user did not request it).
- Source: default.
- Runner: none. Functional checks are the new scripts themselves, `actionlint` on the workflow, and the workflow run on the pull request.

## Tasks

- [x] CI-01 Toolchain pins and tooling: `.nvmrc`, `packageManager`, ESLint flat config, Prettier config and ignore files, root and Studio scripts. `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm typegen:check`, `pnpm --filter studio lint`, `pnpm --filter studio typecheck` all pass locally, with findings fixed in code.
- [x] CI-02 One-time formatting pass (`pnpm format`) in its own commit, no behavior change; regenerate types if the TypeGen output changed.
- [x] CI-03 `.github/workflows/ci.yml` with the `lint`, `typecheck`, `build` jobs; `actionlint` passes.
- [x] CI-04 README "Checks" section: what runs in CI and how to run it locally.
- [ ] CI-05 Verify on GitHub: open the pull request and confirm the three jobs pass on the pull request run.

## Acceptance criteria

- A pull request shows three checks (`lint`, `typecheck`, `build`) and all pass on the branch that introduces them.
- `pnpm check` runs the same validations locally and exits non-zero on any failure.
- Changing a schema or query without regenerating types fails `typegen:check`.
- No lint rule is disabled without a documented reason; no source behavior changes in the formatting commit.

## Progress and evidence

- 2026-09-18 Delivery adjusted after measuring: the change is about 940 authored and mechanical lines (tooling 205, findings 17, formatter pass 580, workflow and README 136) plus about 360 lines of lockfile and regenerated types, so items 1 to 3 of the planned stack ship as one pull request from `ci/github-actions` with four commits. The tests remain a stacked pull request on top.
- 2026-09-18 CI-01 to CI-04 done by one delegated writer (Sonnet). Writer evidence: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (0 errors), Studio `lint`, `typecheck`, `format:check`, `CONTENT_FALLBACKS=true pnpm build`, `pnpm studio:build` and `actionlint` all exit 0; `pnpm typegen:check` negative test: renaming a projected field in a query makes it exit 1 with the diff, and a stray edit to the generated file is overwritten and passes. Findings fixed in code: `preserve-caught-error` in `src/content/home.ts` (added `{ cause: error }`), a stale `eslint-disable` directive, a real `tsc` error in the Studio preview. One rule disabled with a written reason: `astro/jsx-a11y/no-redundant-roles`, because `global.css` relies on explicit `role="list"` for the Safari/VoiceOver list fix. `eslint-plugin-jsx-a11y-x` works with ESLint 10, so template accessibility rules are on. Upstream bug worked around: `prettier-plugin-astro@1.0.1` re-indents multi-line CSS comments in `.astro` style blocks on every pass without converging; two comments were collapsed to one line.
- 2026-09-18 Parent changes after readback: `pull_request` has no base-branch filter so stacked pull requests are validated; `pnpm/action-setup` is pinned to commit `ea17c68df8912ef543352723c149a84f56e3d413` (v6.1.0, annotated tag dereferenced), GitHub-owned actions stay on `v7`. Hand fixes were committed separately from formatter output by restoring the three mixed files to `HEAD`, applying only the hand edits, and restoring the writer's final versions for the `style:` commit.
- 2026-09-18 Native risk assessment: `high` (`shell_source` in the workflow), so an independent read-only verifier re-ran everything: 13 commands exit 0, tree clean; formatting commit sampled in 9 of 21 files with token-level comparison, pure; workflow security reviewed (read-only permissions, no secrets, fork runs have nothing to reach, SHA pin matches a GPG-verified v6.1.0 tag, `node-version-file` and `cache: pnpm` valid for `setup-node@v7`, `packageManager` honored by `action-setup`); ESLint confirmed to parse `.astro` frontmatter and inline scripts with `typescript-eslint`. One should-fix accepted: the Studio preview fix had dropped the whole `prepare()` parameter type, making `alt` and `caption` `any`; now `media` is typed with `PreviewValue['media']` and the other two stay typed, verified with a negative test, and folded into the findings commit.

## Next step

CI-05: open the pull request and confirm the `lint`, `typecheck` and `build` jobs pass on GitHub. Then the stacked tests pull request.
