import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugDatabase() {
  console.log('--- Checking cabinet_products table structure ---')
  const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cabinet_products'
      ORDER BY ordinal_position;
    `
  })
  if (colError) console.error('Error fetching columns:', colError)
  else console.log('Columns:', JSON.stringify(columns, null, 2))

  console.log('\n--- Checking triggers on cabinet_products ---')
  const { data: triggers, error: trigError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT trigger_name, event_manipulation, action_statement, action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'cabinet_products';
    `
  })
  if (trigError) console.error('Error fetching triggers:', trigError)
  else console.log('Triggers:', JSON.stringify(triggers, null, 2))

  console.log('\n--- Checking functions related to cabinet_products ---')
  // Searching for functions that might be used in triggers
  const { data: functions, error: funcError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT routine_name, routine_definition
      FROM information_schema.routines
      WHERE routine_type = 'FUNCTION'
      AND routine_definition ILIKE '%riel%'
      AND routine_schema = 'public';
    `
  })
  if (funcError) console.error('Error fetching functions:', funcError)
  else console.log('Functions mentioning "riel":', JSON.stringify(functions, null, 2))

  console.log('\n--- Checking product_versions foreign keys ---')
  const { data: fks, error: fkError } = await supabase.rpc('exec_sql', {
    query_text: `
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='product_versions';
    `
  })
  if (fkError) console.error('Error fetching foreign keys:', fkError)
  else console.log('Foreign keys for product_versions:', JSON.stringify(fks, null, 2))
}

debugDatabase()
