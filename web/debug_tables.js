const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Ver cuántas tablas de plantillas hay ahora
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name ILIKE '%template%' OR table_name ILIKE '%plantilla%');

-- 2. Ver contenido de plantillas_doc_tec
SELECT count(*) as total_doc_tec FROM public.plantillas_doc_tec;

-- 3. Ver si quedó una tabla 'templates' con datos
SELECT count(*) as total_templates FROM public.templates;
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
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
