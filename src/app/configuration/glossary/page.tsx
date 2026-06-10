import { dbQuery } from '@/lib/supabase';
import GlossaryClient from './GlossaryClient';

type GlossaryCategoryRow = {
  category: string | null
}

export default async function ConfigGlossaryPage() {
  const glossary = await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || [];
  const categories = await dbQuery(`SELECT DISTINCT category FROM public.glossary WHERE category IS NOT NULL ORDER BY category ASC`) || [];

  return (
    <div className="max-w-7xl mx-auto py-8">
      <GlossaryClient
        initialData={glossary}
        initialCategories={(categories as GlossaryCategoryRow[])
          .map((c) => c.category)
          .filter((category): category is string => typeof category === 'string' && category.length > 0)}
      />
    </div>
  );
}
