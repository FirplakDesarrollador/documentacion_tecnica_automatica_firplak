import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { evaluateProductRules } from '../src/lib/engine/ruleEvaluator';

dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function q(sql: string): Promise<any[]> {
    const { data, error } = await (sb.rpc as any)('exec_sql', { query_text: sql });
    if (error) throw new Error(`DB Error: ${error.message}`);
    return Array.isArray(data) ? data : [];
}

async function main() {
    const rules = await q("SELECT * FROM rules WHERE enabled = true ORDER BY priority ASC");
    
    // Probar un SKU que el usuario dice que "falla" en el listado
    const code = 'VBAN05-0131-000-0493';
    const products = await q(`SELECT * FROM cabinet_products WHERE code = '${code}'`);
    const p = products[0];

    console.log('--- DIAGNÓSTICO SKU:', code, '---');
    console.log('Special Label:', p.special_label);
    console.log('Product Type:', p.product_type);
    
    const result = evaluateProductRules(p as any, rules as any);
    
    console.log('\nNombre Resultante:', result.finalNameEs);
    console.log('\nTrace de Reglas:');
    result.trace.forEach(t => {
        if (t.passed) {
            console.log(`✅ [Prio ${t.priority}] ${t.ruleType}: ${t.condition} -> ${t.actionTaken} (${t.payload})`);
        } else {
            // Solo mostrar las que fallaron pero que mencionan special_label
            if (t.condition.includes('special_label')) {
                console.log(`❌ [Prio ${t.priority}] ${t.ruleType}: ${t.condition} (FAILED)`);
            }
        }
    });
}

main().catch(console.error);
