const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Identificar productos con carb2 = 'CARB2' pero que en SAP dicen 'CARBONO' sin decir 'CARB' explícitamente como certificación
-- Nota: Algunos pueden decir ambos, por eso buscamos los que dicen CARBONO y NO dicen CARB seguido de un espacio o al final.
SELECT code, sap_description, carb2
FROM public.cabinet_products
WHERE carb2 = 'CARB2' 
  AND sap_description ILIKE '%CARBONO%'
  AND sap_description NOT ILIKE '%CARB %' 
  AND sap_description NOT ILIKE '%CARB2%'
  AND sap_description NOT ILIKE '%CARB-%';

-- 2. Corregir los falsos positivos (CARBONO es color, no certificación si no se especifica)
UPDATE public.cabinet_products
SET carb2 = 'NA'
WHERE carb2 = 'CARB2' 
  AND sap_description ILIKE '%CARBONO%'
  AND sap_description NOT ILIKE '%CARB %' 
  AND sap_description NOT ILIKE '%CARB2%'
  AND sap_description NOT ILIKE '%CARB-%';

-- 3. Verificación final de cuántos quedan como CARB2
SELECT COUNT(*) FROM public.cabinet_products WHERE carb2 = 'CARB2';
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
