'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertRole } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertRole('admin')
}

/**
 * Sweeps validation everywhere to ensure UI is fresh.
 */
async function revalidateValidationSweepEverywhere() {
    revalidateTag('validation-sweep', { expire: 0 })
    const remoteUrl = process.env.REVALIDATE_REMOTE_URL
    const secret = process.env.REVALIDATE_SECRET
    if (!remoteUrl || !secret) return
    try {
        await fetch(remoteUrl, {
            method: 'POST',
            headers: { 'x-revalidate-secret': secret },
        })
    } catch (e) {
        console.warn('Remote revalidate failed:', e)
    }
}

export type IsometricSuggestion = {
    missingReferenceId: string
    missingCode: string
    missingName: string
    suggestedAssetId: string
    suggestedPath: string
    suggestedSourceName: string
    suggestedSourceCode: string
    matchLevel: 'very_high' | 'high' | 'medium'
}

export type IsometricNormalizationGroup = {
    id: string // Logical key hash or combo
    displayName: string
    attributes: {
        family: string
        name: string
        designation: string
        measure: string
        accessory: string
        specialLabel: string
    }
    options: {
        assetId: string
        path: string
        usageCount: number
        references: {
            sku: string
            name: string
        }[]
    }[]
    totalReferences: number
}

interface ProductRow {
    id: string
    reference_code: string
    product_name: string
    family_code: string
    designation: string
    commercial_measure: string
    special_label: string | null
    ref_attrs: { accessory_text?: string } | null
    sku_complete: string
    final_complete_name_es: string | null
    isometric_asset_id?: string
    isometric_path?: string
    reference_id?: string
}

type SkuReferenceRow = {
    sku_id: string
    reference_id: string
}

type NormalizationGroupRow = {
    family_code: string
    family_name: string
    product_name: string
    designation: string
    commercial_measure: string
    accessory_text: string
    special_label: string
}

type NormalizationReferenceRow = {
    reference_id: string
    isometric_asset_id: string | null
    isometric_path: string | null
    sample_sku: string
    sample_name: string
}

type ReferenceIdRow = {
    id: string
}

type UsageCountRow = {
    count: string | number
}

type AssetPathRow = {
    path: string
}

/**
 * Compares two products to determine their compatibility level for reusing an isometric.
 */
function calculateMatchLevel(missing: ProductRow, existing: ProductRow): IsometricSuggestion['matchLevel'] | null {
    // Basic requirements: Designation, Measure, Name MUST match
    if (
        missing.designation !== existing.designation ||
        missing.commercial_measure !== existing.commercial_measure ||
        missing.product_name !== existing.product_name
    ) {
        return null
    }

    const mAcc = (missing.ref_attrs?.accessory_text || 'NA').trim().toUpperCase()
    const eAcc = (existing.ref_attrs?.accessory_text || 'NA').trim().toUpperCase()
    
    const mSl = (missing.special_label || 'NA').trim().toUpperCase()
    const eSl = (existing.special_label || 'NA').trim().toUpperCase()

    // VERY HIGH: Everything matches including special_label
    if (mAcc === eAcc && mSl === eSl) return 'very_high'
    
    // HIGH: Everything matches except special_label
    if (mAcc === eAcc) return 'high'
    
    // MEDIUM: Only core attributes match (Acc and SL differ)
    return 'medium'
}

/**
 * Finds suggestions for missing isometrics based on existing ones.
 */
