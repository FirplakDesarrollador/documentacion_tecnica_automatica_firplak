export const REFERENCE_PRODUCT_APPLICATION_SCOPES = [
  'full_product',
  'structure',
  'front',
  'inner_structure',
  'drawer_bottom',
  'edge_band_full_product',
  'edge_band_body',
  'edge_band_front',
  'edge_band_inner',
  'edge_band_drawer_bottom',
  'NA',
] as const

export type ReferenceProductApplicationScope = (typeof REFERENCE_PRODUCT_APPLICATION_SCOPES)[number]

/** Board lines and edge-band lines share one persisted scope field. Keep their
 * classification separate so a TABLERO can never inherit a CANTO role. */
export const BOARD_MATERIAL_APPLICATION_SCOPES = [
  'full_product',
  'structure',
  'front',
  'inner_structure',
  'drawer_bottom',
] as const

export type BoardMaterialApplicationScope = (typeof BOARD_MATERIAL_APPLICATION_SCOPES)[number]

export function isBoardMaterialApplicationScope(value: unknown): value is BoardMaterialApplicationScope {
  return typeof value === 'string'
    && BOARD_MATERIAL_APPLICATION_SCOPES.includes(value as BoardMaterialApplicationScope)
}

export function isReferenceProductApplicationScope(value: unknown): value is ReferenceProductApplicationScope {
  return typeof value === 'string'
    && REFERENCE_PRODUCT_APPLICATION_SCOPES.includes(value as ReferenceProductApplicationScope)
}
