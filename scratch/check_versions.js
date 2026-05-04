const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

async function query() {
    const sql = `
        SELECT DISTINCT v.version_code, s.sku_complete 
        FROM public.product_skus s 
        JOIN public.product_versions v ON s.version_id = v.id 
        JOIN public.product_references r ON v.reference_id = r.id 
        WHERE r.reference_code = '0114' AND r.family_code = 'BAN05' 
        LIMIT 10;
    `;

    const url = `https://api.supabase.com/v1/projects/${projectId}/sql`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    
    if (!response.ok) {
        const text = await response.text();
        console.error(`Error ${response.status}: ${text}`);
    } else {
        const json = await response.json();
        console.log(JSON.stringify(json, null, 2));
    }
}

query();
