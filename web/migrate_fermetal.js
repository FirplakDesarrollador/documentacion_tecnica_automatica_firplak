const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Identificar y actualizar productos de FERMETAL basándose en sap_description
UPDATE public.cabinet_products 
SET private_label_client_name = 'FERMETAL',
    private_label_client_id = 'CL-FE01',
    private_label_flag = TRUE
WHERE sap_description ILIKE '%FERMETAL%';

-- 2. Verificar cuántos se actualizaron
SELECT COUNT(*) FROM public.cabinet_products WHERE private_label_client_name = 'FERMETAL';
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
