# Feature: verifier-hardening

Follow-up to PD-06 of `production-delivery` (see `odd/tasks/production-delivery.md`). Opened 2026-09-19, after the fifth review-bot round on pull requests #24 to #27 and #29.

## Objective

Make the build verifier read built HTML exactly as a browser does, make it share the page's own link classifier, and close the coverage gaps the fifth bot round found, without ever letting editor content fail a build.

## Problem and why

`src/lib/built-html.ts` is a hand-written HTML reader. Five bot rounds (6, 9, 10, 7 and 9 findings) kept finding places where it differs from the HTML standard: raw-text elements, tag-name delimiters, comment endings, character references, and where `<head>` ends. Each fix added special cases, and the pull requests reached the 1000-line limit. The evidence says the tool is wrong, not the patches. `parse5` implements the standard's parsing algorithm, is what `jsdom` uses, and is already installed through Vitest, so declaring it costs a few lockfile lines and no download. It is a devDependency used only by the verification script: nothing reaches the site.

Separately, the verifier has its own copy of the conversion-link classifier and rejects analytics attributes on any link it does not recognize. Two copies that must agree are a standing risk that editor content fails a build.

## Scope

In scope: a parse5-based reader; migrating the four consumers to it and deleting the hand-written tokenizer; the verifier importing `analyticsEventForHref`; Instagram links that are equivalent to the configured one; the remaining fifth-round findings listed under VH-03.

Out of scope: any change to the site's markup or runtime code other than the shared classifier, new budgets, Lighthouse in CI, the deploy workflow (PD-07) and the launch checklist (PD-08).

## Constraints and decisions

- `parse5` is declared as a devDependency at the version already resolved (8.0.1). No other dependency.
- New reader API, in a NEW file so slice 1 cannot conflict with the open stack: `readLiveElements(html): LiveElement[]` with `name` (lowercase, as the parser read it), `attrs` (decoded by the parser, first duplicate wins), `source` (the start tag as written, for problem messages), `inHead` (the tree builder placed it inside `<head>`) and `text` (text content of `script`, `style` and `title`, empty otherwise). Live means: in the document tree, not inside `<template>` content; `<noscript>` content is text because scripting is enabled, as in a browser; comments are not elements; elements the parser created implicitly are skipped.
- One parse per page: the reader memoizes the last few inputs, because every check reads the same two pages.
- `hasRelToken`, `parseHeadersFile` and `getHeader` are not HTML parsing and stay where they are.
- Every behavior the old reader's tests pinned and that still matters must be re-expressed as a test of the new reader BEFORE the old tests are deleted: alt text with `>` or markup-looking text, comments, `<noscript>`, `<template>`, a script containing a closing-tag lookalike, attribute order, case and quoting, character references, duplicate attributes, raw-text elements, `<plaintext>`, tag-name delimiters. New for free from the parser: the `--!>` comment ending, a body opened implicitly, and metas only counting in `<head>`.
- The inline-content hashes for the policy check use `text` exactly as the parser yields it; verified against a real build.
- The page classifier and the verifier change TOGETHER. The agreement check (the page classifier's output fed to `checkAnalyticsMarkup`, hostile links included) becomes a real test.
- Pull requests under 1000 authored lines, planned up front as three slices; independent read-only review before opening; ready means CI green and the review bot's verdict in. If the bot keeps producing findings about markup Astro never emits, they are declined with that reason instead of patched.
- Base: slices are written on local branches from the tip of the open stack and transplanted onto `main` once #24 to #27 and #29 are merged. Nothing is pushed before that.
- TDD: off (no project or session configuration enables it; the user did not request it). Source: default. Runner: Vitest (`pnpm test`).

## Delivery strategy

1. `feat/html-reader-parse5`: VH-01. New reader and its tests, the devDependency. No consumer yet.
2. `feat/verifier-on-parse5`: VH-02. Consumers migrated, tokenizer and its tests deleted.
3. `feat/verifier-shared-classifier`: VH-03. Needs #29 on `main`.

## Tasks

- [ ] VH-01 `src/lib/built-dom.ts` with `readLiveElements` over `parse5`, its tests (every pinned behavior above, plus `--!>`, implicit body, CRLF input, foreign content such as an SVG `<title>`), and `parse5` declared in `devDependencies` with a minimal lockfile change.
- [ ] VH-02 Migrate `build-verification-markup.ts`, `build-verification-policy.ts`, `build-verification-indexing.ts` and `build-measurement.ts` to `readLiveElements`; robots and policy metas count only when `inHead`; the analytics check uses the parser's tag name; delete the tokenizer half of `built-html.ts` and the tests that only pinned it. Both indexing modes verified on real builds; inline hashes verified against a real build.
- [ ] VH-03 The verifier imports `analyticsEventForHref`; Instagram equivalents (`http:`, a default port, a tracking query or fragment, a trailing slash, host case) recognized by that one function; the agreement test; `/api/` closed in every robots group by the longest-match comparison `blocksHomepage` already has; XML comments ignored when counting sitemap `<loc>`; every executable external script in the eager JavaScript budget; font URLs from linked stylesheets in the total font budget.

## Acceptance criteria

- The verifier's results on real builds are unchanged in both indexing modes, and every hostile input of the old reader's tests still gets the right answer.
- No hand-written HTML tokenizing remains in the repository.
- One function decides what a conversion link is, for the page and for the verifier.
- `pnpm check` passes without any secret or optional variable.

## Progress and evidence

- 2026-09-19 Opened. `parse5@8.0.1` confirmed installed through `jsdom` and `vitest` (`pnpm why parse5`); its `parse` takes `sourceCodeLocationInfo` and `scriptingEnabled` (default true), and implicitly created elements carry no source location. The user approved the devDependency.

## Next step

VH-01 by a delegated writer on `feat/html-reader-parse5`.
