'use server'

import { revalidatePath } from 'next/cache'
import { dbQuery } from '@/lib/supabase'

type ClientRow = {
  id: string
  name: string
  logo_asset_id: string | null
  logo_url: string | null
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
  const nameUpper = normalizeClientName(input?.name)
  const logoAssetId = input?.logo_asset_id ? String(input.logo_asset_id) : null

  const existing = await fetchClientByNameInsensitive(nameUpper)
  if (existing) return existing

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

export async function updateClientLogoAction(input: { client_id: string; logo_asset_id: string | null }) {
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
