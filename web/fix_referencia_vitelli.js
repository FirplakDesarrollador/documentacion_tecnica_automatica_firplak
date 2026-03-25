const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- Actualizar todos los muebles de la referencia VITELLI a VITELI
UPDATE public.cabinet_products 
SET ref_code = 'VITELI',
    updated_at = now()
WHERE ref_code = 'VITELLI';

-- También actualizar el nombre del mueble si contiene el antiguo nombre en mayúsculas (opcional pero recomendado por consistencia)
UPDATE public.cabinet_products
SET furniture_name = REPLACE(furniture_name, 'VITELLI', 'VITELI')
WHERE furniture_name LIKE '%VITELLI%';
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
