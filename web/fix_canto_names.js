const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
UPDATE cabinet_products 
SET canto_puertas = 'CANTO 0.45 MM' 
WHERE furniture_name ILIKE '%TIZIANO%'
   OR furniture_name ILIKE '%VALDEZ%'
   OR furniture_name ILIKE '%ZACURA%'
   OR furniture_name ILIKE '%DA VINCI%';
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
