/**
 * Domain Types
 * 
 * These interfaces represent business domain entities - typically combinations
 * of data from multiple database tables or after processing/transformation.
 * 
 * Usage:
 *   const product: ComposedProduct = combineProductData(row1, row2);
 */

export interface ComposedProduct {
  id: string
  code: string
  final_name_es: string | null
  product_type: string | null
  validation_status: string
  familia_code: string | null
  isometric_asset_id: string | null
  barcode_text: string | null
  commercial_measure: string | null
  weight_kg: number | null
  width_cm: number | null
  depth_cm: number | null
  height_cm: number | null
  color_code: string | null
  color_name: string | null
  effective_status?: string
  is_exportable?: boolean
  inactive_reasons?: string[]
  ref_code: string | null
  [key: string]: unknown
}

export interface ParsedCodeResult {
  familia_code: string | null
  ref_code: string | null
  version?: string | null
  color?: string | null
  attributes?: Record<string, unknown>
}

export interface NamingRule {
  rule_id: string
  rule_name?: string | null
  template?: string | null
  order?: number
  active?: boolean
  conditions?: Record<string, unknown>
}

export interface EnglishConfig {
  field: string
  rule_id?: string
  pattern?: string
  [key: string]: unknown
}

export interface ValidationResult {
  is_valid: boolean
  errors: string[]
  warnings?: string[]
  suggestions?: string[]
}

export interface BulkOperationResult {
  total: number
  successful: number
  failed: number
  errors: BulkOperationError[]
}

export interface BulkOperationError {
  index: number
  item_id?: string
  error_message: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
