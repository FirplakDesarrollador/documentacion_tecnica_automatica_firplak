import { ModuleHub } from '@/components/navigation/ModuleHub'
import { PRODUCT_DESIGN_NAVIGATION } from '@/lib/navigation/moduleHierarchy'
import { requirePagePermission } from '@/utils/auth/access'

export default async function ProductDesignPage() {
  const access = await requirePagePermission('module:product-design')

  return (
    <ModuleHub
      node={PRODUCT_DESIGN_NAVIGATION}
      permissions={access.permissions}
      isAdmin={access.isAdmin}
      backHref="/"
      backLabel="Volver a Inicio"
    />
  )
}
