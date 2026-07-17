import { requirePagePermission } from '@/utils/auth/access'
import { ConsultaSapClient } from './ConsultaSapClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ConsultaSapPage() {
  await requirePagePermission('module:consulta-sap')

  return (
    <ConsultaSapClient
      initialCode=""
      initialItem={null}
      initialError={null}
    />
  )
}
