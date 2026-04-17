import 'dotenv/config';

const SUPABASE_PROJECT_ID = 'nbifmxggfusipomspoly';
const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

async function applySql(sql: string) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`
        },
        body: JSON.stringify({ query: sql })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
}

async function run() {
    const fs = require('fs');
    const files = [
        'mass_update_part_1.sql',
        'mass_update_part_2.sql',
        'mass_update_part_3.sql',
        'mass_update_part_4.sql'
    ];

    console.log('🚀 Iniciando ejecución de lotes SQL...');

    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.log(`⏩ Saltando ${file} (no existe)`);
            continue;
        }

        const sql = fs.readFileSync(file, 'utf8');
        console.log(`⏳ Aplicando ${file} (${sql.split('\n').length} líneas)...`);
        
        try {
            await applySql(sql);
            console.log(`✅ ${file} aplicado con éxito.`);
        } catch (err: any) {
            console.error(`❌ Error aplicando ${file}:`, err.message);
            // Si el bloque es muy grande, podríamos intentar dividirlo, pero 300 líneas suelen caber.
        }
    }

    console.log('\n🏁 Fin del proceso de actualización masiva.');
}

run().catch(console.error);
