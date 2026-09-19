import type { ContactErrorCode } from '../contact/types';

/**
 * Static, non-CMS site configuration: contact details, navigation, and
 * general copy that lives outside the biography (owned by `content-management`
 * once Sanity is wired up). See `docs/intent/photography-studio.md` and
 * `CAPABILITY-MAP.md` for the module boundary.
 */

export interface WhatsAppConfig {
  /** E.164 phone number, digits only after the leading `+`. */
  phoneE164: string;
  /** Default message pre-filled in the WhatsApp chat window. */
  defaultMessage: string;
}

export interface ContactConfig {
  email: string;
  /** Human-readable phone number, as shown in the footer and contact section. */
  phoneDisplay: string;
  /** Same number in E.164 form, for `tel:` links. */
  phoneE164: string;
}

export interface InstagramConfig {
  url: string;
  /** TODO: confirm handle with the client. */
  handle: string;
}

export type NavItemKind = 'anchor' | 'page' | 'whatsapp';

export interface NavItem {
  id: string;
  label: string;
  /**
   * Destination for `anchor` and `page` items. `whatsapp` items resolve
   * their href at render time via `buildWhatsAppUrl` instead.
   */
  href?: string;
  /**
   * Hidden items stay defined until their pages exist (product decision,
   * see `odd/tasks/site-foundation.md`). They must not render in the DOM.
   */
  visible: boolean;
  kind: NavItemKind;
}

export interface ContactCopy {
  heading: string;
  intro: string;
  paragraph: string;
  alternativeIntro: string;
  alternativeCall: string;
}

/** One Spanish message per domain error code from `src/contact/types.ts`. */
export type ContactFormErrorMessages = Record<ContactErrorCode, string>;

export interface ContactFormNoscriptCopy {
  message: string;
  whatsappCta: string;
  emailCta: string;
}

export interface ContactFormLabels {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  submit: string;
  /** Button label and status text while the request is in flight. */
  sending: string;
  /** Status text once the server confirms the message was sent. */
  success: string;
  /** Explains the `*` marker next to the required field. */
  requiredNote: string;
  /** Hidden label for the honeypot input (see `Contact.astro`); never seen or announced. */
  honeypotLabel: string;
  errors: ContactFormErrorMessages;
  /** Form-level error: a captcha failure before the request ever reached the server (script load, render, or verification failure). Never suggests refreshing: that would discard what the visitor typed, and a blocked script would not be fixed by a reload anyway. */
  captchaFailed: string;
  /** Form-level error: delivery is not configured yet (tells the visitor to use WhatsApp or e-mail). */
  notConfigured: string;
  /** Form-level error: Resend rejected or failed to deliver the message. */
  deliveryFailed: string;
  /** Form-level error: anything else (network failure, timeout, unreadable response). */
  network: string;
  /** Polite instruction shown while an interactive Turnstile challenge is visible. */
  interactiveChallenge: string;
  noscript: ContactFormNoscriptCopy;
}

export interface BiographyFallbackCopy {
  name: string;
  paragraphs: [string, string, string, string];
}

export interface AccessibilityLabels {
  openMenu: string;
  closeMenu: string;
  mainMenu: string;
  whatsapp: string;
  instagram: string;
  goHome: string;
  skipToContent: string;
  lightboxClose: string;
  lightboxZoom: string;
  lightboxPrev: string;
  lightboxNext: string;
  lightboxError: string;
  lightboxIndexSep: string;
  servicesCarouselLabel: string;
  servicesCarouselPrev: string;
  servicesCarouselNext: string;
}

export interface SiteCopy {
  welcomeHeading: string;
  welcomeParagraphs: [string, string];
  portfolioHeading: string;
  heroCtaLabel: string;
  biographyCtaLabel: string;
  servicesHeading: string;
  contact: ContactCopy;
  contactForm: ContactFormLabels;
  instagramHeading: string;
  biographyFallback: BiographyFallbackCopy;
  a11y: AccessibilityLabels;
}

export interface SiteConfig {
  name: string;
  tagline: string;
  locale: string;
  description: string;
  /** TODO: replace with the production domain once it is confirmed. */
  url: string;
  whatsapp: WhatsAppConfig;
  contact: ContactConfig;
  instagram: InstagramConfig;
  navigation: NavItem[];
  copy: SiteCopy;
}

