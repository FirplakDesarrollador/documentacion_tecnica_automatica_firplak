const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
-- 1. Añadir columna si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cabinet_products' AND column_name = 'carb2') THEN
        ALTER TABLE public.cabinet_products ADD COLUMN carb2 text DEFAULT 'NA';
    END IF;
END $$;

-- 2. Migrar datos basados en descripción SAP
UPDATE public.cabinet_products 
SET carb2 = CASE 
    WHEN sap_description ILIKE '%CARB%' OR sap_description ILIKE '%CARB2%' THEN 'CARB2'
    ELSE 'NA'
END;
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
