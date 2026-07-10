import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SupabaseAdminDatabase = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>
      Insert: Record<string, unknown>
      Update: Record<string, unknown>
      Relationships: []
    }>
    Views: Record<string, {
      Row: Record<string, unknown>
      Relationships: []
    }>
    Functions: Record<string, {
      Args: Record<string, unknown>
      Returns: unknown
    }>
  }
}

type SupabaseAdminClient = SupabaseClient<SupabaseAdminDatabase, 'public', 'public'>

const globalForSupabaseAdmin = globalThis as unknown as {
  _supabaseStrictAdmin?: SupabaseAdminClient
}

function readSupabaseAdminConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL para crear el cliente admin de Supabase.')
  }

  if (!serviceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY para administrar usuarios.')
  }

  return { supabaseUrl, serviceRoleKey }
}

export function createSupabaseAdminClient() {
  if (globalForSupabaseAdmin._supabaseStrictAdmin) {
    return globalForSupabaseAdmin._supabaseStrictAdmin
  }

  const { supabaseUrl, serviceRoleKey } = readSupabaseAdminConfig()
  const client = createClient<SupabaseAdminDatabase>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForSupabaseAdmin._supabaseStrictAdmin = client
  }

  return client
}
