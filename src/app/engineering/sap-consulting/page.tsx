import { ConsultaSapClient } from '@/app/consulta-sap/ConsultaSapClient'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata = {
  title: 'Consulta SAP | SamiGen',
}

export default async function SapConsultingPage() {
  await requirePagePermission('module:consulta-sap')

  return (
    <ConsultaSapClient
      initialCode=""
      initialItem={null}
      initialError={null}
    />
  )
}
