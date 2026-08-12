import { BackLink } from '@/components/navigation/BackLink'
import { requirePagePermission } from '@/utils/auth/access'

import TransferRequestsClient from './TransferRequestsClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function TransferRequestsPage() {
  await requirePagePermission('module:engineering:transfer-requests')
  return (
    <div className="space-y-4">
      <BackLink href="/engineering" label="Volver a Ingeniería" />
      <TransferRequestsClient />
    </div>
  )
}
