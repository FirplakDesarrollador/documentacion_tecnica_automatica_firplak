import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

async function executeChunks() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // use service role if possible, but anon works if RLS allows
    const supabase = createClient(supabaseUrl, supabaseKey);

    const files = [
        'mass_update_part_1.sql',
        'mass_update_part_2.sql',
        'mass_update_part_3.sql',
        'mass_update_part_4.sql'
    ];

    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.log(`⏩ Saltando ${file} (no existe)`);
            continue;
        }

        console.log(`⏳ Ejecutando ${file}...`);
        const content = fs.readFileSync(file, 'utf8');
        
        // Ejecutamos vía SQL directo (esto requiere que el cliente tenga permisos o usar un RPC)
        // Como el MCP execute_sql es más potente, vamos a intentar usarlo si el script falla.
        // Pero para masivo, es mejor un loop interno.
        
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        console.log(`   - ${lines.length} sentencias detectadas.`);
        
        // Ejecutamos en batches de 50 para no saturar
        for (let i = 0; i < lines.length; i += 50) {
            const batch = lines.slice(i, i + 50).join('\n');
            const { error } = await supabase.rpc('execute_sql', { query: batch }); 
            // Nota: Si 'execute_sql' no es un RPC definido, fallará.
            // En ese caso, el agente debe usar el tool MCP.
            if (error) {
                console.error(`❌ Error en batch ${i}:`, error);
                throw error;
            }
            console.log(`   - Progreso: ${Math.min(i + 50, lines.length)} / ${lines.length}`);
        }
        console.log(`✅ ${file} completado.`);
    }
}

executeChunks().catch(console.error);
