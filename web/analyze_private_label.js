const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Clientes con nombre pero sin flag
SELECT private_label_client_name, COUNT(*) as count, private_label_flag
FROM public.cabinet_products
WHERE private_label_client_name IS NOT NULL AND private_label_client_name != ''
GROUP BY private_label_client_name, private_label_flag;

-- 2. Diferenciar casos de ESPECIAL OBRA
SELECT private_label_client_name, COUNT(*)
FROM public.cabinet_products
WHERE private_label_client_name ILIKE '%OBRA%'
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
  console.log(await res.text());
}
run();
