'use server'

import { dbQuery } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

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
    revalidatePath('/products/glossary')
    revalidatePath('/products/mass-edit')
}

export async function deleteGlossaryTermAction(id: string) {
    await dbQuery(`DELETE FROM public.glossary WHERE id = '${id}'`)
    revalidatePath('/products/glossary')
}
