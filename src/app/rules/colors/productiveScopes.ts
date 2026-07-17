export const COLOR_APPLICATION_SCOPE_KEYS = [
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
] as const

export type ColorApplicationScope = (typeof COLOR_APPLICATION_SCOPE_KEYS)[number]

export type ColorApplicationMap = Partial<Record<ColorApplicationScope, string>>

export const BOARD_MATERIAL_PROFILE_SCOPE_KEYS = [
  'full_product',
  'structure',
  'front',
  'inner_structure',
  'drawer_bottom',
] as const

export type BoardMaterialProfileScope = (typeof BOARD_MATERIAL_PROFILE_SCOPE_KEYS)[number]

export const MATERIAL_PROFILE_OPTIONS = ['ST', 'RH', 'CARB2'] as const

export type MaterialProfile = (typeof MATERIAL_PROFILE_OPTIONS)[number]

export type ColorMaterialProfileMap = Partial<Record<BoardMaterialProfileScope, MaterialProfile>>

export const MATERIAL_PROFILE_LABELS: Record<MaterialProfile, string> = {
  ST: 'ST',
  RH: 'RH',
  CARB2: 'CARB2',
}

export const COLOR_MODE_OPTIONS = ['full', 'dual', 'balance', 'equivalent'] as const

export type ColorMode = (typeof COLOR_MODE_OPTIONS)[number]

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  full: 'Unicolor',
  dual: 'Dual',
  balance: 'Balance',
  equivalent: 'Color interno diferente',
}

export const COLOR_APPLICATION_SCOPE_LABELS: Record<ColorApplicationScope, string> = {
  full_product: 'Producto completo',
  structure: 'Estructura',
  front: 'Frente',
  inner_structure: 'Estructura interna',
  drawer_bottom: 'Fondo cajon',
  edge_band_full_product: 'Canto producto completo',
  edge_band_body: 'Canto cuerpo',
  edge_band_front: 'Canto frente',
  edge_band_inner: 'Canto interno',
  edge_band_drawer_bottom: 'Canto fondo cajon',
}

export const SAP_COLOR_CODE_PATTERN = /^[A-Z0-9]{4}$/
