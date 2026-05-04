import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function listColumns() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query_text: "SELECT column_name FROM information_schema.columns WHERE table_name = 'cabinet_products'"
  })
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  const columns = data.map((c: any) => c.column_name).sort()
  console.log('Columns in cabinet_products:')
  console.log(columns.join('\n'))
}

listColumns()
