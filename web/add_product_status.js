const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Añadir columna status con valor por defecto ACTIVO
ALTER TABLE public.cabinet_products 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVO';

-- 2. Asegurar que todos los existentes sean ACTIVO (por si acaso el DEFAULT no se aplica retroactivamente en esta versión de PG)
UPDATE public.cabinet_products SET status = 'ACTIVO' WHERE status IS NULL;

-- 3. Marcar TUCANO como INACTIVO
UPDATE public.cabinet_products 
SET status = 'INACTIVO' 
WHERE ref_code = 'TUCANO';
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
