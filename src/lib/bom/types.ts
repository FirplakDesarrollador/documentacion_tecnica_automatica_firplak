export const PRODUCT_APPLICATION_SCOPES = [
  'full_product',
  'front',
  'structure',
  'inner_structure',
  'drawer_bottom',
  'edge_band_body',
  'edge_band_front',
  'edge_band_inner',
  'edge_band_drawer_bottom',
  'NA',
] as const

export type ProductApplicationScope = (typeof PRODUCT_APPLICATION_SCOPES)[number]

export const BOM_OPERATION_TYPES = ['replace_line', 'add_line', 'remove_line'] as const

export type BomOperationType = (typeof BOM_OPERATION_TYPES)[number]

export type BomStructureLine = {
  line_id: string
  sort_order: number
  base_item_code: string
  product_application_scope: ProductApplicationScope
  qty: number
  input_warehouse_code: string | null
  issue_method_override: string | null
}

export type BomStructure = {
  schema_version: 1
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
}

export type BomOverrides = {
  schema_version: 1
  operations: BomOverrideOperation[]
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
}

export type Colorway = {
  code_4dig: string
  name_color_sap: string
  color_mode: 'full' | 'dual' | 'balance' | 'equivalent'
  application_colors_json: Record<string, string>
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
  resolution_status: 'resolved' | 'missing_component_item'
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
