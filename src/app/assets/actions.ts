'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getFamilyFilters, getReferenceFilters } from '@/lib/data/filters'
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertRole('admin')
}

type MeasureRecord = {
    commercial_measure: string
}

type VersionRecord = {
    version_code: string
}

type AssetFilePathRow = {
    file_path: string
}

type AssetTypeRow = {
    type: string
}

type IdRow = {
    id: string
}

type UpdatedCountRow = {
    updated_count: number
}

type ProductResourceStatus = 'draft' | 'review' | 'approved' | 'replaced' | 'rejected'

type ProductResourceAssociationData = {
    assetId: string
    assetType: string
    referenceCodes: string[]
    versionCodes?: string[]
    publicSlug?: string
    versionNumber?: number
    status?: ProductResourceStatus
    sortOrder?: number
    revisionNote?: string
}

const PRODUCT_RESOURCE_STATUSES: ProductResourceStatus[] = ['draft', 'review', 'approved', 'replaced', 'rejected']

function escapeSql(value: string) {
    return value.replace(/'/g, "''")
}

function normalizeResourceStatus(value: unknown): ProductResourceStatus {
    const normalized = String(value || 'approved').trim().toLowerCase()
    return PRODUCT_RESOURCE_STATUSES.includes(normalized as ProductResourceStatus)
        ? (normalized as ProductResourceStatus)
        : 'approved'
}

function normalizePositiveInt(value: unknown, fallback: number) {
    const parsed = Math.trunc(Number(value))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeInt(value: unknown, fallback: number) {
    const parsed = Math.trunc(Number(value))
    return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePublicSlug(value: unknown) {
    return String(value || '').trim().toLowerCase()
}

function buildReferenceConditions(referenceCodes: string[]) {
    return referenceCodes
        .map((raw) => {
            const [familyCode, referenceCode, commercialMeasure] = raw.split('|||').map((part) => part.trim())
            if (!familyCode || !referenceCode) return null
            const parts = [
                `family_code = '${escapeSql(familyCode)}'`,
                `reference_code = '${escapeSql(referenceCode)}'`,
            ]
            if (commercialMeasure) {
                parts.push(`commercial_measure = '${escapeSql(commercialMeasure)}'`)
            }
            return `(${parts.join(' AND ')})`
        })
        .filter((condition): condition is string => Boolean(condition))
}

function buildTargetConditions(targets: Array<{ column: 'reference_id' | 'version_id'; id: string }>) {
    return targets.map((target) => `(${target.column} = '${escapeSql(target.id)}')`)
}

async function revalidateValidationSweepEverywhere() {
    // Local (same server) cache invalidation.
    revalidateTag('validation-sweep', { expire: 0 })

    // Optional remote invalidation (Vercel) when this action runs on localhost.
    const remoteUrl = process.env.REVALIDATE_REMOTE_URL
    const secret = process.env.REVALIDATE_SECRET
    if (!remoteUrl || !secret) return

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        await fetch(remoteUrl, {
            method: 'POST',
            headers: { 'x-revalidate-secret': secret },
            signal: controller.signal,
        })
        clearTimeout(timeout)
    } catch (e) {
        // Non-blocking: the DB write already happened; this only affects freshness in Vercel UI.
        console.warn('Remote revalidate failed:', e)
    }
}

export async function getFamiliesAction() {
    await assertAdminAccess()

    return await getFamilyFilters()
}

export async function getReferencesByFamilyAction(familyCodes: string[]) {
    await assertAdminAccess()

    return await getReferenceFilters(familyCodes)
}

export async function getMeasuresByFamilyAndRefAction(familyCodes: string[], referenceCodes: string[]) {
    await assertAdminAccess()

    if ((!familyCodes || familyCodes.length === 0) && (!referenceCodes || referenceCodes.length === 0)) return []
    
    const whereParts = []
    if (referenceCodes && referenceCodes.length > 0) {
        const specificPairs = referenceCodes.map(v => {
            const [fc, rc] = v.split('|||')
            return `(family_code = '${fc.replace(/'/g, "''")}' AND reference_code = '${rc.replace(/'/g, "''")}')`
        })
        whereParts.push(`(${specificPairs.join(' OR ')})`)
    } else if (familyCodes && familyCodes.length > 0) {
        whereParts.push(`family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const measureRecords = (await dbQuery(`
        SELECT DISTINCT commercial_measure 
        FROM public.v_ui_generate_list 
        WHERE commercial_measure IS NOT NULL AND ${whereParts.join(' AND ')}
        ORDER BY commercial_measure ASC
    `) || []) as MeasureRecord[]
    
     
    return measureRecords.map((rec) => ({ 
        value: rec.commercial_measure, 
        label: rec.commercial_measure 
    }))
}

export async function getVersionsByFamilyAndRefAction(familyCodes: string[], referenceCodes: string[]) {
    await assertAdminAccess()

    if ((!familyCodes || familyCodes.length === 0) && (!referenceCodes || referenceCodes.length === 0)) return []
    
    const whereParts = []
    if (referenceCodes && referenceCodes.length > 0) {
        const specificPairs = referenceCodes.map(v => {
            const [fc, rc] = v.split('|||')
            return `(family_code = '${fc.replace(/'/g, "''")}' AND reference_code = '${rc.replace(/'/g, "''")}')`
        })
        whereParts.push(`(${specificPairs.join(' OR ')})`)
    } else if (familyCodes && familyCodes.length > 0) {
        whereParts.push(`family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
    }

    const versionRecords = (await dbQuery(`
        SELECT DISTINCT version_code 
        FROM public.v_ui_generate_list 
        WHERE version_code IS NOT NULL AND ${whereParts.join(' AND ')}
        ORDER BY version_code ASC
    `) || []) as VersionRecord[]
    
     
    return versionRecords.map((rec) => ({ 
        value: rec.version_code, 
        label: `Versión ${rec.version_code}`
    }))
}

export async function getAssetsByTypeAction(type: string) {
    await assertAdminAccess()

    const safeType = type.replace(/'/g, "''")
    return await dbQuery(`
        WITH asset_counts AS (
            SELECT 
                a.id,
                (
                    (SELECT COUNT(*) FROM public.product_references r WHERE r.isometric_asset_id::text = a.id::text) + 
                    (SELECT COUNT(*) FROM public.product_versions v WHERE v.version_attrs->>'isometric_asset_id' = a.id::text) +
                    (SELECT COUNT(*) FROM public.product_asset_links pal WHERE pal.asset_id::text = a.id::text)
                ) as total_relations
            FROM public.assets a
            WHERE a.type = '${safeType}'
        )
        SELECT 
            a.*, 
            ac.total_relations as relation_count
        FROM public.assets a
        JOIN asset_counts ac ON a.id = ac.id
        WHERE a.type = '${safeType}'
        ORDER BY 
            (CASE WHEN ac.total_relations = 0 AND UPPER(a.type) = 'ISOMETRIC' THEN 0 ELSE 1 END) ASC,
            a.created_at DESC
    `) || []
}

export async function associateProductResourceAction(data: ProductResourceAssociationData) {
    await assertAdminAccess()

    const assetId = String(data.assetId || '').trim()
    const assetType = String(data.assetType || '').trim().toLowerCase()
    if (!assetId) throw new Error('Asset ID is required')
    if (!assetType) throw new Error('El tipo de recurso es obligatorio.')
    if (assetType === 'isometric') {
        throw new Error('Los isometricos deben asociarse por el flujo legacy de isometricos.')
    }

    const assetRows = await dbQuery(`
        SELECT type
        FROM public.assets
        WHERE id = '${escapeSql(assetId)}'
        LIMIT 1
    `) as AssetTypeRow[]
    const asset = assetRows?.[0]
    if (!asset) throw new Error('Asset not found')
    if (String(asset.type || '').toLowerCase() !== assetType) {
        throw new Error('El tipo del archivo seleccionado no coincide con el tipo de recurso.')
    }

    const referenceConditions = buildReferenceConditions(data.referenceCodes || [])
    if (referenceConditions.length === 0) {
        throw new Error('Selecciona al menos una referencia.')
    }

    const refRows = await dbQuery(`
        SELECT id
        FROM public.product_references
        WHERE ${referenceConditions.join(' OR ')}
    `) as IdRow[]
    const referenceIds = refRows.map((row) => row.id).filter(Boolean)
    if (referenceIds.length === 0) {
        throw new Error('No se encontraron referencias para la seleccion.')
    }

    const versionCodes = (data.versionCodes || []).map((code) => String(code || '').trim()).filter(Boolean)
    const targets: Array<{ column: 'reference_id' | 'version_id'; id: string }> = []

    if (versionCodes.length > 0) {
        const versions = await dbQuery(`
            SELECT id
            FROM public.product_versions
            WHERE reference_id IN (${referenceIds.map((id) => `'${escapeSql(id)}'`).join(',')})
              AND version_code IN (${versionCodes.map((code) => `'${escapeSql(code)}'`).join(',')})
        `) as IdRow[]
        for (const version of versions) {
            if (version.id) targets.push({ column: 'version_id', id: version.id })
        }
        if (targets.length === 0) {
            throw new Error('No se encontraron versiones para la seleccion.')
        }
    } else {
        for (const referenceId of referenceIds) {
            targets.push({ column: 'reference_id', id: referenceId })
        }
    }

    const publicSlug = normalizePublicSlug(data.publicSlug)
    if (assetType === 'instruction_pdf') {
        if (!publicSlug) throw new Error('El slug publico es obligatorio para instructivos.')
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug)) {
            throw new Error('El slug publico solo puede usar minusculas, numeros y guiones simples.')
        }
    }

    const status = normalizeResourceStatus(data.status)
    const versionNumber = normalizePositiveInt(data.versionNumber, 1)
    const sortOrder = normalizeInt(data.sortOrder, 0)
    const revisionNote = String(data.revisionNote || '').trim()

    const targetConditions = buildTargetConditions(targets)
    if (publicSlug && status === 'approved' && targetConditions.length > 0) {
        await dbQuery(`
            UPDATE public.product_asset_links
            SET status = 'replaced',
                updated_at = now()
            WHERE public_slug = '${escapeSql(publicSlug)}'
              AND status = 'approved'
              AND (${targetConditions.join(' OR ')})
        `)
    }

    const values = targets.map((target) => {
        const referenceValue = target.column === 'reference_id' ? `'${escapeSql(target.id)}'` : 'NULL'
        const versionValue = target.column === 'version_id' ? `'${escapeSql(target.id)}'` : 'NULL'
        const slugValue = publicSlug ? `'${escapeSql(publicSlug)}'` : 'NULL'
        const noteValue = revisionNote ? `'${escapeSql(revisionNote)}'` : 'NULL'
        return `('${escapeSql(assetId)}', ${referenceValue}, ${versionValue}, NULL, ${slugValue}, ${versionNumber}, '${status}', ${sortOrder}, ${noteValue})`
    })

    await dbQuery(`
        INSERT INTO public.product_asset_links (
            asset_id,
            reference_id,
            version_id,
            sku_id,
            public_slug,
            version_number,
            status,
            sort_order,
            revision_note
        )
        VALUES ${values.join(',')}
    `)

    revalidatePath('/assets')
    return { success: true, insertedCount: targets.length }
}

export interface IsometricGroupRow {
    id: string
    name: string
    type: string
    file_path: string
    tags: string | null
    created_at: string
    updated_at: string
    relation_count: number
    family_code: string | null
    product_name: string | null
}

export async function getGroupedIsometricsAction() {
    await assertAdminAccess()

    return await dbQuery(`
        WITH asset_counts AS (
            SELECT 
                a.id,
                (
                    (SELECT COUNT(*) FROM public.product_references r WHERE r.isometric_asset_id::text = a.id::text) + 
                    (SELECT COUNT(*) FROM public.product_versions v WHERE v.version_attrs->>'isometric_asset_id' = a.id::text)
                ) as total_relations
            FROM public.assets a
            WHERE a.type = 'isometric'
        )
        SELECT 
            a.*, 
            ac.total_relations as relation_count,
            pr.family_code,
            pr.product_name
        FROM public.assets a
        JOIN asset_counts ac ON a.id = ac.id
        LEFT JOIN public.product_references pr ON pr.isometric_asset_id::text = a.id::text
        WHERE a.type = 'isometric'
        ORDER BY 
            pr.family_code NULLS LAST,
            pr.product_name NULLS LAST,
            a.name ASC
    `) || []
}

export async function associateIsometricAction(data: {
    assetId: string,
    familyCodes: string[],
    referenceCodes: string[],
    measureCodes?: string[],
    versionCodes?: string[]
}) {
    await assertAdminAccess()

    const { assetId, familyCodes, referenceCodes, measureCodes = [], versionCodes = [] } = data
    
    if (!assetId) throw new Error("Asset ID is required")
    
     
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${assetId}' LIMIT 1`) as AssetFilePathRow[]
    if (!asset || asset.length === 0) throw new Error("Asset not found")
    const filePath = asset[0].file_path

    // --- 1. Identify Target References ---
    let refIds: string[] = []
    
    if (referenceCodes.length > 0) {
        const specificPairs = referenceCodes.map(v => {
            const [fc, rc, cm] = v.split('|||')
            let condition = `(family_code = '${fc.replace(/'/g, "''")}' AND reference_code = '${rc.replace(/'/g, "''")}')`
            if (cm) {
                condition = `(family_code = '${fc.replace(/'/g, "''")}' AND reference_code = '${rc.replace(/'/g, "''")}' AND commercial_measure = '${cm.replace(/'/g, "''")}')`
            }
            return condition
        })
         
        const refs = await dbQuery(`SELECT id FROM public.product_references WHERE ${specificPairs.join(' OR ')}`) as IdRow[]
        refIds = refs.map((r) => r.id)
    } else if (familyCodes.length > 0) {
        let query = `SELECT id FROM public.product_references WHERE family_code IN (${familyCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        if (measureCodes && measureCodes.length > 0) {
            query += ` AND commercial_measure IN (${measureCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        }
         
        const refs = await dbQuery(query) as IdRow[]
        refIds = refs.map((r) => r.id)
    } else {
        throw new Error("Target selection (Family or Reference) is required")
    }

    if (refIds.length === 0) throw new Error("No references found for the selection")

    // --- 2. Perform Update based on Granularity ---
    let updatedCount = 0
    if (versionCodes && versionCodes.length > 0) {
        // CASE: Override by Version
        // We update product_versions.version_attrs JSONB field
        const versionFilter = `(${versionCodes.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`
        const refsFilter = `(${refIds.map(id => `'${id}'`).join(',')})`
        
        await dbQuery(`
            UPDATE public.product_versions
            SET version_attrs = jsonb_set(
                jsonb_set(COALESCE(version_attrs, '{}'::jsonb), '{isometric_asset_id}', '"${assetId}"'),
                '{isometric_path}', '"${filePath}"'
            ),
            updated_at = now()
            WHERE reference_id IN ${refsFilter} AND version_code IN ${versionFilter}
        `)

         
        const verifyRows = (await dbQuery(`
            SELECT COUNT(*)::int as updated_count
            FROM public.product_versions
            WHERE reference_id IN ${refsFilter}
              AND version_code IN ${versionFilter}
              AND version_attrs->>'isometric_asset_id' = '${assetId.replace(/'/g, "''")}'
        `) || []) as UpdatedCountRow[]
        updatedCount = Number(verifyRows?.[0]?.updated_count || 0)
    } else {
        // CASE: Default Reference Asset
        // We update product_references directly
        const refsFilter = `(${refIds.map(id => `'${id}'`).join(',')})`
        await dbQuery(`
            UPDATE public.product_references
            SET isometric_asset_id = '${assetId}',
                isometric_path = '${filePath}',
                updated_at = now()
            WHERE id IN ${refsFilter}
        `)

         
        const verifyRows = (await dbQuery(`
            SELECT COUNT(*)::int as updated_count
            FROM public.product_references
            WHERE id IN ${refsFilter}
              AND isometric_asset_id = '${assetId.replace(/'/g, "''")}'
        `) || []) as UpdatedCountRow[]
        updatedCount = Number(verifyRows?.[0]?.updated_count || 0)
    }

    if (!updatedCount || updatedCount <= 0) {
        throw new Error("No se actualizo ningun registro con la seleccion actual.")
    }

    revalidatePath('/assets')

    await revalidateValidationSweepEverywhere()
    
    return { success: true, updatedCount }
}

export async function deleteAssetAction(assetId: string) {
    await assertAdminAccess()

    // 1. Protección contra el borrado de activos de sistema
    const defaults = (await dbQuery(`SELECT id FROM public.assets WHERE name IN (
        'Logo Empresa Pordefecto',
        'Isométrico (Placeholder)',
        'Icono RH Fijo',
        'Icono Canto',
        'Icono Cierre Lento',
        'Icono Extensión Total',
        'Icono CARB2',
        'Logo CHILEMAT',
        'Logo D-ACQUA',
        'Logo PROMART',
        'Logo FERMETAL'
    )`) || []) as IdRow[]
    
    if (defaults.some((d) => d.id === assetId)) {
        throw new Error("No puedes eliminar un recurso del sistema por defecto.")
    }

    const safeId = assetId.replace(/'/g, "''")

    // 2. Obtener metadatos del archivo para borrar del Storage
     
    const asset = await dbQuery(`SELECT file_path FROM public.assets WHERE id = '${safeId}' LIMIT 1`) as AssetFilePathRow[]
    if (!asset || asset.length === 0) return { success: true } // Ya no existe
    const filePath = asset[0].file_path

    // 3. LIMPIEZA PROFUNDA (Cascada manual)
    
    // 3a. Limpiar en Referencias
    await dbQuery(`
        UPDATE public.product_references 
        SET isometric_asset_id = NULL, 
            isometric_path = NULL,
            updated_at = now()
        WHERE isometric_asset_id = '${safeId}'
    `)

    // 3b. Limpiar en Versiones (JSONB)
    // Usamos el operador '-' para eliminar las llaves del objeto JSONB
    await dbQuery(`
        UPDATE public.product_versions 
        SET version_attrs = version_attrs - 'isometric_asset_id' - 'isometric_path',
            updated_at = now()
        WHERE version_attrs->>'isometric_asset_id' = '${safeId}'
    `)

    // 4. Borrar archivo físico de Supabase Storage
    try {
        // Extraer el nombre del archivo de la URL
        // Las URLs de Supabase suelen terminar en /assets/nombre-archivo.ext
        const urlParts = filePath.split('/')
        const fileName = urlParts[urlParts.length - 1]
        
        if (fileName && filePath.includes('supabase')) {
            const { supabase } = await import('@/lib/supabase')
            await supabase.storage.from('assets').remove([`assets/${fileName}`])
        }
    } catch (storageError) {
        console.error("Error al borrar archivo de storage:", storageError)
        // No bloqueamos el flujo si falla el storage físico
    }

    // 5. Borrar registro de la tabla assets
    await dbQuery(`DELETE FROM public.assets WHERE id = '${safeId}'`)
    
    revalidatePath('/assets')

    
    return { success: true }
}

export async function updateAssetAction(assetId: string, data: { name?: string, file_path?: string, type?: string }) {
    await assertAdminAccess()

    const updates = []
    if (data.name) updates.push(`name = '${data.name.replace(/'/g, "''")}'`)
    if (data.file_path) updates.push(`file_path = '${data.file_path.replace(/'/g, "''")}'`)
    if (data.type) updates.push(`type = '${data.type.replace(/'/g, "''")}'`)
    
    if (updates.length === 0) return { success: true }

    await dbQuery(`
        UPDATE public.assets 
        SET ${updates.join(', ')}, updated_at = now() 
        WHERE id = '${assetId}'
    `)

    // Propagate new file_path to V6.1 tables only
    if (data.file_path) {
        const newPath = data.file_path.replace(/'/g, "''")
        
        // 1. Update references
        await dbQuery(`
            UPDATE public.product_references
            SET isometric_path = '${newPath}',
                updated_at = now()
            WHERE isometric_asset_id = '${assetId}'
        `)

        // 2. Update version overrides in JSONB
        // This is more complex: we need to update the path inside the JSONB if the asset_id matches
        await dbQuery(`
            UPDATE public.product_versions
            SET version_attrs = jsonb_set(version_attrs, '{isometric_path}', '"${newPath}"'),
                updated_at = now()
            WHERE version_attrs->>'isometric_asset_id' = '${assetId}'
        `)
    }

    revalidatePath('/assets')

    return { success: true }
}

export async function getAssetRelationshipsAction(assetId: string) {
    await assertAdminAccess()

    const safeId = assetId.replace(/'/g, "''")
    
    // 1. Fetch references
    const refs = await dbQuery(`
        SELECT 
            r.id as target_id,
            r.id, r.reference_code, r.product_name, r.commercial_measure,
            r.designation, r.ref_attrs->>'accessory_text' as accessory_text, r.special_label,
            f.family_name as line_name,
            r.id as relationship_id,
            'legacy_isometric' as relationship_source,
            NULL::text as public_slug,
            NULL::text as status,
            NULL::int as version_number
        FROM public.product_references r
        JOIN public.families f ON r.family_code = f.family_code
        WHERE r.isometric_asset_id::text = '${safeId}'
        UNION ALL
        SELECT
            r.id as target_id,
            r.id, r.reference_code, r.product_name, r.commercial_measure,
            r.designation, r.ref_attrs->>'accessory_text' as accessory_text, r.special_label,
            f.family_name as line_name,
            pal.id as relationship_id,
            'product_asset_link' as relationship_source,
            pal.public_slug,
            pal.status,
            pal.version_number
        FROM public.product_asset_links pal
        JOIN public.product_references r ON r.id = pal.reference_id
        JOIN public.families f ON r.family_code = f.family_code
        WHERE pal.asset_id::text = '${safeId}'
        ORDER BY reference_code ASC
    `) || []

    // 2. Fetch version overrides
    const versions = await dbQuery(`
        SELECT 
            v.id as target_id,
            v.id, v.version_code, v.reference_id,
            r.reference_code, r.product_name, r.commercial_measure,
            r.designation, r.ref_attrs->>'accessory_text' as accessory_text, r.special_label,
            f.family_name as line_name,
            v.id as relationship_id,
            'legacy_isometric' as relationship_source,
            NULL::text as public_slug,
            NULL::text as status,
            NULL::int as version_number
        FROM public.product_versions v
        JOIN public.product_references r ON v.reference_id = r.id
        JOIN public.families f ON r.family_code = f.family_code
        WHERE v.version_attrs->>'isometric_asset_id' = '${safeId}'
        UNION ALL
        SELECT
            v.id as target_id,
            v.id, v.version_code, v.reference_id,
            r.reference_code, r.product_name, r.commercial_measure,
            r.designation, r.ref_attrs->>'accessory_text' as accessory_text, r.special_label,
            f.family_name as line_name,
            pal.id as relationship_id,
            'product_asset_link' as relationship_source,
            pal.public_slug,
            pal.status,
            pal.version_number
        FROM public.product_asset_links pal
        JOIN public.product_versions v ON v.id = pal.version_id
        JOIN public.product_references r ON v.reference_id = r.id
        JOIN public.families f ON r.family_code = f.family_code
        WHERE pal.asset_id::text = '${safeId}'
        ORDER BY reference_code ASC, version_code ASC
    `) || []

    return { references: refs, versions }
}

export async function unlinkProductAssetLinkAction(linkId: string) {
    await assertAdminAccess()

    const safeId = linkId.replace(/'/g, "''")
    await dbQuery(`
        DELETE FROM public.product_asset_links
        WHERE id = '${safeId}'
    `)
    revalidatePath('/assets')
    return { success: true }
}

export async function unlinkReferenceAction(referenceId: string) {
    await assertAdminAccess()

    await dbQuery(`
        UPDATE public.product_references
        SET isometric_asset_id = NULL,
            isometric_path = NULL,
            updated_at = now()
        WHERE id = '${referenceId}'
    `)
    revalidatePath('/assets')

    await revalidateValidationSweepEverywhere()
    return { success: true }
}

export async function unlinkVersionAction(versionId: string) {
    await assertAdminAccess()

    await dbQuery(`
        UPDATE public.product_versions
        SET version_attrs = version_attrs - 'isometric_asset_id' - 'isometric_path',
            updated_at = now()
        WHERE id = '${versionId}'
    `)
    revalidatePath('/assets')

    await revalidateValidationSweepEverywhere()
    return { success: true }
}

export async function unlinkAllAssetRelationshipsAction(assetId: string) {
    await assertAdminAccess()

    const safeId = assetId.replace(/'/g, "''")
    
    // Unlink references
    await dbQuery(`
        UPDATE public.product_references
        SET isometric_asset_id = NULL,
            isometric_path = NULL,
            updated_at = now()
        WHERE isometric_asset_id = '${safeId}'
    `)

    // Unlink versions
    await dbQuery(`
        UPDATE public.product_versions
        SET version_attrs = version_attrs - 'isometric_asset_id' - 'isometric_path',
            updated_at = now()
        WHERE version_attrs->>'isometric_asset_id' = '${safeId}'
    `)

    await dbQuery(`
        DELETE FROM public.product_asset_links
        WHERE asset_id::text = '${safeId}'
    `)

    revalidatePath('/assets')

    await revalidateValidationSweepEverywhere()
    return { success: true }
}
