import { dbQuery } from '@/lib/supabase'
import ClientsClient from './ClientsClient'

export const dynamic = 'force-dynamic'

type ClientRow = {
  id: string
  name: string
  logo_asset_id: string | null
  logo_url: string | null
}

export default async function ClientsPage() {
  const clientsRaw = await dbQuery(
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
    )
  const clients: ClientRow[] = Array.isArray(clientsRaw) ? (clientsRaw as ClientRow[]) : []

  const missingRaw = await dbQuery(
      `
      WITH existing AS (
        SELECT DISTINCT UPPER(BTRIM(name)) AS name_up
        FROM public.clients
        WHERE NULLIF(BTRIM(name), '') IS NOT NULL
      )
      SELECT DISTINCT BTRIM(v.private_label_client_name) AS name
      FROM public.v_ui_generate_list v
      WHERE v.private_label_client_name IS NOT NULL
        AND NULLIF(BTRIM(v.private_label_client_name), '') IS NOT NULL
        AND UPPER(BTRIM(v.private_label_client_name)) NOT IN (SELECT name_up FROM existing)
      ORDER BY name ASC
    `
    )

  const missing = (Array.isArray(missingRaw) ? (missingRaw as Array<{ name: string | null }>) : [])
    .map((r) => (r?.name ? String(r.name).trim() : ''))
    .filter((n: string) => n && n.toUpperCase() !== 'NA')

  return (
    <div className="container mx-auto py-10">
      <ClientsClient initialClients={clients} initialMissing={missing} />
    </div>
  )
}
