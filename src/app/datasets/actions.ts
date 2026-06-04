"use server"

import { dbQuery } from "@/lib/supabase"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldDef = {
    key: string        // Nombre funcional (slug), ej: "tienda_name"
    label: string      // Nombre público, ej: "Nombre de Tienda"
    original: string   // Header original del CSV, ej: "Tienda"
    is_identifier: boolean // Primera columna = true
}

export type CustomDataset = {
    id: string
    name: string
    schema_json: FieldDef[]
    created_at: string
    row_count?: number
}

export async function revalidateDatasetsPathsAction() {
    revalidatePath('/datasets')
    revalidatePath('/templates')
    revalidatePath('/generate')
    return { success: true }
}

type TemplateLinkRow = { template_id: string; dataset_id: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function linkDatasetToTemplatesAction(datasetId: string, templateIds: string[]) {
    const did = String(datasetId || '').trim()
    if (!UUID_RE.test(did)) return { success: false, error: 'dataset_id inválido' }

    const validTemplateIds = (templateIds || []).map(v => String(v || '').trim()).filter(v => UUID_RE.test(v))
    if (validTemplateIds.length === 0) return { success: true, linked: 0 }

    const values = validTemplateIds
        .map((tid) => `('${tid.replace(/'/g, "''")}', '${did.replace(/'/g, "''")}')`)
        .join(', ')

    try {
        await dbQuery(`
            INSERT INTO public.template_dataset_links (template_id, dataset_id)
            VALUES ${values}
            ON CONFLICT (template_id, dataset_id) DO NOTHING
        `)
        revalidatePath('/datasets')
        revalidatePath('/templates')
        revalidatePath('/generate')
        return { success: true, linked: validTemplateIds.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function unlinkDatasetFromTemplateAction(datasetId: string, templateId: string) {
    const did = String(datasetId || '').trim()
    const tid = String(templateId || '').trim()
    if (!UUID_RE.test(did) || !UUID_RE.test(tid)) return { success: false, error: 'IDs inválidos' }

    try {
        await dbQuery(`
            DELETE FROM public.template_dataset_links
            WHERE template_id = '${tid.replace(/'/g, "''")}' AND dataset_id = '${did.replace(/'/g, "''")}'
        `)
        revalidatePath('/datasets')
        revalidatePath('/templates')
        revalidatePath('/generate')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function getDatasetLinkedTemplateIdsAction(datasetId: string): Promise<string[]> {
    const did = String(datasetId || '').trim()
    if (!UUID_RE.test(did)) return []

    try {
        const rows = (await dbQuery(`
            SELECT template_id, dataset_id
            FROM public.template_dataset_links
            WHERE dataset_id = '${did.replace(/'/g, "''")}'
        `)) as TemplateLinkRow[]

        return (rows || []).map(r => String(r.template_id)).filter(Boolean)
    } catch {
        return []
    }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getDatasetsAction(): Promise<CustomDataset[]> {
    try {
        const rows = await dbQuery(`
            SELECT d.id, d.name, d.schema_json, d.created_at,
                   COUNT(r.id)::int AS row_count
            FROM public.custom_datasets d
            LEFT JOIN public.custom_dataset_rows r ON r.dataset_id = d.id
            GROUP BY d.id, d.name, d.schema_json, d.created_at
            ORDER BY d.created_at DESC
        `)
        return (rows || []).map((d: any) => ({
            ...d,
            schema_json: typeof d.schema_json === 'string' ? JSON.parse(d.schema_json) : (d.schema_json || [])
        }))
    } catch {
        return []
    }
}

export async function getDatasetByIdAction(id: string): Promise<CustomDataset | null> {
    try {
        const rows = await dbQuery(`
            SELECT id, name, schema_json, created_at
            FROM public.custom_datasets
            WHERE id = '${id.replace(/'/g, "''")}'
            LIMIT 1
        `)
        if (!rows?.[0]) return null
        const d = rows[0]
        return {
            ...d,
            schema_json: typeof d.schema_json === 'string' ? JSON.parse(d.schema_json) : (d.schema_json || [])
        }
    } catch {
        return null
    }
}

export async function getDatasetSampleRowAction(datasetId: string): Promise<Record<string, string> | null> {
    try {
        const rows = await dbQuery(`
            SELECT data_json FROM public.custom_dataset_rows
            WHERE dataset_id = '${datasetId.replace(/'/g, "''")}'
            ORDER BY RANDOM()
            LIMIT 1
        `)
        if (!rows?.[0]) return null
        const raw = rows[0].data_json
        return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
        return null
    }
}

// ─── Create Dataset ────────────────────────────────────────────────────────────

export async function createDatasetAction(data: {
    name: string
    schema: FieldDef[]
}) {
    try {
        const schemaStr = JSON.stringify(data.schema).replace(/'/g, "''")
        const nameStr = data.name.replace(/'/g, "''")
        const rows = await dbQuery(`
            INSERT INTO public.custom_datasets (name, schema_json)
            VALUES ('${nameStr}', '${schemaStr}'::jsonb)
            RETURNING id
        `)
        revalidatePath('/datasets')
        return { success: true, id: rows?.[0]?.id }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

// ─── Ingest Rows (3 strategies) ────────────────────────────────────────────────

/** Sobrescribir (Overwrite): borra todo y recarga */
export async function overwriteDatasetRowsAction(datasetId: string, rows: Record<string, any>[], newSchema?: FieldDef[]) {
    try {
        const id = datasetId.replace(/'/g, "''")
        await dbQuery(`DELETE FROM public.custom_dataset_rows WHERE dataset_id = '${id}'`)

        if (newSchema) {
            const schemaStr = JSON.stringify(newSchema).replace(/'/g, "''")
            await dbQuery(`UPDATE public.custom_datasets SET schema_json = '${schemaStr}'::jsonb WHERE id = '${id}'`)
        }

        await _bulkInsertRows(datasetId, rows)
        revalidatePath('/datasets')
        return { success: true, inserted: rows.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

/** Añadir Filas (Append): agrega nuevas filas, actualiza schema si hay columnas nuevas */
export async function appendDatasetRowsAction(datasetId: string, rows: Record<string, any>[], newSchema?: FieldDef[]) {
    try {
        if (newSchema) {
            const id = datasetId.replace(/'/g, "''")
            const schemaStr = JSON.stringify(newSchema).replace(/'/g, "''")
            await dbQuery(`UPDATE public.custom_datasets SET schema_json = '${schemaStr}'::jsonb WHERE id = '${id}'`)
        }
        await _bulkInsertRows(datasetId, rows)
        revalidatePath('/datasets')
        return { success: true, inserted: rows.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

/** Unir Columnas (Merge by Key): encuentra filas existentes y fusiona datos, con alertas para las no encontradas */
export async function mergeDatasetRowsAction(
    datasetId: string,
    rows: Record<string, any>[],
    joinKey: string,        // key funcional que sirve como identificador
    newSchema?: FieldDef[]
): Promise<{ success: boolean; merged: number; created: number; notFound: string[]; error?: string }> {
    try {
        const id = datasetId.replace(/'/g, "''")

        // 1. Actualizar esquema si hay columnas nuevas
        if (newSchema) {
            const schemaStr = JSON.stringify(newSchema).replace(/'/g, "''")
            await dbQuery(`UPDATE public.custom_datasets SET schema_json = '${schemaStr}'::jsonb WHERE id = '${id}'`)
        }

        // 2. Obtener todas las filas existentes con su identificador
        const existing: any[] = await dbQuery(`
            SELECT id, data_json->>'${joinKey}' AS join_val, data_json
            FROM public.custom_dataset_rows
            WHERE dataset_id = '${id}'
        `)

        const existingMap: Record<string, string> = {}
        for (const r of (existing || [])) {
            if (r.join_val) existingMap[r.join_val] = r.id
        }

        let merged = 0
        const created = 0
        const notFound: string[] = []

        for (const row of rows) {
            const keyVal = String(row[joinKey] ?? '')
            const existingId = existingMap[keyVal]

            if (existingId) {
                // Merge: traer JSON existente, fusionar, guardar
                const existingRows = await dbQuery(`SELECT data_json FROM public.custom_dataset_rows WHERE id = '${existingId}'`)
                const currentData = typeof existingRows?.[0]?.data_json === 'string'
                    ? JSON.parse(existingRows[0].data_json)
                    : (existingRows?.[0]?.data_json || {})
                const merged_data = { ...currentData, ...row }
                const mergedStr = JSON.stringify(merged_data).replace(/'/g, "''")
                await dbQuery(`
                    UPDATE public.custom_dataset_rows
                    SET data_json = '${mergedStr}'::jsonb, updated_at = NOW()
                    WHERE id = '${existingId}'
                `)
                merged++
            } else {
                // Key no encontrada — la colectamos para alertar al usuario
                notFound.push(keyVal)
            }
        }

        revalidatePath('/datasets')
        return { success: true, merged, created, notFound }
    } catch (e) {
        return { success: false, merged: 0, created: 0, notFound: [], error: e instanceof Error ? e.message : String(e) }
    }
}

/** Crear filas faltantes del merge que el usuario decidió aceptar */
export async function createOrphanRowsAction(datasetId: string, rows: Record<string, any>[]) {
    try {
        await _bulkInsertRows(datasetId, rows)
        revalidatePath('/datasets')
        return { success: true, created: rows.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function backfillDatasetRowKeysAction(
    datasetId: string,
    renames: { fromKey: string; toKey: string }[]
) {
    try {
        const id = String(datasetId || '').trim()
        if (!UUID_RE.test(id)) return { success: false, error: 'dataset_id inválido' }

        const pairs = (renames || [])
            .map((r) => ({ fromKey: String(r?.fromKey || '').trim(), toKey: String(r?.toKey || '').trim() }))
            .filter((r) => r.fromKey && r.toKey && r.fromKey !== r.toKey)

        if (pairs.length === 0) return { success: true, updated: 0 }

        for (const { fromKey, toKey } of pairs) {
            const fromEsc = fromKey.replace(/'/g, "''")
            const toEsc = toKey.replace(/'/g, "''")
            await dbQuery(`
                UPDATE public.custom_dataset_rows
                SET data_json = CASE
                    WHEN (data_json ? '${fromEsc}') AND NOT (data_json ? '${toEsc}')
                        THEN data_json || jsonb_build_object('${toEsc}', data_json->'${fromEsc}')
                    ELSE data_json
                END,
                updated_at = NOW()
                WHERE dataset_id = '${id.replace(/'/g, "''")}'
            `)
        }

        revalidatePath('/datasets')
        revalidatePath('/templates')
        revalidatePath('/generate')
        return { success: true, updated: pairs.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function normalizeDatasetRowJsonKeysAction(datasetId: string) {
    try {
        const id = String(datasetId || '').trim()
        if (!UUID_RE.test(id)) return { success: false, error: 'dataset_id inválido' }

        const dsRows = await dbQuery(`
            SELECT schema_json
            FROM public.custom_datasets
            WHERE id = '${id.replace(/'/g, "''")}'
            LIMIT 1
        `)
        const ds = dsRows?.[0]
        if (!ds) return { success: false, error: 'Dataset no encontrado' }

        const raw = typeof ds.schema_json === 'string' ? JSON.parse(ds.schema_json) : ds.schema_json
        const columns =
            raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).columns)
                ? (raw as any).columns
                : null

        if (!columns) {
            // Sin `columns` no podemos inferir qué llaves son duplicadas de forma segura.
            return { success: true, removedKeys: 0 }
        }

        const toDrop = Array.from(
            new Set(
                (columns as any[])
                    .map((c) => ({ original: String(c?.original ?? ''), key: String(c?.key ?? '') }))
                    .filter((c) => c.original && c.key && c.original !== c.key)
                    .map((c) => c.original)
            )
        )

        for (const k of toDrop) {
            const keyEsc = k.replace(/'/g, "''")
            await dbQuery(`
                UPDATE public.custom_dataset_rows
                SET data_json = data_json - '${keyEsc}', updated_at = NOW()
                WHERE dataset_id = '${id.replace(/'/g, "''")}' AND (data_json ? '${keyEsc}')
            `)
        }

        revalidatePath('/datasets')
        revalidatePath('/generate')
        return { success: true, removedKeys: toDrop.length }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function deleteDatasetAction(id: string) {
    try {
        const safeId = id.replace(/'/g, "''")
        await dbQuery(`
            DELETE FROM public.custom_dataset_rows WHERE dataset_id = '${safeId}';
            DELETE FROM public.custom_datasets WHERE id = '${safeId}';
        `)
        revalidatePath('/datasets')
        return { success: true }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

// ─── Helpers (private) ────────────────────────────────────────────────────────

async function _bulkInsertRows(datasetId: string, rows: Record<string, any>[]) {
    if (!rows.length) return
    const id = datasetId.replace(/'/g, "''")
    // Insert en lotes de 100 para no saturar el payload
    const BATCH = 100
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const values = batch.map(r => {
            const jsonStr = JSON.stringify(r).replace(/'/g, "''")
            return `('${id}', '${jsonStr}'::jsonb)`
        }).join(', ')
        await dbQuery(`
            INSERT INTO public.custom_dataset_rows (dataset_id, data_json)
            VALUES ${values}
        `)
    }
}
