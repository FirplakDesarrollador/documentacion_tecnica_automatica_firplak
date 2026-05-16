import { dbQuery } from '@/lib/supabase'

export async function getIsometricMassImportSettings(): Promise<{
  executeEnabled: boolean
  safeMaxFilesPerApply: number
  chunkSize: number
}> {
  try {
    const rows =
      (await dbQuery(`
        SELECT key, value
        FROM public.app_settings
        WHERE key IN (
          'isometric_mass_import_execute_enabled',
          'isometric_mass_import_safe_max_files_per_apply',
          'isometric_mass_import_chunk_size'
        )
      `)) || []

    const byKey = new Map<string, any>()
    for (const r of rows) byKey.set(String(r.key), r.value)

    const execDb = byKey.get('isometric_mass_import_execute_enabled')
    const safeMaxDb = byKey.get('isometric_mass_import_safe_max_files_per_apply')
    const chunkDb = byKey.get('isometric_mass_import_chunk_size')

    const executeEnabled = (() => {
      if (typeof execDb === 'boolean') return execDb
      if (typeof execDb === 'number') return execDb !== 0
      if (execDb === null || execDb === undefined) return false
      return String(execDb).trim().toLowerCase() === 'true'
    })()

    const safeMaxRaw =
      typeof safeMaxDb === 'number'
        ? safeMaxDb
        : safeMaxDb === null || safeMaxDb === undefined
          ? NaN
          : parseInt(String(safeMaxDb).trim(), 10)
    const safeMaxFilesPerApply = Number.isFinite(safeMaxRaw) && safeMaxRaw > 0 ? safeMaxRaw : 200

    const chunkRaw =
      typeof chunkDb === 'number'
        ? chunkDb
        : chunkDb === null || chunkDb === undefined
          ? NaN
          : parseInt(String(chunkDb).trim(), 10)
    const chunkSize = Number.isFinite(chunkRaw) && chunkRaw > 0 ? chunkRaw : 25

    if (rows && rows.length > 0) return { executeEnabled, safeMaxFilesPerApply, chunkSize }
  } catch {
    // ignore; fall back to defaults
  }

  return { executeEnabled: false, safeMaxFilesPerApply: 200, chunkSize: 25 }
}

