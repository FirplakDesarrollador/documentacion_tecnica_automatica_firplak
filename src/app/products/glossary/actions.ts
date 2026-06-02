'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForGlossaryTerms, processNamingJobsInline } from '@/lib/engine/namingQueue'
import { resetGlossaryCache } from '@/lib/engine/translator'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function getGlossaryAction() {
    return await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || []
}

export async function upsertGlossaryTermAction(data: { id?: string, term_es: string, term_en: string, category?: string }) {
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
            INSERT INTO public.glossary (term_es, term_en, category)
            VALUES ('${termEsEsc}', '${termEnEsc}', ${categoryEsc})
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

export async function deleteGlossaryTermAction(id: string) {
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
