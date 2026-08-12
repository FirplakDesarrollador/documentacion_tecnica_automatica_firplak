import { ModuleHub } from '@/components/navigation/ModuleHub'
import { PRODUCTIVE_MODULES_NAVIGATION } from '@/lib/navigation/moduleHierarchy'
import { requirePagePermission } from '@/utils/auth/access'

export default async function ProductiveModulesPage() {
  const access = await requirePagePermission('module:productive-modules')

  return (
    <ModuleHub
      node={PRODUCTIVE_MODULES_NAVIGATION}
      permissions={access.permissions}
      isAdmin={access.isAdmin}
      backHref="/"
      backLabel="Volver a Inicio"
    />
  )
}
