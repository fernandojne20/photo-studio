import {defineArrayMember, defineField, defineType} from 'sanity'
import {ImageIcon} from '@sanity/icons/Image'
import {orderRankField, orderRankOrdering} from '@sanity/orderable-document-list'

export const portfolioImage = defineType({
  name: 'portfolioImage',
  title: 'Foto del portafolio',
  type: 'document',
  icon: ImageIcon,
  fields: [
    defineField({
      name: 'image',
      title: 'Imagen',
      type: 'imageWithAlt',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'caption',
      title: 'Pie de foto',
      type: 'string',
    }),
    defineField({
      name: 'categories',
      title: 'Categorías',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'serviceCategory'}]})],
      validation: (Rule) => Rule.unique(),
    }),
    defineField({
      name: 'visible',
      title: 'Mostrar en la web',
      type: 'boolean',
      initialValue: true,
    }),
    orderRankField({type: 'portfolioImage'}),
  ],
  orderings: [orderRankOrdering],
  preview: {
    select: {
      alt: 'image.alt',
      caption: 'caption',
      media: 'image',
    },
    prepare({alt, caption, media}: {alt?: string; caption?: string; media?: unknown}) {
      return {
        title: alt || 'Foto del portafolio',
        subtitle: caption,
        media,
      }
    },
  },
})
