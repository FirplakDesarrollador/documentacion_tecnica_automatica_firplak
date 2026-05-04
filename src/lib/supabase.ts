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
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_SECRET_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 
    supabaseAnonKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
)
if (process.env.NODE_ENV !== 'production') globalForSupabase._supabaseServer = supabaseServer

/**
 * Ejecuta SQL crudo vía el endpoint correcto de la Management API de Supabase.
 * Para operaciones masivas de escritura usar supabase.rpc('bulk_update_product_names').
 */
export async function dbQuery(sql: string, values?: (string | number | boolean | null)[]): Promise<any> {
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
        // Usamos el RPC 'exec_sql' para ejecutar SQL crudo de forma segura y rápida
        // Esto evita depender del Management API de Supabase y sus límites/tokens inestables
        const { data, error } = await (supabaseServer as any).rpc('exec_sql', { query_text: finalSql })
        
        if (error) throw error
        
        // Si el resultado es el objeto de éxito de DML (UPDATE/INSERT/DELETE)
        if (data && typeof data === 'object' && 'success' in data && data.success === true) {
            return data
        }
        
        return data || []
    } catch (err: any) {
        throw new Error(`DB Query Error: ${err.message}`)
    }
}

// ============================================================
// Cliente Supabase público (para operaciones client-side y RPC)
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
})

// Alias admin = cliente con privilegios de service role (bypassa RLS)
export const supabaseAdmin = supabaseServer
