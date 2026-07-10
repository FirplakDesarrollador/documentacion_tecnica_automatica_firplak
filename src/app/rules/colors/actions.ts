'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForColor, processNamingJobsInline } from '@/lib/engine/namingQueue'
import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/utils/auth/access'
import {
  COLOR_APPLICATION_SCOPE_KEYS,
  COLOR_MODE_OPTIONS,
  SAP_COLOR_CODE_PATTERN,
  type ColorApplicationMap,
  type ColorApplicationScope,
  type ColorMode,
} from './productiveScopes'

export type ColorEntry = {
  code_4dig: string
  name_color_sap: string
  color_mode: ColorMode
  application_colors_json: ColorApplicationMap
  allowed_product_types: string[]
  allowed_manufacturing_processes: string[]
  is_active: boolean
  notes: string | null
}

type UpsertColorInput = {
  code_4dig: string
  name_color_sap: string
  color_mode?: string | null
  allowed_product_types?: unknown
  allowed_manufacturing_processes?: unknown
  is_active?: boolean | null
  notes?: string | null
  isNew?: boolean
  application_colors_json?: Partial<Record<ColorApplicationScope, string | null | undefined>> | null
}

const COLOR_SELECT_COLUMNS = `
  code_4dig,
  name_color_sap,
  COALESCE(color_mode, 'full') AS color_mode,
  COALESCE(application_colors_json, '{}'::jsonb) AS application_colors_json,
  COALESCE(allowed_product_types, '{}'::text[]) AS allowed_product_types,
  COALESCE(allowed_manufacturing_processes, '{}'::text[]) AS allowed_manufacturing_processes,
  COALESCE(is_active, true) AS is_active,
  notes
`

const REMOVE_MANAGED_APPLICATION_SCOPES_SQL = COLOR_APPLICATION_SCOPE_KEYS
  .map((scope) => ` - '${scope}'`)
  .join('')

async function assertAdminAccess() {
  await assertPermission('module:configuration')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return {}

  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseStringArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Fall through to the simple Postgres text[] shape used by some raw SQL responses.
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.replace(/^"|"$/g, ''))
  }

  return [trimmed]
}

function normalizeTextArray(value: unknown): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const rawValue of parseStringArray(value)) {
    if (typeof rawValue !== 'string') continue

    const item = rawValue.trim().toUpperCase()
    if (!item || seen.has(item)) continue

    seen.add(item)
    normalized.push(item)
  }

  return normalized
}

function normalizeColorMode(value: unknown): ColorMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return COLOR_MODE_OPTIONS.includes(mode as ColorMode) ? mode as ColorMode : 'full'
}

function normalizeOptionalNotes(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const notes = value.trim()
  return notes ? notes : null
}

function normalizeApplicationColors(value: unknown): ColorApplicationMap {
  const source = parseJsonRecord(value)
  const normalized: ColorApplicationMap = {}

  for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
    const rawValue = source[scope]
    if (typeof rawValue !== 'string') continue

    const code = rawValue.trim().toUpperCase()
    if (code) normalized[scope] = code
  }

  return normalized
}

function normalizeColorRow(row: Record<string, unknown>): ColorEntry {
  return {
    code_4dig: typeof row.code_4dig === 'string' ? row.code_4dig : '',
    name_color_sap: typeof row.name_color_sap === 'string' ? row.name_color_sap : '',
    color_mode: normalizeColorMode(row.color_mode),
    application_colors_json: normalizeApplicationColors(row.application_colors_json),
    allowed_product_types: normalizeTextArray(row.allowed_product_types),
    allowed_manufacturing_processes: normalizeTextArray(row.allowed_manufacturing_processes),
    is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
    notes: normalizeOptionalNotes(row.notes),
  }
}

function normalizeColorRows(rows: Record<string, unknown>[]): ColorEntry[] {
  return rows.map(normalizeColorRow)
}

function getRowValues(rows: unknown): string[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row: unknown) => isRecord(row) ? row.value : null).filter((value): value is string => typeof value === 'string')
}

function getFirstRecordRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {}
  const [row] = value
  return isRecord(row) ? row : {}
}

function normalizeApplicationColorPatch(input: unknown) {
  if (input === undefined) return null
  if (!isRecord(input)) return {}

  const patch: ColorApplicationMap = {}
  for (const scope of COLOR_APPLICATION_SCOPE_KEYS) {
    const rawValue = input[scope]
    const code = typeof rawValue === 'string' ? rawValue.trim().toUpperCase() : ''
    if (!code) continue

    if (!SAP_COLOR_CODE_PATTERN.test(code)) {
      throw new Error(`El scope "${scope}" debe tener un codigo SAP de 4 caracteres alfanumericos`)
    }
    patch[scope] = code
  }

  return patch
}

/** Fetch all colors */
export async function getColorsAction() {
  await assertAdminAccess()

  const rows = await dbQuery(
    `SELECT ${COLOR_SELECT_COLUMNS} FROM public.colors ORDER BY code_4dig ASC`
  )
  return normalizeColorRows(Array.isArray(rows) ? rows : [])
}

export async function getColorEditorOptionsAction() {
  await assertAdminAccess()

  const [productTypeRows, manufacturingProcessRows] = await Promise.all([
    dbQuery(`
      SELECT DISTINCT upper(btrim(product_type)) AS value
      FROM public.families
      WHERE nullif(btrim(product_type), '') IS NOT NULL
      ORDER BY 1
    `),
    dbQuery(`
      SELECT DISTINCT upper(btrim(manufacturing_process)) AS value
      FROM public.families
      WHERE nullif(btrim(manufacturing_process), '') IS NOT NULL
      ORDER BY 1
    `),
  ])

  return {
    productTypes: normalizeTextArray(getRowValues(productTypeRows)),
    manufacturingProcesses: normalizeTextArray(getRowValues(manufacturingProcessRows)),
  }
}