export const site: SiteConfig = {
  name: 'Laury Herrera',
  tagline: 'Creando recuerdos para toda la vida.',
  locale: 'es-AR',
  description: 'Fotografía de familia, niños y retratos. Estudio, exteriores, domicilio y eventos.',
  url: 'https://example.com',

  whatsapp: {
    phoneE164: '+5491126821220',
    defaultMessage: 'Hola Laury, quiero consultar por una sesión de fotos.',
  },

  contact: {
    email: 'lauryherrera.photo@gmail.com',
    phoneDisplay: '+54 9 11 2682 1220',
    phoneE164: '+5491126821220',
  },

  instagram: {
    url: 'https://www.instagram.com/',
    // TODO: confirm handle with the client.
    handle: '',
  },

  navigation: [
    { id: 'lau', label: 'Lau', href: '#inicio', visible: true, kind: 'anchor' },
    { id: 'estudio', label: 'Estudio', href: '/estudio', visible: false, kind: 'page' },
    { id: 'exteriores', label: 'Exteriores', href: '/exteriores', visible: false, kind: 'page' },
    { id: 'domicilio', label: 'Domicilio', href: '/domicilio', visible: false, kind: 'page' },
    { id: 'eventos', label: 'Eventos', href: '/eventos', visible: false, kind: 'page' },
    { id: 'temporada', label: 'Temporada', href: '/temporada', visible: false, kind: 'page' },
    { id: 'reserva-online', label: 'Reserva Online', visible: true, kind: 'whatsapp' },
  ],

  copy: {
    welcomeHeading: 'Bienvenidos',
    welcomeParagraphs: [
      'Cada proyecto, cada celebración, cada familia, cada instante tienen una historia única. Tener el privilegio de inmortalizar esos momentos y formar parte de ellos es un verdadero honor para mí.',
      'Mi propósito es capturar emociones auténticas, miradas sinceras y esos pequeños detalles que, con el paso del tiempo, se convierten en recuerdos más valiosos. Porque una fotografía no solo conserva un momento; también mantiene viva la emoción de volver a sentirlo una y otra vez.',
    ],
    portfolioHeading: 'Momentos',
    heroCtaLabel: 'Conversemos',
    biographyCtaLabel: 'Reserva tu sesión',
    // No visible heading in the mockup for the services section (cards only);
    // this label is used as an accessible, visually-hidden heading.
    servicesHeading: 'Servicios',
    contact: {
      heading: 'Conectemos',
      intro: 'Mereces volver a tus mejores recuerdos.',
      paragraph: 'Reserva tu evento con tiempo, si quieres más información déjanos tu contacto.',
      alternativeIntro: 'También puedes enviarme un mail directo:',
      alternativeCall: 'o llamarme o escribirme:',
    },
    contactForm: {
      firstName: 'Nombre',
      lastName: 'Apellido',
      // Only this field is marked required (`*`) in the mockup.
      email: 'E-mail',
      phone: 'Teléfono',
      message: 'Mensaje',
      submit: 'Enviar',
      sending: 'Enviando…',
      success: 'Tu mensaje fue enviado; te responderemos pronto.',
      requiredNote: '* Campo obligatorio',
      // Aria-hidden wrapper (see `Contact.astro`): never seen or announced.
      // A name unrelated to "website"/"referencia" keeps it from reading as
      // a normal label to a human skimming the source.
      honeypotLabel: 'Referencia interna',
      errors: {
        email_required: 'Falta tu e-mail; escríbelo para que podamos responderte.',
        email_invalid:
          'Ese e-mail no parece válido; revisa el formato, por ejemplo nombre@correo.com.',
        too_long: 'Este texto supera el límite permitido; redúcelo un poco.',
        // Matches the real rule in `src/contact/validate.ts`: digits,
        // spaces, and `+ - ( ) .`, with at least 6 digits.
        phone_invalid:
          'Ese teléfono no es válido: usa solo números, espacios y + - ( ) ., con un mínimo de 6 dígitos.',
      },
      // Never suggests refreshing the page: that would discard what the
      // visitor already typed, and a captcha failure caused by a blocked
      // or failed script is not fixed by a reload. Offers WhatsApp instead.
      captchaFailed:
        'No pudimos completar la verificación; inténtalo de nuevo o escríbenos por WhatsApp.',
      notConfigured:
        'El envío por formulario no está disponible todavía; escríbenos por WhatsApp o por correo.',
      deliveryFailed: 'No pudimos enviar tu mensaje; inténtalo de nuevo o escríbenos por WhatsApp.',
      network: 'No pudimos conectar con el servidor; revisa tu conexión e inténtalo de nuevo.',
      interactiveChallenge: 'Completa la verificación para enviar tu mensaje.',
      noscript: {
        message: 'Este formulario necesita JavaScript para enviarse.',
        whatsappCta: 'Escríbenos por WhatsApp',
        emailCta: 'o envíanos un correo a',
      },
    },
    instagramHeading: 'Instagram',
    biographyFallback: {
      name: 'Laury Herrera',
      paragraphs: [
        'Amo profundamente lo que hago, y esa pasión está presente en cada fotografía que entrego. Cada proyecto es único, porque detrás de cada imagen hay personas, emociones e historias que merecen ser recordadas. Desde el momento en que una familia, una pareja o una persona confía en mí para documentar un instante tan importante de su vida, recibo ese gesto con gratitud y compromiso.',
        'Para mí, no se trata solo de tomar fotografías, sino de tener el privilegio de preservar recuerdos que el tiempo jamás podrá borrar.',
        'Mi mayor propósito es que, al volver a mirar esas imágenes, puedan revivir la emoción, las sonrisas y el amor que sintieron en ese preciso instante.',
        'Ese es el verdadero valor de la fotografía y la razón por la que amo tanto esta profesión.',
      ],
    },
    a11y: {
      openMenu: 'Abrir menú',
      closeMenu: 'Cerrar menú',
      mainMenu: 'Menú principal',
      whatsapp: 'WhatsApp',
      instagram: 'Instagram',
      goHome: 'Ir al inicio',
      skipToContent: 'Saltar al contenido',
      lightboxClose: 'Cerrar',
      lightboxZoom: 'Ampliar o reducir',
      lightboxPrev: 'Foto anterior',
      lightboxNext: 'Foto siguiente',
      lightboxError: 'No se pudo cargar la foto',
      lightboxIndexSep: ' de ',
      servicesCarouselLabel: 'Servicios',
      servicesCarouselPrev: 'Servicios anteriores',
      servicesCarouselNext: 'Servicios siguientes',
    },
  },
};

/**
 * Builds a `wa.me` deep link from the given WhatsApp config.
 * `contact-conversion` owns the final click/CTA behavior; this helper only
 * produces the URL.
 */
export function buildWhatsAppUrl(config: WhatsAppConfig): string {
  const digitsOnly = config.phoneE164.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(config.defaultMessage);
  return `https://wa.me/${digitsOnly}?text=${encodedMessage}`;
}
