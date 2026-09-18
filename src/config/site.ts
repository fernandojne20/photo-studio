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

export interface ContactFormLabels {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  submit: string;
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
  description:
    'Fotografía de familia, niños y retratos. Estudio, exteriores, domicilio y eventos.',
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
      paragraph:
        'Reserva tu evento con tiempo, si quieres más información déjanos tu contacto.',
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
