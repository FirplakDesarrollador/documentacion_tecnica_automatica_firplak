import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function checkTriggers() {
    const { data: triggers, error } = await sb.rpc('exec_sql', {
        query_text: `
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_table = 'cabinet_products';
        `
    });
    
    if (error) {
        console.error("Error fetching triggers:", error);
    } else {
        console.log("Triggers on cabinet_products:", triggers);
    }
}

checkTriggers();
