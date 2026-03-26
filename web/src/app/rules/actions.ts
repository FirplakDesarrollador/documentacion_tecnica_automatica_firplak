'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

function esc(v: any) {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return String(v)
    return `'${String(v).replace(/'/g, "''")}'`
}

export async function getRulesAction() {
    return await dbQuery(`SELECT * FROM public.rules WHERE enabled = true ORDER BY priority ASC`) || []
}

export async function getColorByNameAction(code4Dig: string) {
    if (!code4Dig) return null
    const rows = await dbQuery(`SELECT name_color_sap FROM public.colors WHERE code_4dig = '${code4Dig.replace(/'/g, "''")}' LIMIT 1`)
    return rows && rows.length > 0 ? rows[0].name_color_sap : null
}

export async function upsertRuleAction(data: any) {
    const { id, rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes, target_value } = data

    if (id) {
        // Update
        await dbQuery(`
            UPDATE public.rules SET
                rule_type=${esc(rule_type)},
                target_entity=${esc(target_entity)},
                condition_expression=${esc(condition_expression)},
                action_type=${esc(action_type)},
                action_payload=${esc(action_payload)},
                priority=${priority || 0},
                enabled=${enabled ? 'true' : 'false'},
                notes=${esc(notes)},
                target_value=${esc(target_value)},
                updated_at=now()
            WHERE id='${id}'
        `)
    } else {
        // Insert
        await dbQuery(`
            INSERT INTO public.rules (rule_type, target_entity, condition_expression, action_type, action_payload, priority, enabled, notes, target_value)
            VALUES (${esc(rule_type)}, ${esc(target_entity)}, ${esc(condition_expression)}, ${esc(action_type)}, ${esc(action_payload)}, ${priority || 0}, ${enabled ? 'true' : 'false'}, ${esc(notes)}, ${esc(target_value)})
        `)
    }

    revalidatePath('/rules')
}

export async function deleteRuleAction(id: string) {
    if (!id) return
    await dbQuery(`DELETE FROM public.rules WHERE id = '${id}'`)
    revalidatePath('/rules')
}

export async function revalidateRulesAndProductsAction() {
    revalidatePath('/rules')
    revalidatePath('/products')
}

export async function previewNamingRulesAction(productType: string, pendingRules: any[]) {
    // Fetch 5 random products of the given type with all fields needed for name evaluation
    const safeType = productType.replace(/'/g, "''")
    const products = await dbQuery(`
        SELECT id, code, product_type, furniture_name, line, designation, use_destination,
               commercial_measure, accessory_text, door_color_text, rh, canto_puertas, 
               armado_con_lvm, carb2, assembled_flag,
               color_code, zone_home, ref_code, final_name_es, width_cm, depth_cm, height_cm,
               weight_kg, barcode_text, sap_description, private_label_flag, private_label_client_name,
               icon_rh, icon_full_extension, icon_soft_close, icon_edge_2mm
        FROM public.cabinet_products
        WHERE product_type = '${safeType}'
          AND furniture_name IS NOT NULL
          AND status = 'ACTIVO'
        ORDER BY random()
        LIMIT 5
    `) || []

    if (products.length === 0) return []

    // Import the evaluator dynamically (server-side only)
    const { evaluateProductRules } = await import('@/lib/engine/ruleEvaluator')

    // Build Rule-compatible objects from pendingRules (they may lack id if newly added)
    const rulesForEval = pendingRules.map((r: any, idx: number) => ({
        id: r.id || `temp-${idx}`,
        rule_type: r.rule_type,
        target_entity: r.target_entity || productType,
        condition_expression: r.condition_expression,
        action_type: r.action_type,
        action_payload: r.action_payload,
        priority: r.priority ?? idx * 10,
        enabled: r.enabled ?? true,
        notes: r.notes || null,
        target_value: r.target_value || productType,
    }))

    return products.map((p: any) => {
        const result = evaluateProductRules(p as any, rulesForEval as any)
        return {
            id: p.id,
            code: p.code,
            currentName: p.final_name_es || '',
            previewName: result.finalNameEs,
            productData: p,
        }
    })
}

export async function getProductsCountByFamilyAction(productType: string) {
    const safeType = productType.replace(/'/g, "''")
    const res = await dbQuery(`
        SELECT count(*)::int as count 
        FROM public.cabinet_products 
        WHERE product_type = '${safeType}'
          AND furniture_name IS NOT NULL
    `)
    return res && res.length > 0 ? res[0].count : 0
}

export async function applyNamesToProductTypeBatchAction(productType: string, offset: number, limit: number) {
    const safeType = productType.replace(/'/g, "''")

    // Fetch batch of products
    const products = await dbQuery(`
        SELECT id, code, product_type, furniture_name, line, designation, use_destination,
               commercial_measure, accessory_text, door_color_text, rh, canto_puertas, carb2,
               armado_con_lvm, assembled_flag, color_code, zone_home, ref_code, final_name_es,
               width_cm, depth_cm, height_cm, weight_kg, barcode_text, sap_description,
               private_label_flag, private_label_client_name,
               status,
               icon_rh, icon_full_extension, icon_soft_close, icon_edge_2mm
        FROM public.cabinet_products
        WHERE product_type = '${safeType}'
          AND furniture_name IS NOT NULL
        ORDER BY code ASC
        LIMIT ${limit} OFFSET ${offset}
    `) || []

    if (products.length === 0) return []

    // Load current saved rules
    const rules = await dbQuery(`
        SELECT * FROM public.rules 
        WHERE enabled = true 
          AND rule_type = 'name_component'
          AND (target_entity = 'product' OR target_entity = '${safeType}')
        ORDER BY priority ASC
    `) || []

    const { evaluateProductRules } = await import('@/lib/engine/ruleEvaluator')

    // ── Preview pass (TypeScript engine) ─────────────────────────────────────
    // Generates the SAP name vs new name comparison shown in the UI.
    // This logic is preserved exactly as-is.
    const results: { code: string, newName: string, oldName: string, error?: string, status?: string }[] = []
    const idsToApply: string[] = []

    for (const p of products) {
        try {
            const evalResult = evaluateProductRules(p as any, rules as any)
            const newName = evalResult.finalNameEs

            if (newName && newName.trim() !== '') {
                results.push({ code: p.code, newName, oldName: p.final_name_es || '', status: p.status })
                idsToApply.push(p.id)
            } else {
                results.push({ code: p.code, newName: '', oldName: p.final_name_es || '', error: 'Nombre generado vacío', status: p.status })
            }
        } catch (err: any) {
            results.push({ code: p.code, newName: '', oldName: p.final_name_es || '', error: err.message, status: p.status })
        }
    }

    // ── Apply pass (RPC) ──────────────────────────────────────────────────────
    // Replaces individual UPDATE-per-product (Management API) with a single
    // batch RPC call. No Management API, no direct DB, no secret keys.
    if (idsToApply.length > 0) {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { error } = await supabase.rpc('bulk_update_product_names', {
            product_ids: idsToApply
        })

        if (error) {
            return results.map(r => ({ ...r, error: `RPC error: ${error.message}` }))
        }
    }

    return results
}
