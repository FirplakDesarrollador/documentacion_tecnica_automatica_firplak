require('dotenv').config({ path: 'c:/Users/oswaldo.rivera/Desktop/Proyecto IA - Documentacion tecnica automatica/web/.env' });
const fetch = require('node-fetch');

async function testQuery() {
    const SUPABASE_PROJECT_ID = 'nbifmxggfusipomspoly';
    const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
    const sql = "SELECT count(*) FROM public.rules WHERE enabled = true";

    console.log("Token:", SUPABASE_MGMT_TOKEN ? "Present" : "Missing");

    try {
        const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`
            },
            body: JSON.stringify({ query: sql })
        });

        const result = await response.json();
        console.log("Status:", response.status);
        console.log("Result:", JSON.stringify(result));
    } catch (err) {
        console.error("Error:", err.message);
    }
}

testQuery();
