const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Buscar registros que tengan el patrón exacto o similar
SELECT code, accessory_text 
FROM public.cabinet_products 
WHERE accessory_text ILIKE '%RFE + R OCULTO CIERRE LENTO%';

-- 2. Actualizar para invertir el orden y evitar confusiones conforme a lo solicitado
UPDATE public.cabinet_products 
SET accessory_text = REPLACE(accessory_text, 'RFE + R OCULTO CIERRE LENTO', 'R OCULTO + RFE CIERRE LENTO')
WHERE accessory_text ILIKE '%RFE + R OCULTO CIERRE LENTO%';

-- 3. Confirmar cuántos se actualizaron
SELECT COUNT(*) FROM public.cabinet_products WHERE accessory_text ILIKE '%R OCULTO + RFE CIERRE LENTO%';
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
