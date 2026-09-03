import { ConsultaSapClient } from '@/app/consulta-sap/ConsultaSapClient'
import { getSapItem } from '@/lib/sap/serviceLayer'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata = {
  title: 'Consulta SAP | SamiGen',
}

export default async function SapConsultingPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ itemCode?: string | string[] | undefined }>
}) {
  await requirePagePermission('module:consulta-sap')

  const searchParams = await searchParamsPromise
  const itemCodeValue = searchParams.itemCode
  const itemCode = typeof itemCodeValue === 'string' ? itemCodeValue.trim() : ''
  let initialItem = null
  let initialError: string | null = null

  if (itemCode) {
    try {
      initialItem = await getSapItem(itemCode)
    } catch (error: unknown) {
      initialError = error instanceof Error ? error.message : 'No se pudo consultar SAP.'
    }
  }

  return (
    <ConsultaSapClient
      initialCode={itemCode}
      initialItem={initialItem}
      initialError={initialError}
    />
  )
}
