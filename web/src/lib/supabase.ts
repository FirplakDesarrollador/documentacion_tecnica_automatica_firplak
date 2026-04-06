import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ============================================================
// Cliente Supabase estándar (operaciones server-side con anon key)
// Las lecturas van por PostgREST REST API — sin límites del Management API
// Las escrituras masivas van por RPC (bulk_update_product_names)
// ============================================================

// Singleton para server-side (evita múltiples instancias en HMR)
const globalForSupabase = globalThis as unknown as { _supabaseServer: ReturnType<typeof createClient> }

export const supabaseServer = globalForSupabase._supabaseServer || createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || supabaseAnonKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
)
if (process.env.NODE_ENV !== 'production') globalForSupabase._supabaseServer = supabaseServer

/**
 * Ejecuta SQL crudo vía el endpoint correcto de la Management API de Supabase.
 * Para operaciones masivas de escritura usar supabase.rpc('bulk_update_product_names').
 */
export async function dbQuery(sql: string, values?: (string | number | boolean | null)[]): Promise<any> {
    const SUPABASE_PROJECT_ID = 'nbifmxggfusipomspoly'
    const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''

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

    try {
        // Endpoint correcto del Management API de Supabase para queries SQL
        const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`
            },
            body: JSON.stringify({ query: finalSql })
        })

        const result = await response.json()
        if (!response.ok) throw new Error(JSON.stringify(result))
        return result
    } catch (err: any) {
        throw new Error(`DB Query Error (${(err as any).status || 500}): ${err.message}`)
    }
}

// ============================================================
// Cliente Supabase público (para operaciones client-side y RPC)
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
})

// Alias admin = mismo cliente (usa dbQuery para server-side)
export const supabaseAdmin = supabase
