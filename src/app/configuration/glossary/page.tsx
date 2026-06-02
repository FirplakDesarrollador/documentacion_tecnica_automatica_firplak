import { dbQuery } from '@/lib/supabase';
import GlossaryClient from '@/app/products/glossary/GlossaryClient';

export default async function ConfigGlossaryPage() {
  const glossary = await dbQuery(`SELECT * FROM public.glossary ORDER BY term_es ASC`) || [];
  const categories = await dbQuery(`SELECT DISTINCT category FROM public.glossary WHERE category IS NOT NULL ORDER BY category ASC`) || [];

  return (
    <div className="max-w-7xl mx-auto py-8">
      <GlossaryClient
        initialData={glossary}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialCategories={(categories as any[]).map((c: { category: string }) => c.category)}
      />
    </div>
  );
}
