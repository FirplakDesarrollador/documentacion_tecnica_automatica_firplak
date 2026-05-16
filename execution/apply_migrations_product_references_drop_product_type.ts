import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY)'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const files = [
    '20260516100000_deprecate_product_references_product_type.sql',
    '20260516100500_patch_legacy_functions_drop_product_references_product_type.sql',
    '20260516101000_drop_product_references_product_type.sql',
  ];

  for (const f of files) {
    console.log('Applying migration:', f);
    const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', f);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    if (error) {
      console.error('Error applying migration:', f, error);
      process.exit(1);
    }
    console.log('Migration applied successfully:', f);
    if (data) console.log('exec_sql result:', data);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

