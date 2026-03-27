
const SUPABASE_PROJECT_ID = 'nbifmxggfusipomspoly';
const SUPABASE_MGMT_TOKEN = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12';

async function getRules() {
    const query = "SELECT * FROM public.rules WHERE enabled = true AND rule_type = 'name_component' ORDER BY priority ASC";
    try {
        const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`
            },
            body: JSON.stringify({ query })
        });

        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error(err);
    }
}

getRules();
