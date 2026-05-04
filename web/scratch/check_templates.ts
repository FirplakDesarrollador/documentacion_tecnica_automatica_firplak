import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTemplates() {
    const { data, error } = await supabase.rpc('exec_sql', { 
        query_text: "SELECT name, elements_json FROM public.plantillas_doc_tec WHERE active = true" 
    });
    
    if (error) {
        console.error(error);
        return;
    }

    data.forEach((t: any) => {
        const json = typeof t.elements_json === 'string' ? t.elements_json : JSON.stringify(t.elements_json);
        if (json.includes('{color_name}') || json.includes('{name_color_sap}') || json.includes('{color}')) {
            console.log(`Template: ${t.name} HAS color variable`);
        } else {
            // Check for any variable that might be related
            const matches = json.match(/{([^}]+)}/g);
            console.log(`Template: ${t.name} Variables: ${matches?.join(', ')}`);
        }
    });
}

checkTemplates();
