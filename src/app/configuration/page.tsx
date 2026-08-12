import { NomenclaturesSection } from '@/components/rules/NomenclaturesSection'
import { MassImportSettingsSection } from '@/components/rules/MassImportSettingsSection'
import { PrintSettingsSection } from '@/components/configuration/PrintSettingsSection'
import { SapWriteSettingsSection } from '@/components/configuration/SapWriteSettingsSection'
import { ModuleHub } from '@/components/navigation/ModuleHub'
import { getNamingComponentsAction, getNamingModelStatusAction } from '@/app/rules/actions'
import { CONFIGURATION_NAVIGATION } from '@/lib/navigation/moduleHierarchy'
import { dbQuery } from '@/lib/supabase'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

type AppSettingRow = {
  key: string
  value: unknown
}

function readBooleanSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes', 'si'].includes(value.trim().toLowerCase())
  return false
}

export default async function ConfigurationPage() {
  const access = await requirePagePermission('module:configuration')
  const [namingComponents, namingModelStatus] = await Promise.all([
    getNamingComponentsAction(),
    getNamingModelStatusAction(),
  ])

  let initialExecuteEnabled = false
  let initialSafeMaxRows = 15
  let initialSapWritesEnabled = false

  if (access.isAdmin) {
    const settingsRows = (await dbQuery(`
      SELECT key, value
      FROM public.app_settings
      WHERE key IN ('mass_import_execute_enabled','mass_import_safe_max_rows','sap_writes_enabled')
    `) || []) as AppSettingRow[]
    const settingsByKey = new Map<string, unknown>()

    for (const row of settingsRows) settingsByKey.set(String(row.key), row.value)

    initialExecuteEnabled = readBooleanSetting(settingsByKey.get('mass_import_execute_enabled'))
    const configuredSafeMaxRows = Number(settingsByKey.get('mass_import_safe_max_rows') ?? 15)
    initialSafeMaxRows = Number.isFinite(configuredSafeMaxRows) ? configuredSafeMaxRows : 15
    initialSapWritesEnabled = readBooleanSetting(settingsByKey.get('sap_writes_enabled'))
  }

  return (
    <ModuleHub
      node={CONFIGURATION_NAVIGATION}
      permissions={access.permissions}
      isAdmin={access.isAdmin}
      backHref="/"
      backLabel="Volver a Inicio"
    >
      <NomenclaturesSection
        namingComponents={namingComponents}
        namingModelTypes={namingModelStatus.modelTypes}
        orphanFamilyTypes={namingModelStatus.orphanFamilyTypes}
        orphanModelTypes={namingModelStatus.orphanModelTypes}
      />

      {access.isAdmin ? (
        <section className="flex flex-col gap-4 border-t border-slate-200 pt-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Administración del sistema</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Controles operativos</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ajustes restringidos que afectan impresión, escrituras SAP y carga masiva.
            </p>
          </div>
          <PrintSettingsSection />
          <SapWriteSettingsSection initialEnabled={initialSapWritesEnabled} />
          <MassImportSettingsSection
            initialExecuteEnabled={initialExecuteEnabled}
            initialSafeMaxRows={initialSafeMaxRows}
          />
        </section>
      ) : null}
    </ModuleHub>
  )
}
