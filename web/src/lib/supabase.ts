import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ============================================================
// Cliente admin usando Management API HTTP directamente
// Bypasea el RLS completamente para operaciones server-side
// ============================================================
const SUPABASE_PROJECT_ID = 'nbifmxggfusipomspoly'
const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''

/**
 * Ejecuta SQL directamente via Management API (sin restricción RLS)
 * Para uso EXCLUSIVO en Server Components y API Routes (server-side)
 */
export async function dbQuery(sql: string, values?: (string | number | boolean | null)[]): Promise<any> {
    // Preparar query con valores si se proveen (simple template replacement)
    let finalSql = sql
    if (values && values.length > 0) {
        let i = 0
        finalSql = sql.replace(/\$\d+/g, () => {
            const val = values[i++]
            if (val === null || val === undefined) return 'NULL'
            if (typeof val === 'boolean') return val ? 'true' : 'false'
            if (typeof val === 'number') return String(val)
            return `'${String(val).replace(/'/g, "''")}'`
        })
    }

    const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`
        },
        body: JSON.stringify({ query: finalSql }),
        cache: 'no-store'
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`DB Query Error (${res.status}): ${text}`)
    }

    return res.json()
}

// ============================================================
// Cliente Supabase público (para operaciones autenticadas client-side)
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
})

// Alias admin = mismo cliente (usa dbQuery para server-side)
export const supabaseAdmin = supabase
