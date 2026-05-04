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
    } catch (e: any) {
        return { success: false, error: e.message }
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
    } catch (e: any) {
        return { success: false, error: e.message }
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
    } catch (e: any) {
        return { success: false, error: e.message }
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
        let created = 0
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
    } catch (e: any) {
        return { success: false, merged: 0, created: 0, notFound: [], error: e.message }
    }
}

/** Crear filas faltantes del merge que el usuario decidió aceptar */
export async function createOrphanRowsAction(datasetId: string, rows: Record<string, any>[]) {
    try {
        await _bulkInsertRows(datasetId, rows)
        revalidatePath('/datasets')
        return { success: true, created: rows.length }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDatasetAction(id: string) {
    try {
        await dbQuery(`DELETE FROM public.custom_datasets WHERE id = '${id.replace(/'/g, "''")}'`)
        revalidatePath('/datasets')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
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
