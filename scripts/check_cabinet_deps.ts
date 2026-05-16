import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDependencies() {
  console.log("Checking for database objects that depend on 'cabinet_products'...");

  // Check views
  const { data: viewsData, error: viewsError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT
        v.table_name as view_name
      FROM information_schema.views v
      WHERE v.table_schema = 'public' AND v.view_definition ILIKE '%cabinet_products%';
    `
  });
  
  if (viewsError) {
    console.error('Error views:', viewsError);
  } else {
    console.log('Views depending on cabinet_products:', viewsData);
  }

  // Check routines (functions)
  const { data: routinesData, error: routinesError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT
        r.routine_name
      FROM information_schema.routines r
      WHERE r.routine_schema = 'public' AND r.routine_definition ILIKE '%cabinet_products%';
    `
  });
  
  if (routinesError) {
    console.error('Error routines:', routinesError);
  } else {
    console.log('Functions/Routines depending on cabinet_products:', routinesData);
  }

  // Check foreign keys referencing cabinet_products
  const { data: fkeysData, error: fkeysError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT
        tc.table_name, 
        kcu.column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='cabinet_products';
    `
  });

  if (fkeysError) {
    console.error('Error foreign keys:', fkeysError);
  } else {
    console.log('Foreign keys referencing cabinet_products:', fkeysData);
  }
}

checkDependencies();
