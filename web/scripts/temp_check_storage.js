import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function check() {
    console.log("Checking bucket 'assets'...")
    const { data, error } = await supabase.storage.from('assets').list()
    if (error) {
        console.error("Error:", error.message)
    } else {
        console.log("Files:", data.map(f => f.name).slice(0, 10))
    }
}
check()
