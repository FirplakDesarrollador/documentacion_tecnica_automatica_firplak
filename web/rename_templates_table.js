const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Renombrar la tabla templates a plantillas_doc_tec si existe
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'templates') THEN
        ALTER TABLE public.templates RENAME TO plantillas_doc_tec;
    END IF;
END $$;

-- 2. Asegurarse de que si existía etiquetas_plantillas por error, se borre o unifique (opcional, pero por seguridad si ya la creaste)
-- DROP TABLE IF EXISTS public.etiquetas_plantillas; 

-- 3. Si no existe ninguna, crearla de cero con la estructura actual
CREATE TABLE IF NOT EXISTS public.plantillas_doc_tec (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    width_mm integer NOT NULL,
    height_mm integer NOT NULL,
    orientation text NOT NULL,
    document_type text NOT NULL,
    elements_json text NOT NULL DEFAULT '[]',
    active boolean DEFAULT true,
    export_formats text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
`;

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query: sql })
  });
  console.log(await res.text());
}
run();
