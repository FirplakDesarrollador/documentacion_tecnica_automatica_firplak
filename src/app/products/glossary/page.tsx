import { dbQuery } from '@/lib/supabase'
import GlossaryClient from './GlossaryClient'

export default async function GlossaryPage() {
    const glossary = await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || []
    const categories = await dbQuery(`SELECT DISTINCT category FROM public.glossary WHERE category IS NOT NULL ORDER BY category ASC`) || []
    
    return (
        <div className="container mx-auto py-10">
            <GlossaryClient 
                initialData={glossary} 
                initialCategories={categories.map((c: any) => c.category)} 
            />
        </div>
    )
}
