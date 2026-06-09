'use server'

import { revalidatePath } from 'next/cache'
import { dbQuery } from '@/lib/supabase'
import { assertRole } from '@/utils/auth/access'

type ClientRow = {
  id: string
  name: string
  logo_asset_id: string | null
  logo_url: string | null
}

type ClientPickerRow = {
  id: string
  name: string
  logo_asset_id: string | null
  logo_url: string | null
}

async function assertAdminAccess() {
  await assertRole('admin')
}

function normalizeClientName(raw: string) {
  const trimmed = String(raw || '').trim()
  const upper = trimmed.toUpperCase()
  if (!trimmed) throw new Error('Nombre del cliente requerido')
  if (upper === 'NA' || upper === 'N/A' || upper === 'NULL' || upper === 'NONE') {
    throw new Error('Nombre inválido (NA/NULL/NONE no permitido)')
  }
  return trimmed.toUpperCase()
}

async function fetchClientById(clientId: string) {
  const rowsRaw =
    (await dbQuery(
      `
      SELECT
        c.id,
        c.name,
        c.logo_asset_id,
        a.file_path AS logo_url
      FROM public.clients c
      LEFT JOIN public.assets a ON a.id::text = c.logo_asset_id::text
      WHERE c.id::text = $1
      LIMIT 1
    `,
      [clientId]
    )) || []
  const rows: ClientRow[] = Array.isArray(rowsRaw) ? (rowsRaw as ClientRow[]) : []
  return rows[0] || null
}

async function fetchClientByNameInsensitive(nameUpper: string) {
  const rowsRaw =
    (await dbQuery(
      `
      SELECT
        c.id,
        c.name,
        c.logo_asset_id,
        a.file_path AS logo_url
      FROM public.clients c
      LEFT JOIN public.assets a ON a.id::text = c.logo_asset_id::text
      WHERE UPPER(BTRIM(c.name)) = $1
      LIMIT 1
    `,
      [nameUpper]
    )) || []
  const rows: ClientRow[] = Array.isArray(rowsRaw) ? (rowsRaw as ClientRow[]) : []
  return rows[0] || null
}

export async function createClientAction(input: { name: string; logo_asset_id?: string | null }): Promise<ClientRow> {
  await assertAdminAccess()

  const nameUpper = normalizeClientName(input?.name)
  const logoAssetId = input?.logo_asset_id ? String(input.logo_asset_id) : null

  const existing = await fetchClientByNameInsensitive(nameUpper)
  if (existing) {
    if (logoAssetId && !existing.logo_asset_id) {
      await dbQuery(
        `
        UPDATE public.clients
        SET logo_asset_id = $1
        WHERE id::text = $2
      `,
        [logoAssetId, existing.id]
      )
      const hydrated = await fetchClientById(existing.id)
      revalidatePath('/configuration/clients')
      revalidatePath('/templates')
      return hydrated || { ...existing, logo_asset_id: logoAssetId }
    }
    return existing
  }

  const insertedRaw =
    (await dbQuery(
      `
      INSERT INTO public.clients (id, name, logo_asset_id, created_at)
      VALUES (gen_random_uuid(), $1, $2, now())
      RETURNING id, name, logo_asset_id
    `,
      [nameUpper, logoAssetId]
    )) || []

  const inserted: Array<{ id: string; name: string; logo_asset_id: string | null }> = Array.isArray(insertedRaw)
    ? (insertedRaw as Array<{ id: string; name: string; logo_asset_id: string | null }>)
    : []
  const row = inserted[0]
  const hydrated = row?.id ? await fetchClientById(String(row.id)) : null

  revalidatePath('/configuration/clients')
  revalidatePath('/templates')

  if (hydrated) return hydrated
  if (row) return { ...row, logo_url: null }
  throw new Error('No se pudo crear el cliente')
}

export async function getClientsAction(): Promise<ClientPickerRow[]> {
  await assertAdminAccess()

  const rowsRaw =
    (await dbQuery(
      `
      SELECT
        c.id,
        c.name,
        c.logo_asset_id,
        a.file_path AS logo_url
      FROM public.clients c
      LEFT JOIN public.assets a ON a.id::text = c.logo_asset_id::text
      ORDER BY c.name ASC
    `
    )) || []

  const fromClients: ClientPickerRow[] = Array.isArray(rowsRaw) ? (rowsRaw as ClientPickerRow[]) : []
  const defaults: ClientPickerRow[] = ['CHILEMAT', 'D-ACQUA', 'PROMART', 'FERMETAL'].map((name) => ({
    id: name,
    name,
    logo_asset_id: null,
    logo_url: null,
  }))

  const combined = [...fromClients, ...defaults]
  const unique = combined.reduce<ClientPickerRow[]>((acc, curr) => {
    if (!curr?.name) return acc

    const found = acc.find((item) => item.name.toUpperCase() === curr.name.toUpperCase())
    if (!found) {
      acc.push(curr)
      return acc
    }

    const foundLooksLikeDefault = typeof found.id === 'string' && !found.id.includes('-')
    const currentLooksPersisted = typeof curr.id === 'string' && curr.id.includes('-')
    if (foundLooksLikeDefault && currentLooksPersisted) {
      const idx = acc.indexOf(found)
      acc[idx] = curr
    }

    return acc
  }, [])

  return unique.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export async function updateClientLogoAction(input: { client_id: string; logo_asset_id: string | null }) {
  await assertAdminAccess()

  const clientId = String(input?.client_id || '').trim()
  if (!clientId) throw new Error('client_id requerido')

  const logoAssetId = input?.logo_asset_id ? String(input.logo_asset_id) : null

  await dbQuery(
    `
    UPDATE public.clients
    SET logo_asset_id = $1
    WHERE id::text = $2
  `,
    [logoAssetId, clientId]
  )

  const hydrated = await fetchClientById(clientId)

  revalidatePath('/configuration/clients')
  revalidatePath('/templates')

  return hydrated
}

export async function renameClientAndPropagateAction(input: { client_id: string; new_name: string }) {
  await assertAdminAccess()

  const clientId = String(input?.client_id || '').trim()
  if (!clientId) throw new Error('client_id requerido')

  const nextNameUpper = normalizeClientName(input?.new_name)

  const rows =
    (await dbQuery(
      `
      SELECT *
      FROM public.rpc_rename_client($1::uuid, $2::text)
    `,
      [clientId, nextNameUpper]
    )) || []

  revalidatePath('/configuration/clients')
  revalidatePath('/templates')
  revalidatePath('/generate')

  return rows[0] || { new_name: nextNameUpper }
}

export async function createMissingClientsAction(names: string[]) {
  await assertAdminAccess()

  if (!Array.isArray(names) || names.length === 0) return []

  const unique: string[] = []
  for (const n of names) {
    const trimmed = String(n || '').trim()
    if (!trimmed) continue
    const up = trimmed.toUpperCase()
    if (up === 'NA' || up === 'N/A' || up === 'NULL' || up === 'NONE') continue
    if (!unique.find((x) => x.toUpperCase() === up)) unique.push(trimmed)
  }

  const created: ClientRow[] = []
  for (const n of unique) {
    created.push(await createClientAction({ name: n }))
  }

  return created
}
