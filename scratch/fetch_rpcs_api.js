const projectId = 'nbifmxggfusipomspoly';
const token = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

async function fetchRPCs() {
    const query = `
        SELECT 
            p.proname as function_name,
            pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND (
            p.proname ILIKE '%cabinet_products%' 
            OR p.proname ILIKE '%bulk_update%'
            OR p.proname ILIKE '%sync%'
            OR p.proname ILIKE '%transaction%'
            OR p.proname ILIKE '%names%'
        );
    `;

    const url = `https://api.supabase.com/v1/projects/${projectId}/sql`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
        const text = await response.text();
        console.error(`Error ${response.status}: ${text}`);
    } else {
        const json = await response.json();
        console.log(JSON.stringify(json, null, 2));
    }
}

fetchRPCs();
