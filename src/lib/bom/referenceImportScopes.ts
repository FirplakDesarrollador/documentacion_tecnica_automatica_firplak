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

export function isReferenceProductApplicationScope(value: unknown): value is ReferenceProductApplicationScope {
  return typeof value === 'string'
    && REFERENCE_PRODUCT_APPLICATION_SCOPES.includes(value as ReferenceProductApplicationScope)
}
