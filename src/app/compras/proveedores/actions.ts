'use server'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'
import { listSapSuppliers } from '@/lib/sap/serviceLayer'
import { assertPermission } from '@/utils/auth/access'

type RawRow = Record<string, unknown>

export type SupplierListItem = {
  bpCode: string
  cardName: string
  defaultCurrency: string | null
  phone1: string | null
  emailAddress: string | null
  isActive: boolean
  syncedAt: string
}

async function requireSupplierAccess() {
  const access = await assertPermission('module:compras:proveedores')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('La sincronización de proveedores requiere credenciales server-side de Supabase.')
  }
  return access
}

export async function listSuppliersAction(query = ''): Promise<{ suppliers: SupplierListItem[]; lastSyncAt: string | null }> {
  await requireSupplierAccess()
  const keyword = query.trim()
  const rows = await dbQuery(
    `SELECT bp_code, card_name, default_currency, phone_1, email_address, is_active, synced_at
       FROM public.sap_suppliers
      WHERE $1 = '' OR bp_code ILIKE '%' || $1 || '%' OR card_name ILIKE '%' || $1 || '%'
      ORDER BY is_active DESC, card_name ASC
      LIMIT 250`,
    [keyword],
  )
  const latestRows = await dbQuery('SELECT max(synced_at) AS last_sync_at FROM public.sap_suppliers')
  return {
    suppliers: (rows as RawRow[]).map(row => ({
      bpCode: String(row.bp_code), cardName: String(row.card_name), defaultCurrency: typeof row.default_currency === 'string' ? row.default_currency : null,
      phone1: typeof row.phone_1 === 'string' ? row.phone_1 : null, emailAddress: typeof row.email_address === 'string' ? row.email_address : null,
      isActive: row.is_active !== false, syncedAt: String(row.synced_at),
    })),
    lastSyncAt: typeof latestRows[0]?.last_sync_at === 'string' ? latestRows[0].last_sync_at : null,
  }
}

export async function syncSapSuppliersAction(input: { confirmed: boolean }): Promise<{ synced: number; lastSyncAt: string }> {
  await requireSupplierAccess()
  if (!input.confirmed) throw new Error('Marca la confirmación explícita antes de sincronizar proveedores.')
  const sapSuppliers = await listSapSuppliers()
  const syncedAt = new Date().toISOString()
  const rows = sapSuppliers.map(supplier => ({
    bp_code: supplier.bpCode, card_name: supplier.cardName, default_currency: supplier.defaultCurrency,
    phone_1: supplier.phone1, email_address: supplier.emailAddress, is_active: supplier.isActive,
    sap_updated_at: supplier.updatedAt, synced_at: syncedAt,
  }))
  if (rows.length > 0) {
    const { error } = await supabaseTable('sap_suppliers').upsert(rows, { onConflict: 'bp_code' })
    if (error) throw new Error(`No se pudieron guardar proveedores: ${error.message}`)
  }
  const readback = await dbQuery('SELECT count(*)::int AS count, max(synced_at) AS last_sync_at FROM public.sap_suppliers WHERE synced_at = $1::timestamptz', [syncedAt])
  const synced = typeof readback[0]?.count === 'number' ? readback[0].count : Number(readback[0]?.count ?? 0)
  if (synced !== rows.length || readback[0]?.last_sync_at !== syncedAt) throw new Error('La sincronización no pasó la verificación de lectura posterior.')
  return { synced, lastSyncAt: syncedAt }
}
