import {defineField, defineType} from 'sanity'

interface CallToActionParent {
  label?: string
  target?: 'whatsapp' | 'contact' | 'url'
  url?: string
}

/**
 * Optional call to action attached to the biography. `label` is only
 * required once the editor has started filling in the object (i.e. picked a
 * target or entered a URL); an entirely untouched CTA stays valid because the
 * whole field is optional on the parent.
 */
export const callToAction = defineType({
  name: 'callToAction',
  title: 'Llamado a la acción',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Texto del botón',
      type: 'string',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as CallToActionParent | undefined
          const hasOtherFields = Boolean(parent?.target || parent?.url)
          if (hasOtherFields && !value) {
            return 'El texto del botón es obligatorio si agregás un llamado a la acción.'
          }
          return true
        }),
    }),
    defineField({
      name: 'target',
      title: 'Destino',
      type: 'string',
      options: {
        layout: 'radio',
        list: [
          {title: 'WhatsApp', value: 'whatsapp'},
          {title: 'Formulario de contacto', value: 'contact'},
          {title: 'Enlace externo', value: 'url'},
        ],
      },
    }),
    defineField({
      name: 'url',
      title: 'Enlace',
      type: 'url',
      hidden: ({parent}: {parent?: CallToActionParent}) => parent?.target !== 'url',
      validation: (Rule) =>
        Rule.uri({scheme: ['http', 'https']}).custom((value, context) => {
          const parent = context.parent as CallToActionParent | undefined
          if (parent?.target === 'url' && !value) {
            return 'El enlace es obligatorio para un destino externo.'
          }
          return true
        }),
    }),
  ],
})
