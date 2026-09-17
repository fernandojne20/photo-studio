import type {StructureResolver} from 'sanity/structure'
import {orderableDocumentListDeskItem} from '@sanity/orderable-document-list'

/**
 * `homePage` is a singleton, surfaced as a fixed-id document link rather than
 * a generic document type list, so editors always land on the one instance.
 * `portfolioImage` and `serviceCategory` are drag-and-drop orderable lists.
 */
export const structure: StructureResolver = (S, context) =>
  S.list()
    .title('Contenido')
    .items([
      S.listItem()
        .title('Página de inicio')
        .id('homePage')
        .child(S.document().schemaType('homePage').documentId('homePage')),
      S.divider(),
      orderableDocumentListDeskItem({
        type: 'portfolioImage',
        title: 'Portafolio',
        S,
        context,
      }),
      orderableDocumentListDeskItem({
        type: 'serviceCategory',
        title: 'Servicios',
        S,
        context,
      }),
    ])
