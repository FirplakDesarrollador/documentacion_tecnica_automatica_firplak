export const PRODUCT_APPLICATION_SCOPES = [
  'full_product',
  'front',
  'structure',
  'inner_structure',
  'drawer_bottom',
  'edge_band_full_product',
  'edge_band_body',
  'edge_band_front',
  'edge_band_inner',
  'edge_band_drawer_bottom',
  'NA',
] as const

export type ProductApplicationScope = (typeof PRODUCT_APPLICATION_SCOPES)[number]

export const MATERIAL_PROFILES = ['ST', 'RH', 'CARB2'] as const
export type MaterialProfile = (typeof MATERIAL_PROFILES)[number] | string

export type BomColorMode = 'full' | 'dual' | 'balance'
export type BomConsumptionStatus = 'observed' | 'confirmed' | 'needs_definition'

export type ComponentTechnicalMetadata = {
  material_kind: 'board' | 'edge_band' | 'other'
  material_profile: MaterialProfile | null
  material_profile_source: string | null
  thickness_mm: number | null
  purchase_length: number | null
  purchase_length_unit: number | null
  purchase_length_mm: number | null
  purchase_width: number | null
  purchase_width_unit: number | null
  purchase_width_mm: number | null
  purchase_height: number | null
  purchase_height_unit: number | null
  purchase_height_mm: number | null
  format_key: string | null
  metadata_source: 'sap_and_name' | 'sap' | 'name' | 'unknown'
}

export type BomMaterialAlternative = {
  alternative_id: string
  base_item_code: string
  material_profile: MaterialProfile
  is_default: boolean
}

export type BomConsumption = {
  color_mode: BomColorMode
  product_application_scope: ProductApplicationScope
  material_profile: MaterialProfile
  format_key: string | null
  qty: number | null
  status: BomConsumptionStatus
}

export const BOM_OPERATION_TYPES = ['replace_line', 'add_line', 'remove_line'] as const

export type BomOperationType = (typeof BOM_OPERATION_TYPES)[number]

export type BomStructureLine = {
  line_id: string
  sort_order: number
  line_kind: 'fixed' | 'material_group'
  base_item_code: string | null
  product_application_scope: ProductApplicationScope
  qty: number | null
  uom?: string | null
  input_warehouse_code: string | null
  issue_method_override: string | null
  alternatives: BomMaterialAlternative[]
  consumptions: BomConsumption[]
}

export type BomStructure = {
  schema_version: 2
  structure_type: 'production' | 'sales_kit' | 'component'
  input_warehouse_code: string | null
  output_warehouse_code: string | null
  lines: BomStructureLine[]
}

export type BomOverrideOperation = {
  operation_id: string
  operation_type: BomOperationType
  target_line_id?: string | null
  target_base_item_code?: string | null
  target_product_application_scope?: ProductApplicationScope | null
  new_line?: Partial<BomStructureLine> | null
  reason?: string | null
  source?: string | null
  actor_id?: string | null
  created_at?: string | null
}

export type BomColorOverride = {
  override_id: string
  color_code: string
  product_application_scope: ProductApplicationScope
  base_item_code?: string | null
  target_color_code?: string | null
  material_profile?: MaterialProfile | null
  reason: string
  source: 'reference_import' | 'manual'
  actor_id?: string | null
  created_at?: string | null
}

export type BomOverrides = {
  schema_version: 1 | 2
  operations: BomOverrideOperation[]
  color_overrides?: BomColorOverride[]
}

export type ComponentCategory =
  | 'material'
  | 'hardware'
  | 'packaging'
  | 'process'
  | 'substructure'
  | 'child_sku'
  | 'unknown'

export type ComponentItem = {
  item_code: string
  base_item_code: string
  variant_code_4: string
  item_name: string
  base_item_name: string | null
  uom: string | null
  component_category: ComponentCategory
  default_issue_method: string | null
  sap_valid: boolean | null
  sap_frozen: boolean | null
  is_inventory_item: boolean | null
  item_bom_structure: BomStructure
  technical_metadata: ComponentTechnicalMetadata | null
}

export type Colorway = {
  code_4dig: string
  name_color_sap: string
  color_mode: 'full' | 'dual' | 'balance' | 'equivalent'
  application_colors_json: Record<string, string>
  application_material_profiles_json: Record<string, string>
  allowed_product_types: string[]
  is_active: boolean
}

export type ResolvedBomLine = {
  sku_complete: string
  line_id: string
  level: number
  sort_order: number
  base_item_code: string
  resolved_item_code: string
  resolved_item_name: string | null
  product_application_scope: ProductApplicationScope
  qty: number
  uom: string | null
  input_warehouse_code: string | null
  output_warehouse_code: string | null
  issue_method: string | null
  resolution_status: 'resolved' | 'missing_component_item' | 'missing_material_profile' | 'missing_consumption' | 'override_conflict'
  alternative_id?: string | null
  material_profile?: string | null
  format_key?: string | null
}

export type PilotSku = {
  sku: string
  label: string
  kind: 'lavamanos' | 'lavarropas' | 'cocina'
}

export const PILOT_SKUS: PilotSku[] = [
  { sku: 'VBAN12-0081-000-0437', label: 'Mueble lavamanos Macao', kind: 'lavamanos' },
  { sku: 'VROP03-0001-000-0100', label: 'Mueble lavarropas', kind: 'lavarropas' },
  { sku: 'VCOC01-0066-000-0437', label: 'Mueble cocina', kind: 'cocina' },
]
