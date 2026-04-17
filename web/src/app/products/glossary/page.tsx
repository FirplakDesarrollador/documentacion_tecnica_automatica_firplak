import { dbQuery } from '@/lib/supabase'
import GlossaryClient from './GlossaryClient'

export default async function GlossaryPage() {
    const glossary = await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || []
    
    return (
        <div className="container mx-auto py-10">
            <GlossaryClient initialData={glossary} />
        </div>
    )
}
