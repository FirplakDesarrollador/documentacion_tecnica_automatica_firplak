'use server'

import { dbQuery } from '@/lib/supabase'
import { markAllNamingStale, processNamingJobsInline } from '@/lib/engine/namingQueue'
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
    await markAllNamingStale(null, 'glossary_update')
    await processNamingJobsInline()
    revalidatePath('/configuration/glossary')
    revalidatePath('/pending')
    revalidatePath('/')
    revalidateTag('validation-sweep', { expire: 0 })
}

export async function deleteGlossaryTermAction(id: string) {
    await dbQuery(`DELETE FROM public.glossary WHERE id = '${id}'`)
    resetGlossaryCache()
    await markAllNamingStale(null, 'glossary_delete')
    await processNamingJobsInline()
    revalidatePath('/configuration/glossary')
    revalidatePath('/pending')
    revalidatePath('/')
    revalidateTag('validation-sweep', { expire: 0 })
}
