'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForGlossaryTerms, processNamingJobsInline } from '@/lib/engine/namingQueue'
import { resetGlossaryCache } from '@/lib/engine/translator'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertPermission } from '@/utils/auth/access'

async function assertAdminAccess() {
    await assertPermission('module:configuration')
}

export async function getGlossaryAction() {
    await assertAdminAccess()

    return await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || []
}

export async function upsertGlossaryTermAction(data: { id?: string, term_es: string, term_en: string, category?: string }) {
    await assertAdminAccess()

    const { id, term_es, term_en, category } = data
    const termEsEsc = term_es.toUpperCase().replace(/'/g, "''")
    const termEnEsc = term_en.toUpperCase().replace(/'/g, "''")
    const categoryEsc = category ? `'${category.replace(/'/g, "''")}'` : 'NULL'
    const existingRows = id
        ? await dbQuery(`SELECT term_es, category FROM public.glossary WHERE id = $1 LIMIT 1`, [id]) || []
        : []
    const previousTermEs = existingRows[0]?.term_es ? String(existingRows[0].term_es) : null

    if (id) {
        await dbQuery(`
            UPDATE public.glossary 
            SET term_es = '${termEsEsc}', term_en = '${termEnEsc}', category = ${categoryEsc}, updated_at = now()
            WHERE id = '${id}'
        `)
    } else {
        await dbQuery(`
            INSERT INTO public.glossary (term_es, term_en, active, priority, category)
            VALUES ('${termEsEsc}', '${termEnEsc}', true, ${category === 'RESOLVED_TYPE' ? 20 : 10}, ${categoryEsc})
        `)
    }
    resetGlossaryCache()
    await markNamingStaleForGlossaryTerms([
        { termEs: term_es, previousTermEs, category },
    ], 'glossary_update')
    await processNamingJobsInline()
    revalidatePath('/configuration/glossary')
    revalidatePath('/pending')
    revalidatePath('/')
    revalidateTag('validation-sweep', { expire: 0 })
}

export async function resolveZoneHomeEnAction(zoneEs: string | null | undefined): Promise<string | null> {
    await assertAdminAccess()

    if (!zoneEs) return null

    const key = zoneEs.trim().toUpperCase()
    try {
        const rows = await dbQuery(
            `SELECT term_en FROM public.glossary 
             WHERE term_es = '${key.replace(/'/g, "''")}' 
               AND active = true 
             LIMIT 1`
        )
        return rows && rows.length > 0 ? (rows[0].term_en as string) : null
    } catch {
        return null
    }
}

export async function saveGlossaryTermsAction(terms: { term_es: string, term_en: string, category: string, priority: number }[]) {
    await assertAdminAccess()

    if (!terms || terms.length === 0) return { success: true }

    try {
        const normalizeGlossaryInput = (t: { term_es: string, term_en: string, category: string, priority: number }) => {
            const rawEs = String(t.term_es || '').trim().toUpperCase()
            const rawEn = String(t.term_en || '').trim().toUpperCase()
            let category = String(t.category || 'TECHNICAL_TERM').trim().toUpperCase()
            let termEs = rawEs

            const resolvedTypePrefix = 'RESOLVED_TYPE_MISSING:'
            if (termEs.startsWith(resolvedTypePrefix)) {
                termEs = termEs.slice(resolvedTypePrefix.length).trim()
                category = 'RESOLVED_TYPE'
            }

            return { termEs, termEn: rawEn, category, priority: t.priority }
        }

        const glossaryTermsForStale: { termEs: string; category?: string | null }[] = []

        for (const t of terms) {
            const n = normalizeGlossaryInput(t)
            glossaryTermsForStale.push({ termEs: n.termEs, category: n.category })
            await dbQuery(`
                INSERT INTO public.glossary (term_es, term_en, category, priority, active)
                VALUES ('${n.termEs.replace(/'/g, "''")}', '${n.termEn.replace(/'/g, "''")}', '${n.category.replace(/'/g, "''")}', ${n.priority}, true)
                ON CONFLICT (term_es) DO UPDATE 
                SET term_en = EXCLUDED.term_en,
                    category = EXCLUDED.category,
                    priority = EXCLUDED.priority;
            `)
        }

        resetGlossaryCache()
        await markNamingStaleForGlossaryTerms(glossaryTermsForStale, 'glossary_update')
        await processNamingJobsInline()
        revalidatePath('/configuration/glossary')
        revalidatePath('/pending')
        revalidatePath('/')
        revalidateTag('validation-sweep', { expire: 0 })
        return { success: true, message: `Se guardaron ${terms.length} términos correctamente.` }
    } catch (error) {
        console.error('Error saving glossary terms:', error)
        return { success: false, message: `Error al guardar términos: ${(error as Error).message}` }
    }
}

export async function deleteGlossaryTermAction(id: string) {
    await assertAdminAccess()

    const existingRows = await dbQuery(`SELECT term_es, category FROM public.glossary WHERE id = $1 LIMIT 1`, [id]) || []
    const deletedTermEs = existingRows[0]?.term_es ? String(existingRows[0].term_es) : ''
    const deletedCategory = existingRows[0]?.category ? String(existingRows[0].category) : null
    await dbQuery(`DELETE FROM public.glossary WHERE id = '${id}'`)
    resetGlossaryCache()
    await markNamingStaleForGlossaryTerms([
        { termEs: deletedTermEs, category: deletedCategory },
    ], 'glossary_delete')
    await processNamingJobsInline()
    revalidatePath('/configuration/glossary')
    revalidatePath('/pending')
    revalidatePath('/')
    revalidateTag('validation-sweep', { expire: 0 })
}
