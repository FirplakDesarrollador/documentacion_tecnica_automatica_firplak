/**
 * Server Action Payloads and Request/Response Types
 * 
 * These interfaces represent the data structures passed to server-side
 * functions (Server Actions, API routes, RPC calls).
 * 
 * Usage:
 *   export async function createProduct(data: CreateProductPayload) { ... }
 */

// Product Actions
export interface CreateProductPayload {
  code: string
  final_name_es?: string | null
  product_type?: string | null
  family_code?: string | null
  reference_code?: string | null
  sap_description?: string | null
  barcode_text?: string | null
  [key: string]: unknown
}

export interface UpdateProductPayload {
  id: string
  code?: string
  final_name_es?: string | null
  product_type?: string | null
  validation_status?: string
  [key: string]: unknown
}

export interface UpsertProductPayload extends CreateProductPayload {
  id?: string
}

// Family Actions
export interface UpsertFamilyPayload {
  family_code: string
  family_name?: string | null
  product_type?: string | null
  attributes?: Record<string, unknown>
}

// Reference Actions
export interface UpdateReferencePayload {
  reference_code: string
  product_name?: string | null
  color_code?: string | null
  color_name?: string | null
  commercial_measure?: string | null
  weight_kg?: number | null
  width_cm?: number | null
  depth_cm?: number | null
  height_cm?: number | null
  [key: string]: unknown
}

// Bulk Operations
export interface BulkImportPayload {
  items: Array<{
    code: string
    product_name?: string | null
    product_type?: string | null
    family_code?: string | null
    [key: string]: unknown
  }>
  source?: 'sap' | 'manual' | 'file'
}

export interface BulkApplyNamesPayload {
  template_id: string
  product_ids: string[]
  language: 'es' | 'en'
  dry_run?: boolean
}

export interface BulkCleanupPayload {
  product_ids: string[]
  fields_to_clear: string[]
  dry_run?: boolean
}

export interface BulkMassEditPayload {
  family_codes: string[]
  updates: Record<string, unknown>
  dry_run?: boolean
}

// Naming/Template Actions
export interface ApplyNamingTemplatePayload {
  product_id: string
  template_id: string
  language: 'es' | 'en'
  variables?: Record<string, unknown>
}

export interface ValidateProductNamePayload {
  product_name: string
  family_code?: string | null
  reference_code?: string | null
}

// Response Types
export interface CreateProductResponse {
  id: string
  code: string
  success: boolean
  message?: string
}

export interface BulkImportResponse {
  total: number
  created: number
  updated: number
  failed: number
  errors: Array<{
    index: number
    error: string
  }>
}

export interface BulkApplyNamesResponse {
  total: number
  updated: number
  failed: number
  preview?: Array<{
    product_id: string
    old_name: string
    new_name: string
  }>
}

export interface BulkCleanupResponse {
  total: number
  cleared: number
  failed: number
}

export interface ValidationResponse {
  is_valid: boolean
  suggestions?: string[]
  conflicts?: Array<{
    product_id: string
    reason: string
  }>
}

// Error Response
export interface ErrorResponse {
  error: true
  message: string
  code?: string
  details?: unknown
}

// Success Response Wrapper
export interface SuccessResponse<T> {
  error: false
  data: T
  message?: string
}

export type ActionResponse<T> = SuccessResponse<T> | ErrorResponse
