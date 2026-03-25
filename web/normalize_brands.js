const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Añadir columna special_label con valor por defecto 'NA'
ALTER TABLE public.cabinet_products 
ADD COLUMN IF NOT EXISTS special_label text DEFAULT 'NA';

-- 2. Asegurar que special_label sea 'NA' para los existentes
UPDATE public.cabinet_products SET special_label = 'NA' WHERE special_label IS NULL OR special_label = '';

-- 3. Mover 'ESPECIAL OBRA' a special_label y limpiar client_name
UPDATE public.cabinet_products 
SET special_label = 'ESPECIAL OBRA', 
    private_label_client_name = 'NA'
WHERE private_label_client_name = 'ESPECIAL OBRA';

-- 4. Normalizar private_label_client_name a 'NA' para los NULL o vacíos
UPDATE public.cabinet_products 
SET private_label_client_name = 'NA' 
WHERE private_label_client_name IS NULL OR private_label_client_name = '';

-- 5. Asignar IDs únicos y activar flags para clientes conocidos
UPDATE public.cabinet_products 
SET private_label_client_id = 'CL-CH01', private_label_flag = TRUE 
WHERE private_label_client_name = 'CHILEMAT';

UPDATE public.cabinet_products 
SET private_label_client_id = 'CL-DA01', private_label_flag = TRUE 
WHERE private_label_client_name = 'D-ACQUA';

UPDATE public.cabinet_products 
SET private_label_client_id = 'CL-PR01', private_label_flag = TRUE 
WHERE private_label_client_name = 'PROMART';
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
