'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { assertAuthenticated, type AccessContext } from '@/utils/auth/access'
import { hasPermission } from '@/types/auth'

type RawRow = Record<string, unknown>
type PhysicalWeightCatalogAccess = AccessContext & { user: NonNullable<AccessContext['user']> }

export type PhysicalWeightCatalogItem = {
  itemCode: string
  itemName: string | null
  kgPerUom: number | null
  source: string | null
  note: string | null
  updatedAt: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function mapItem(row: RawRow): PhysicalWeightCatalogItem {
  const itemCode = text(row.item_code)
  if (!itemCode) throw new Error('El componente no tiene código verificable.')
  return {
    itemCode,
    itemName: text(row.item_name),
    kgPerUom: finiteNumber(row.physical_weight_kg_per_uom),
    source: text(row.physical_weight_source),
    note: text(row.physical_weight_note),
    updatedAt: text(row.physical_weight_updated_at),
  }
}

async function requirePhysicalWeightCatalogAccess(): Promise<PhysicalWeightCatalogAccess> {
  const access = await assertAuthenticated()
  if (!access.user) throw new Error('No se pudo identificar al usuario del catálogo físico.')
  const allowed = access.isAdmin
    || hasPermission(access.permissions, 'module:product-design:estimations')
    || hasPermission(access.permissions, 'module:engineering:measurements')
  if (!allowed) throw new Error('No tienes permiso para administrar los factores físicos.')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('El catálogo físico requiere credenciales server-side de Supabase.')
  }
  return { ...access, user: access.user }
}

export async function listPhysicalWeightCatalogAction(query = ''): Promise<PhysicalWeightCatalogItem[]> {
  await requirePhysicalWeightCatalogAccess()
  const normalized = query.trim()
  const rows = await dbQuery(
    `SELECT item_code, item_name, physical_weight_kg_per_uom, physical_weight_source, physical_weight_note, physical_weight_updated_at
       FROM public.component_items
      WHERE $1 = '' OR item_code ILIKE '%' || $1 || '%' OR item_name ILIKE '%' || $1 || '%'
      ORDER BY (physical_weight_kg_per_uom IS NULL) ASC, item_code ASC
      LIMIT 250`,
    [normalized],
  )
  return rows.map((row: RawRow) => mapItem(row))
}

export async function savePhysicalWeightCatalogItemAction(input: {
  itemCode: string
  kgPerUom: number | null
  source?: string | null
  note?: string | null
}): Promise<PhysicalWeightCatalogItem> {
  const access = await requirePhysicalWeightCatalogAccess()
  const itemCode = text(input.itemCode)?.toUpperCase()
  if (!itemCode) throw new Error('El código del componente es obligatorio.')
  const kgPerUom = input.kgPerUom === null ? null : finiteNumber(input.kgPerUom)
  if (kgPerUom !== null && kgPerUom <= 0) throw new Error('El factor kg por UOM debe ser mayor que cero.')
  if (input.kgPerUom !== null && kgPerUom === null) throw new Error('El factor kg por UOM debe ser numérico.')
  const source = text(input.source)
  if (kgPerUom !== null && !source) throw new Error('Indica la fuente del factor físico.')

  const rows = await dbQuery(
    `UPDATE public.component_items
        SET physical_weight_kg_per_uom = $1,
            physical_weight_source = $2,
            physical_weight_note = $3,
            physical_weight_updated_by = $4::uuid,
            physical_weight_updated_at = now()
      WHERE item_code = $5
      RETURNING item_code, item_name, physical_weight_kg_per_uom, physical_weight_source, physical_weight_note, physical_weight_updated_at`,
    [kgPerUom, source, text(input.note), access.user.id, itemCode],
  )
  const row = rows[0] as RawRow | undefined
  if (!row) throw new Error(`No existe el componente ${itemCode} en el catálogo local.`)
  const item = mapItem(row)
  revalidatePath('/physical-weights')
  revalidatePath('/product-design/estimations')
  revalidatePath('/engineering/measurements')
  return item
}
