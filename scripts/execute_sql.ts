import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const projectId = 'nbifmxggfusipomspoly';
const token = process.env.SUPABASE_ACCESS_TOKEN;

async function executeSql(query: string) {
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
        console.log("Success:", json);
    }
}

executeSql(`SELECT count(*) FROM cabinet_products;`);
