# Capability Map: Photography Studio Website

This map decomposes version one into independently testable modules. Module IDs are stable and should be used by specifications, plans, and tasks.

| Module ID             | Responsibility                                                                                                                                                       | Depends on                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `site-foundation`     | Establish the Astro and TypeScript project, design tokens, font loading, static configuration, shared layout, and development-quality placeholder assets.            | -                                          |
| `content-management`  | Define and deploy the Sanity Studio schemas, editorial validation, image metadata, ordering, generated types, content queries, and preview/fallback behavior.        | `site-foundation`                          |
| `studio-page`         | Build the responsive Spanish homepage and connect its hero, welcome, portfolio, biography, services, contact, and footer sections to their approved content sources. | `site-foundation`, `content-management`    |
| `media-interactions`  | Provide the portfolio lightbox, service carousel, hover zoom, touch behavior, keyboard interaction, focus management, and reduced-motion handling.                   | `studio-page`                              |
| `contact-conversion`  | Implement WhatsApp deep linking and the fallback contact form using validation, Turnstile, server-side delivery, and user-facing success/error states.               | `studio-page`                              |
| `production-delivery` | Add SEO metadata, social sharing, analytics-ready hooks, performance budgets, automated verification, and Cloudflare deployment.                                     | `media-interactions`, `contact-conversion` |

## Proposed build order

`site-foundation` -> `content-management` -> `studio-page` -> (`media-interactions` and `contact-conversion`) -> `production-delivery`

`media-interactions` and `contact-conversion` can be developed in parallel after the responsive page structure is stable.

## Boundary notes

- `content-management` owns the contract between Sanity and the frontend, including schema names, data shapes, queries, and fallback behavior.
- `studio-page` consumes that contract and owns visual composition; it does not duplicate CMS query logic.
- `media-interactions` enhances usable static content. Core images and service cards must remain readable if client-side JavaScript fails.
- `contact-conversion` owns enquiry submission and spam protection. It does not introduce appointment scheduling.
- Category-page routes are deliberately excluded until their designs and content requirements are approved.
