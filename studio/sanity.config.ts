import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

export default defineConfig({
  name: 'default',
  title: 'Laury Herrera · Contenido',

  projectId: 'r781btme',
  dataset: 'production',

  plugins: [structureTool({structure}), visionTool()],

  schema: {
    types: schemaTypes,
  },

  document: {
    // The homepage is a singleton: no deleting or duplicating the one
    // instance, and it must not appear in the generic "create new" menu.
    actions: (prev, context) =>
      context.schemaType === 'homePage'
        ? prev.filter((action) => !['delete', 'duplicate'].includes(action.action ?? ''))
        : prev,
    newDocumentOptions: (prev) => prev.filter((item) => item.templateId !== 'homePage'),
  },
})
