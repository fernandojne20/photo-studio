import {defineArrayMember, defineField, defineType} from 'sanity'
import {HomeIcon} from '@sanity/icons/Home'

/**
 * Singleton homepage document. Its single instance is enforced through
 * `structure.ts` (fixed document id `homePage`), not through schema options.
 */
export const homePage = defineType({
  name: 'homePage',
  title: 'Página de inicio',
  type: 'document',
  icon: HomeIcon,
  groups: [
    {name: 'portada', title: 'Portada', default: true},
    {name: 'biografia', title: 'Biografía'},
  ],
  fields: [
    defineField({
      name: 'hero',
      title: 'Portada',
      type: 'object',
      group: 'portada',
      fields: [
        defineField({
          name: 'image',
          title: 'Imagen principal',
          type: 'imageWithAlt',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'mobileImage',
          title: 'Imagen para móvil',
          description:
            'Opcional. Se usa en pantallas de teléfono cuando está presente; si se deja vacía, se usa la imagen principal.',
          type: 'imageWithAlt',
        }),
      ],
    }),
    defineField({
      name: 'biography',
      title: 'Biografía',
      type: 'object',
      group: 'biografia',
      fields: [
        defineField({
          name: 'portrait',
          title: 'Retrato',
          type: 'imageWithAlt',
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: 'body',
          title: 'Texto',
          type: 'array',
          of: [
            defineArrayMember({
              type: 'block',
              styles: [{title: 'Normal', value: 'normal'}],
              lists: [],
              marks: {
                decorators: [
                  {title: 'Negrita', value: 'strong'},
                  {title: 'Cursiva', value: 'em'},
                ],
                annotations: [],
              },
            }),
          ],
          validation: (Rule) =>
            Rule.required()
              .min(1)
              .error('Escribí al menos un párrafo para la biografía.'),
        }),
        defineField({
          name: 'cta',
          title: 'Llamado a la acción',
          type: 'callToAction',
        }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return {title: 'Página de inicio'}
    },
  },
})
