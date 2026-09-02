import { BackLink } from '@/components/navigation/BackLink'
import { requirePagePermission } from '@/utils/auth/access'

import { SuppliersClient } from './SuppliersClient'
import { listSuppliersAction } from './actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function SuppliersPage() {
  await requirePagePermission('module:compras:proveedores')
  const initial = await listSuppliersAction()
  return <div className="space-y-4"><BackLink href="/compras" label="Volver a Compras" /><SuppliersClient initialSuppliers={initial.suppliers} initialLastSyncAt={initial.lastSyncAt} /></div>
}
