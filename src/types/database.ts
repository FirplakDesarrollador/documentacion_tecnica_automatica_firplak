/**
 * Database Row Types
 * 
 * These interfaces represent the raw data structure returned from database queries.
 * Each type maps to a table in the Supabase/SQLite schema.
 * 
 * Usage:
 *   const rows: ProductRow[] = await dbQuery('SELECT * FROM products');
 */

export interface ProductRow {
  id: string
  code: string
  family_code?: string | null
  reference_code?: string | null
  product_name?: string | null
  final_name_es?: string | null
  sap_description?: string | null
  product_type?: string | null
  barcode_text?: string | null
  validation_status?: string
  is_exportable?: boolean
  [key: string]: unknown
}

export interface FamilyRow {
  family_code: string
  family_name?: string | null
  product_type?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface ReferenceRow {
  reference_code: string
  family_code: string
  product_name?: string | null
  color_code?: string | null
  color_name?: string | null
  commercial_measure?: string | null
  weight_kg?: number | null
  width_cm?: number | null
  depth_cm?: number | null
  height_cm?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface ColorRow {
  color_code: string
  color_name?: string | null
  [key: string]: unknown
}

export interface VersionRow {
  version_id: string
  product_id?: string | null
  version_label?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface NamingRuleRow {
  rule_id: string
  rule_name?: string | null
  template?: string | null
  order?: number
  active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface DatabaseError {
  code: string
  message: string
  details?: unknown
}
