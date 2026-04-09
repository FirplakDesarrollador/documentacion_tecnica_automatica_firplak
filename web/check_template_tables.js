const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Listar todas las tablas en el esquema public para ver si existe 'etiquetas_plantillas' o algo similar
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 2. Verificar si existe la tabla 'templates' (que es la que vi en los logs anteriores)
SELECT count(*) FROM public.templates;

-- 3. Si existe 'templates', ver los últimos registros
SELECT id, name, updated_at FROM public.templates ORDER BY updated_at DESC LIMIT 5;

-- 4. Verificar específicamente 'etiquetas_plantillas'
SELECT count(*) FROM public.etiquetas_plantillas;
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
