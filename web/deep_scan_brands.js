const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Listar todos los valores únicos actualmente en columnas de cliente o descripción que sugieran marcas
SELECT DISTINCT private_label_client_name 
FROM public.cabinet_products 
WHERE private_label_client_name IS NOT NULL AND private_label_client_name != '';

-- 2. Buscar en sap_description patrones que puedan ser marcas escondidas
SELECT DISTINCT sap_description
FROM public.cabinet_products
WHERE sap_description ~ '(D-ACQUA|PROMART|CHILEMAT|OBRA|SODIMAC|EASY|HOMECENTER)';

-- 3. Ver registros que tengan algo en client_name pero el flag en false
SELECT private_label_client_name, COUNT(*) 
FROM public.cabinet_products 
WHERE private_label_client_name IS NOT NULL AND private_label_client_name != '' AND (private_label_flag IS FALSE OR private_label_flag IS NULL)
GROUP BY private_label_client_name;
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
