import {defineField, defineType} from 'sanity'
import {TagIcon} from '@sanity/icons/Tag'
import {orderRankField, orderRankOrdering} from '@sanity/orderable-document-list'

export const serviceCategory = defineType({
  name: 'serviceCategory',
  title: 'Servicio',
  type: 'document',
  icon: TagIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Nombre',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Imagen',
      type: 'imageWithAlt',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'visible',
      title: 'Mostrar en la web',
      type: 'boolean',
      initialValue: true,
    }),
    orderRankField({type: 'serviceCategory'}),
  ],
  orderings: [orderRankOrdering],
  preview: {
    select: {
      title: 'title',
      media: 'image',
    },
  },
})
