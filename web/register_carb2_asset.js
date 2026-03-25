const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- Registrar el icono CARB2 como recurso de sistema si no existe
INSERT INTO public.assets (name, type, file_path)
SELECT 'Icono CARB2', 'icon', ''
WHERE NOT EXISTS (
    SELECT 1 FROM public.assets WHERE name = 'Icono CARB2'
);
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