export async function getIsometricSuggestionsAction(): Promise<IsometricSuggestion[]> {
    await assertAdminAccess()

    // 1. Get products missing isometrics
     
    const missingRows = (await dbQuery(`
        SELECT 
            id, reference_code, product_name, family_code, designation, 
            commercial_measure, special_label, ref_attrs, sku_complete,
            final_complete_name_es
        FROM public.v_ui_generate_list
        WHERE (status IS NULL OR status <> 'INACTIVO')
          AND COALESCE(effective_version_attrs->>'isometric_path','') = ''
          AND (isometric_path IS NULL OR isometric_path = '')
    `) || []) as ProductRow[]

    // 2. Get products that HAVE isometrics
     
    const existingRows = (await dbQuery(`
        SELECT 
            id, reference_code, product_name, family_code, designation, 
            commercial_measure, special_label, ref_attrs, 
            isometric_asset_id, isometric_path, sku_complete,
            final_complete_name_es
        FROM public.v_ui_generate_list
        WHERE (status IS NULL OR status <> 'INACTIVO')
          AND (isometric_path IS NOT NULL AND isometric_path <> '')
    `) || []) as ProductRow[]

    const suggestions: IsometricSuggestion[] = []

    // 3. For each missing, look for the best existing match
    for (const m of missingRows) {
        let bestMatch: ProductRow | null = null
        let bestLevel: IsometricSuggestion['matchLevel'] | null = null

        for (const e of existingRows) {
            const level = calculateMatchLevel(m, e)
            if (!level) continue

            // Priority: very_high > high > medium
            if (!bestLevel || 
                (level === 'very_high' && bestLevel !== 'very_high') || 
                (level === 'high' && bestLevel === 'medium')) {
                bestMatch = e
                bestLevel = level
            }
            
            // If we find a very_high match, we can stop looking for this item
            if (level === 'very_high') break
        }

        if (bestMatch && bestLevel) {
            suggestions.push({
                missingReferenceId: m.id,
                missingCode: m.sku_complete,
                missingName: m.final_complete_name_es || m.product_name || 'Sin nombre',
                suggestedAssetId: bestMatch.isometric_asset_id || '',
                suggestedPath: bestMatch.isometric_path || '',
                suggestedSourceName: bestMatch.final_complete_name_es || bestMatch.product_name,
                suggestedSourceCode: bestMatch.sku_complete,
                matchLevel: bestLevel
            })
        }
    }

    return suggestions
}

/**
 * Applies selected suggestions to the database.
 */
export async function applySmartAssociationsAction(associations: { 
    skuId: string, 
    assetId: string, 
    path: string 
}[]) {
    await assertAdminAccess()

    if (associations.length === 0) return { success: true, count: 0 }

    // Since we want to update the REFERENCE level (per user request), 
    // we first need to find the reference_id for each SKU.
    const skuIds = associations.map(a => `'${a.skuId}'`).join(',')
     
    const mapping = (await dbQuery(`
        SELECT s.id as sku_id, v.reference_id
        FROM public.product_skus s
        JOIN public.product_versions v ON s.version_id = v.id
        WHERE s.id IN (${skuIds})
    `) || []) as SkuReferenceRow[]

    const refUpdates = new Map<string, { assetId: string, path: string }>()
    for (const m of mapping) {
        const assoc = associations.find(a => a.skuId === m.sku_id)
        if (assoc) {
            refUpdates.set(m.reference_id, { assetId: assoc.assetId, path: assoc.path })
        }
    }

    let count = 0
    for (const [refId, data] of refUpdates.entries()) {
        await dbQuery(`
            UPDATE public.product_references
            SET isometric_asset_id = '${data.assetId}',
                isometric_path = '${data.path}',
                updated_at = now()
            WHERE id = '${refId}'
        `)
        count++
    }

    revalidatePath('/assets')
    await revalidateValidationSweepEverywhere()

    return { success: true, count }
}

/**
 * Finds groups of references that have identical attributes but different isometric assets.
 */
export async function getIsometricNormalizationGroupsAction(): Promise<IsometricNormalizationGroup[]> {
    await assertAdminAccess()

    // 1. Find the groups based on ALL core attributes including special_label
     
    const groups = (await dbQuery(`
        SELECT 
            r.family_code, f.family_name, r.product_name, r.designation, r.commercial_measure, 
            COALESCE(r.ref_attrs->>'accessory_text', '') as accessory_text,
            COALESCE(r.special_label, '') as special_label,
            COUNT(DISTINCT r.isometric_asset_id) as asset_count
        FROM public.product_references r
        JOIN public.families f ON r.family_code = f.family_code
        WHERE r.isometric_asset_id IS NOT NULL
        GROUP BY 
            r.family_code, f.family_name, r.product_name, r.designation, r.commercial_measure, 
            COALESCE(r.ref_attrs->>'accessory_text', ''), COALESCE(r.special_label, '')
        HAVING COUNT(DISTINCT r.isometric_asset_id) > 1
    `) || []) as NormalizationGroupRow[]

    const result: IsometricNormalizationGroup[] = []

    for (const g of groups) {
        // 2. Fetch references for this group to get details, including the final constructed name
         
        const refs = (await dbQuery(`
            SELECT 
                r.id as reference_id, r.isometric_asset_id, r.isometric_path,
                s.sku_complete as sample_sku,
                s.final_complete_name_es as sample_name
            FROM public.product_references r
            LEFT JOIN public.product_versions v ON v.reference_id = r.id
            LEFT JOIN public.product_skus s ON s.version_id = v.id
            WHERE r.family_code = '${g.family_code}'
              AND r.product_name = '${g.product_name.replace(/'/g, "''")}'
              AND r.designation = '${g.designation.replace(/'/g, "''")}'
              AND r.commercial_measure = '${g.commercial_measure.replace(/'/g, "''")}'
              AND COALESCE(r.ref_attrs->>'accessory_text', '') = '${g.accessory_text.replace(/'/g, "''")}'
              AND COALESCE(r.special_label, '') = '${g.special_label.replace(/'/g, "''")}'
              AND s.id IS NOT NULL
        `) || []) as NormalizationReferenceRow[]

        // 3. Map to options (unique assets in this group)
        const assetsMap = new Map<string, { path: string, references: { sku: string, name: string }[] }>()
        for (const r of refs) {
            const key = String(r.isometric_asset_id || '')
            if (!key) continue
            const current = assetsMap.get(key) || {
                path: String(r.isometric_path || ''),
                references: [] as { sku: string, name: string }[]
            }
            // Add reference to list
            current.references.push({
                sku: r.sample_sku,
                name: r.sample_name
            })
            assetsMap.set(key, current)
        }

        const options = Array.from(assetsMap.entries()).map(([id, data]) => ({
            assetId: id,
            path: data.path,
            usageCount: data.references.length,
            references: data.references
        }))

        // Use a more unique separator
        const safeId = [g.family_code, g.product_name, g.designation, g.commercial_measure, g.accessory_text, g.special_label]
            .map(s => encodeURIComponent(s))
            .join(':::')

        result.push({
            id: safeId,
            displayName: `${g.product_name} ${g.designation} ${g.commercial_measure}`.trim(),
            attributes: {
                family: g.family_name,
                name: g.product_name,
                designation: g.designation,
                measure: g.commercial_measure,
                accessory: g.accessory_text,
                specialLabel: g.special_label
            },
            options,
            totalReferences: new Set(refs.map((r) => r.reference_id)).size
        })
    }

    return result
}

