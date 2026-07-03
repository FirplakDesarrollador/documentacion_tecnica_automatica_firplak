import { supabaseServer } from './supabase'

type SupabaseMutationOptions = {
    onConflict?: string
    ignoreDuplicates?: boolean
}

type SupabaseQueryResult<T = unknown> = {
    data: T
    error: { message: string } | null
}

type DynamicSupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
    select(columns?: string): DynamicSupabaseQuery<T>
    eq(column: string, value: unknown): DynamicSupabaseQuery<T>
    maybeSingle(): Promise<SupabaseQueryResult<T>>
    single(): Promise<SupabaseQueryResult<T>>
}

type DynamicSupabaseTable = {
    select<T = unknown>(columns?: string): DynamicSupabaseQuery<T>
    insert<T = unknown>(values: unknown): DynamicSupabaseQuery<T>
    update<T = unknown>(values: unknown): DynamicSupabaseQuery<T>
    upsert<T = unknown>(values: unknown, options?: SupabaseMutationOptions): DynamicSupabaseQuery<T>
}

export function supabaseTable(tableName: string): DynamicSupabaseTable {
    return (supabaseServer as unknown as { from(table: string): DynamicSupabaseTable }).from(tableName)
}
