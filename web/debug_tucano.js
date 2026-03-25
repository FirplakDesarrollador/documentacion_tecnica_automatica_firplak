const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Ver qué referencias existen que se parezcan a TUCANO
SELECT DISTINCT ref_code, status 
FROM public.cabinet_products 
WHERE ref_code ILIKE '%TUCANO%' OR furniture_name ILIKE '%TUCANO%';

-- 2. Forzar actualización a INACTIVO para cualquier cosa relacionada con TUCANO
UPDATE public.cabinet_products 
SET status = 'INACTIVO' 
WHERE ref_code ILIKE '%TUCANO%' OR furniture_name ILIKE '%TUCANO%';

-- 3. Confirmar resultados
SELECT DISTINCT ref_code, status 
FROM public.cabinet_products 
WHERE ref_code ILIKE '%TUCANO%' OR furniture_name ILIKE '%TUCANO%';
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