/**
 * Normalizes a group of products to use a single master isometric.
 * Automatically deletes discarded assets if they are no longer used.
 */
export async function applyIsometricNormalizationAction(
    groupId: string,
    masterAssetId: string,
    masterPath: string,
    allAssetIdsInGroup: string[]
) {
    await assertAdminAccess()

    // 1. Parse group components from ID using the new separator
    const parts = groupId.split(':::').map(s => decodeURIComponent(s))
    const [familyCode, name, designation, measure, accessory, specialLabel] = parts

    // 2. Identify all references in this group
     
    const refs = (await dbQuery(`
        SELECT id FROM public.product_references
        WHERE family_code = '${familyCode}'
          AND product_name = '${name.replace(/'/g, "''")}'
          AND designation = '${designation.replace(/'/g, "''")}'
          AND commercial_measure = '${measure.replace(/'/g, "''")}'
          AND COALESCE(ref_attrs->>'accessory_text', '') = '${accessory.replace(/'/g, "''")}'
          AND COALESCE(special_label, '') = '${specialLabel.replace(/'/g, "''")}'
    `) || []) as ReferenceIdRow[]

    const refIds = refs.map((r: { id: string }) => r.id)
    if (refIds.length === 0) return { success: false, message: 'No references found' }

    // 3. Update all references to the master asset
    await dbQuery(`
        UPDATE public.product_references
        SET isometric_asset_id = '${masterAssetId}',
            isometric_path = '${masterPath}',
            updated_at = now()
        WHERE id IN (${refIds.map((id: string) => `'${id}'`).join(',')})
    `)

    // 4. Clean up orphaned assets
    const assetsToCheck = allAssetIdsInGroup.filter(id => id !== masterAssetId)
    
    const { supabaseAdmin } = await import('@/lib/supabase')

    for (const assetId of assetsToCheck) {
        // Verify if the asset is still used by ANY other reference outside this group
         
        const usage = (await dbQuery(`
            SELECT count(*) as count FROM public.product_references 
            WHERE isometric_asset_id = '${assetId}'
        `) || []) as UsageCountRow[]
        
        if (usage && usage[0] && Number(usage[0].count) === 0) {
            console.log(`Asset ${assetId} is now orphaned. Deleting...`)
            
            // Get path for storage deletion
             
            const assetData = await dbQuery(`SELECT path FROM public.assets WHERE id = '${assetId}'`) as AssetPathRow[]
            if (assetData && assetData[0]) {
                const storagePath = assetData[0].path
                // Delete from storage (bucket: assets)
                await supabaseAdmin.storage.from('assets').remove([storagePath])
                // Delete from DB
                await dbQuery(`DELETE FROM public.assets WHERE id = '${assetId}'`)
            }
        }
    }

    revalidatePath('/assets')
    await revalidateValidationSweepEverywhere()

    return { success: true }
}
