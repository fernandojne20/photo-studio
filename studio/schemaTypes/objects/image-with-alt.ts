import {defineField, defineType} from 'sanity'

/**
 * Image field with hotspot cropping and a required alt text field. Every
 * image field across the schema (hero, portrait, portfolio, service cards)
 * uses this type so editors always provide accessible alt text.
 */
export const imageWithAlt = defineType({
  name: 'imageWithAlt',
  title: 'Imagen',
  type: 'image',
  options: {
    hotspot: true,
  },
  fields: [
    defineField({
      name: 'alt',
      title: 'Texto alternativo',
      type: 'string',
      validation: (Rule) =>
        Rule.required().error(
          'Describí la imagen para lectores de pantalla y buscadores.',
        ),
    }),
  ],
})
