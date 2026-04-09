const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- Ver columnas de templates
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'templates' AND table_schema = 'public';

-- Ver columnas de plantillas_doc_tec
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'plantillas_doc_tec' AND table_schema = 'public';
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
