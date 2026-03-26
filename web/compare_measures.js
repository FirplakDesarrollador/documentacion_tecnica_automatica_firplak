const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

const sql = `
WITH extracted AS (
    SELECT 
        id,
        code,
        sap_description,
        commercial_measure,
        -- Extrae números seguidos de 'CM' o espacio después de la palabra clave de medida
        (regexp_matches(sap_description, '(\\d{2,3})\\s*CM', 'i'))[1] as sap_numeric,
        -- Extrae el número de la medida comercial actual
        (regexp_matches(commercial_measure, '(\\d{2,3})', 'i'))[1] as current_numeric
    FROM public.cabinet_products
    WHERE sap_description ~ '(?i)\\d{2,3}\\s*CM'
      AND commercial_measure IS NOT NULL
)
SELECT 
    code,
    sap_description,
    commercial_measure as current_measure,
    sap_numeric as measure_in_sap
FROM extracted
WHERE sap_numeric != current_numeric
LIMIT 100;
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
