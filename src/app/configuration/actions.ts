'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { assertRole } from '@/utils/auth/access'

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
  revalidatePath('/product-design/route-sheets/furniture')

  return { success: true, enabled }
}
