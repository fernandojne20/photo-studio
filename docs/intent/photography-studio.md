# Photography Studio Website Intent

## Confirmed intent

- **Outcome:** Build a Spanish-language photography studio homepage that closely follows the supplied desktop and mobile designs.
- **Primary user:** A prospective photography client viewing the studio's work and deciding whether to make contact.
- **Content owner:** The photographer, who needs to update the site's principal imagery without editing code.
- **Why:** Present the studio's photography professionally while creating a direct, low-friction path to enquiries.
- **Primary conversion:** Start a WhatsApp conversation using a clear call to action.
- **Fallback conversion:** Submit the contact form.
- **Cost constraint:** Keep the initial application on viable free service tiers; the custom domain is excluded from this constraint.

## Version-one content

Sanity manages:

1. Hero imagery, with an optional mobile-specific image.
2. Portfolio grid imagery, categories, ordering, visibility, alternative text, and optional captions.
3. Biography portrait, biography text, and biography CTA when present.
4. Service/category cards, including their imagery, titles, ordering, and visibility.

Project configuration files manage:

- WhatsApp number and default message.
- Contact information.
- Instagram link.
- Navigation configuration.
- General site copy outside the biography.

## Experience

- Reproduce the supplied desktop and mobile layouts responsively rather than treating either as a fixed-size canvas.
- Use the supplied Adelia, Futura BT Light, DM Sans Variable, and Minion Variable Concept fonts, subject to confirmation of web-use licensing.
- Account for Montserrat Medium, which is embedded in the supplied design but absent from the supplied font folder.
- Use representative placeholder photography during development so layout, cropping, loading, and interactions can be validated before production assets are available.
- Open portfolio-grid images in an animated lightbox with previous/next navigation, keyboard controls, swipe gestures, accessible dismissal, optional captions, and reduced-motion behavior.
- Present service/category cards as a desktop carousel when their number exceeds available space. Show approximately four cards at the design width.
- Apply a restrained image-zoom effect on hover-capable devices. The design annotation "zoom cuando pasas el mouse" must not appear as page content.
- Use a mobile-appropriate service layout, initially matching the vertically stacked design rather than relying on hover behavior.
- Keep the contact form available as a fallback to WhatsApp and protect it against automated spam.

## Technical direction

- Astro with TypeScript for the site.
- Astro scoped CSS and shared design tokens for visual implementation.
- Sanity for structured content and image delivery.
- Embla Carousel for service-card carousel behavior where required.
- An accessible lightbox implementation selected during specification.
- Cloudflare Workers with Static Assets for hosting.
- Cloudflare Turnstile and Resend for the contact form.
- GitHub for source control and automated delivery.

## Success

The first release succeeds when a visitor can comfortably browse the studio homepage on mobile and desktop, inspect portfolio images in a polished lightbox, understand the available services, and begin an enquiry through WhatsApp or the contact form. The photographer can replace and reorder the principal imagery and edit the biography area through Sanity without a code change.

## Out of scope for version one

- Separate pages for Exteriores, Domicilio, Eventos, or Temporada.
- Links that lead to unfinished category pages.
- Online appointment scheduling or payment.
- Multiple languages.
- CMS editing for contact details, general site copy, navigation, or social links.
- Final production photography and final production copy where these have not yet been supplied.

## Design references

- Layout export: `/Users/fernandojnestudio/Downloads/MAQUETA PAG WEB_tr.ps`
- Font folder: `/Users/fernandojnestudio/Downloads/Photography studio`
