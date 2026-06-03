import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ============================================================
// Cliente Supabase estándar (operaciones server-side con anon key)
// Las lecturas van por PostgREST REST API — sin límites del Management API
// Las escrituras masivas y recálculos usan RPCs/vistas del Catálogo Maestro
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
 * Para operaciones masivas usar RPCs/vistas del Catálogo Maestro, no flujos legacy.
 */
export async function dbQuery(sql: string, values?: (string | number | boolean | null)[]) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabaseServer.rpc as any)('exec_sql', { query_text: finalSql })
        
        if (error) throw error
        
        // Si el resultado es el objeto de éxito de DML (UPDATE/INSERT/DELETE)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any
        if (d && typeof d === 'object' && 'success' in d && d.success === true) {
            return d
        }
        
        return (d || []) as Record<string, unknown>[]
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message
            : typeof err === 'object' && err !== null ? JSON.stringify(err)
            : String(err)
        throw new Error(`DB Query Error: ${detail}`)
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