/** Update a color name or upsert */
export async function upsertColorAction(data: UpsertColorInput) {
  await assertAdminAccess()

  const { code_4dig, name_color_sap, isNew } = data
  if (!code_4dig || !name_color_sap) {
    throw new Error('El código y el nombre SAP del color son obligatorios')
  }

  // standardizing inputs
  const code = code_4dig.trim().toUpperCase()
  const name = name_color_sap.trim().toUpperCase()
  const colorMode = normalizeColorMode(data.color_mode)
  const allowedProductTypes = normalizeTextArray(data.allowed_product_types)
  const allowedManufacturingProcesses = normalizeTextArray(data.allowed_manufacturing_processes)
  const isActive = data.is_active ?? true
  const notes = normalizeOptionalNotes(data.notes)
  const applicationColorPatch = normalizeApplicationColorPatch(data.application_colors_json)

  if (isNew) {
    const existing = await dbQuery(
      `SELECT code_4dig FROM public.colors WHERE code_4dig = $1`,
      [code]
    )
    if (existing && existing.length > 0) {
      throw new Error(`El código de color "${code}" ya existe en la base de datos`)
    }

    const result = applicationColorPatch === null
      ? await dbQuery(
          `INSERT INTO public.colors (
             code_4dig,
             name_color_sap,
             color_mode,
             allowed_product_types,
             allowed_manufacturing_processes,
             is_active,
             notes
           )
           SELECT
             $1,
             $2,
             $3,
             ARRAY(SELECT jsonb_array_elements_text($4::jsonb)),
             ARRAY(SELECT jsonb_array_elements_text($5::jsonb)),
             $6,
             $7
           RETURNING ${COLOR_SELECT_COLUMNS}`,
          [
            code,
            name,
            colorMode,
            JSON.stringify(allowedProductTypes),
            JSON.stringify(allowedManufacturingProcesses),
            isActive,
            notes,
          ]
        )
      : await dbQuery(
          `INSERT INTO public.colors (
             code_4dig,
             name_color_sap,
             color_mode,
             allowed_product_types,
             allowed_manufacturing_processes,
             is_active,
             notes,
             application_colors_json
           )
           SELECT
             $1,
             $2,
             $3,
             ARRAY(SELECT jsonb_array_elements_text($4::jsonb)),
             ARRAY(SELECT jsonb_array_elements_text($5::jsonb)),
             $6,
             $7,
             $8::jsonb
           RETURNING ${COLOR_SELECT_COLUMNS}`,
          [
            code,
            name,
            colorMode,
            JSON.stringify(allowedProductTypes),
            JSON.stringify(allowedManufacturingProcesses),
            isActive,
            notes,
            JSON.stringify(applicationColorPatch),
          ]
        )
    await markNamingStaleForColor(code, null, 'color_upsert')
    await processNamingJobsInline()
    revalidatePath('/rules/colors')
    revalidatePath('/configuration/colors')
    return normalizeColorRow(getFirstRecordRow(result))
  } else {
    const result = applicationColorPatch === null
      ? await dbQuery(
          `UPDATE public.colors
           SET name_color_sap = $1,
               color_mode = $2,
               allowed_product_types = ARRAY(SELECT jsonb_array_elements_text($3::jsonb)),
               allowed_manufacturing_processes = ARRAY(SELECT jsonb_array_elements_text($4::jsonb)),
               is_active = $5,
               notes = $6
           WHERE code_4dig = $7
           RETURNING ${COLOR_SELECT_COLUMNS}`,
          [
            name,
            colorMode,
            JSON.stringify(allowedProductTypes),
            JSON.stringify(allowedManufacturingProcesses),
            isActive,
            notes,
            code,
          ]
        )
      : await dbQuery(
          `UPDATE public.colors
           SET name_color_sap = $1,
               color_mode = $2,
               allowed_product_types = ARRAY(SELECT jsonb_array_elements_text($3::jsonb)),
               allowed_manufacturing_processes = ARRAY(SELECT jsonb_array_elements_text($4::jsonb)),
               is_active = $5,
               notes = $6,
               application_colors_json = (
                 COALESCE(application_colors_json, '{}'::jsonb)${REMOVE_MANAGED_APPLICATION_SCOPES_SQL}
               ) || $7::jsonb
           WHERE code_4dig = $8
           RETURNING ${COLOR_SELECT_COLUMNS}`,
          [
            name,
            colorMode,
            JSON.stringify(allowedProductTypes),
            JSON.stringify(allowedManufacturingProcesses),
            isActive,
            notes,
            JSON.stringify(applicationColorPatch),
            code,
          ]
        )
    await markNamingStaleForColor(code, null, 'color_update')
    await processNamingJobsInline()
    revalidatePath('/rules/colors')
    revalidatePath('/configuration/colors')
    return normalizeColorRow(getFirstRecordRow(result))
  }
}

/** Delete a color (checks for associated SKUs first) */
export async function deleteColorAction(code_4dig: string) {
  await assertAdminAccess()

  if (!code_4dig) throw new Error('Código es obligatorio para eliminar')

  const skus = await dbQuery(
    `SELECT id, sku_complete FROM public.product_skus WHERE color_code = $1`,
    [code_4dig]
  )

  if (skus && skus.length > 0) {
    return {
      success: false,
      hasSkus: true,
      skuCount: skus.length,
      skuCodes: skus.map((s: { sku_complete: string }) => s.sku_complete),
      message: `Este color está siendo usado por ${skus.length} SKU(s).`
    }
  }

  await dbQuery(`DELETE FROM public.colors WHERE code_4dig = $1`, [code_4dig])
  revalidatePath('/rules/colors')
  revalidatePath('/configuration/colors')
  return { success: true }
}

/** Force delete a color and all SKUs that use it */
export async function forceDeleteColorAction(code_4dig: string) {
  await assertAdminAccess()

  if (!code_4dig) throw new Error('Código es obligatorio para eliminar')
  await dbQuery(`DELETE FROM public.product_skus WHERE color_code = $1`, [code_4dig])
  await dbQuery(`DELETE FROM public.colors WHERE code_4dig = $1`, [code_4dig])
  revalidatePath('/rules/colors')
  revalidatePath('/configuration/colors')
  return { success: true }
}
