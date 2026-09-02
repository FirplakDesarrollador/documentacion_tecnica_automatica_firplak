'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { assertRole } from '@/utils/auth/access'
import {
  normalizeSapBomCostCategoryMapping,
  SAP_BOM_COST_CATEGORY_MAPPING_SETTING_KEY,
  type SapBomCostCategoryMapping,
} from '@/lib/sap/costCategoryResolver'

const SAP_WRITES_SETTING_KEY = 'sap_writes_enabled'

export async function saveSapWriteSettingsAction(input: { enabled: boolean }) {
  await assertRole('admin')

  const enabled = input.enabled === true
  await dbQuery(`
    INSERT INTO public.app_settings (key, value, updated_at)
    VALUES ('${SAP_WRITES_SETTING_KEY}', to_jsonb(${enabled ? 'true' : 'false'}), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now()
  `)

  revalidatePath('/configuration')
  revalidatePath('/product-design/route-sheets/cabinets')

  return { success: true, enabled }
}

export async function saveSapBomCostCategoryMappingAction(input: { mapping: unknown }): Promise<SapBomCostCategoryMapping> {
  await assertRole('admin')
  const mapping = normalizeSapBomCostCategoryMapping(input.mapping)
  await dbQuery(
    `INSERT INTO public.app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [SAP_BOM_COST_CATEGORY_MAPPING_SETTING_KEY, JSON.stringify(mapping)],
  )
  const rows = await dbQuery('SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1', [SAP_BOM_COST_CATEGORY_MAPPING_SETTING_KEY])
  const saved = normalizeSapBomCostCategoryMapping(rows[0]?.value)
  if (JSON.stringify(saved) !== JSON.stringify(mapping)) throw new Error('La clasificación de costos SAP no pudo verificarse después de guardar.')
  revalidatePath('/configuration')
  revalidatePath('/engineering/sap-consulting')
  return saved
}
