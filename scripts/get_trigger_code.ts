import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function getTriggerCode() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query_text: "SELECT proname, prosrc FROM pg_proc JOIN pg_trigger ON pg_proc.oid = pg_trigger.tgfoid WHERE tgname = 'trg_sync_product_v6'"
  })
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  if (data && data.length > 0) {
    const code = data[0].prosrc
    fs.writeFileSync('trigger_code.txt', code)
    console.log('Trigger code saved to trigger_code.txt')
  } else {
    console.log('Trigger not found')
  }
}

getTriggerCode()
