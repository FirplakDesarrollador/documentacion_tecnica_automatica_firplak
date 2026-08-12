import { ModuleHub } from '@/components/navigation/ModuleHub'
import { SALES_NAVIGATION } from '@/lib/navigation/moduleHierarchy'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const access = await requirePagePermission('module:sales')

  return (
    <ModuleHub
      node={SALES_NAVIGATION}
      permissions={access.permissions}
      isAdmin={access.isAdmin}
      backHref="/"
      backLabel="Volver a Inicio"
    />
  )
}
