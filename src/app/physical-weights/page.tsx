import { redirect } from 'next/navigation'

import { BackLink } from '@/components/navigation/BackLink'
import { getAccessContext } from '@/utils/auth/access'
import { hasPermission } from '@/types/auth'

import { listPhysicalWeightCatalogAction } from './actions'
import PhysicalWeightCatalogClient from './PhysicalWeightCatalogClient'

export const dynamic = 'force-dynamic'

export default async function PhysicalWeightsPage() {
  const access = await getAccessContext()
  if (!access.user) redirect('/login')
  const allowed = access.isAdmin
    || hasPermission(access.permissions, 'module:product-design:estimations')
    || hasPermission(access.permissions, 'module:engineering:measurements')
  if (!allowed) redirect(access.homePath)
  const initialItems = await listPhysicalWeightCatalogAction()
  const backHref = hasPermission(access.permissions, 'module:engineering:measurements') ? '/engineering/measurements' : '/product-design/estimations'
  return <main className="mx-auto max-w-7xl space-y-4 py-2"><BackLink href={backHref} label="Volver" /><PhysicalWeightCatalogClient initialItems={initialItems} /></main>
}
