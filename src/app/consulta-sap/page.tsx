import { requirePagePermission } from '@/utils/auth/access'
import { getSapItem, SapServiceLayerError, type SapEntityPayload } from '@/lib/sap/serviceLayer'
import { ConsultaSapClient } from './ConsultaSapClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_ITEM_CODE = 'VBAN12-0012-000-0458'

type ConsultaSapPageProps = {
  searchParams?: Promise<{ code?: string }>
}

async function loadInitialItem(itemCode: string): Promise<{
  item: SapEntityPayload | null
  error: string | null
}> {
  try {
    return {
      item: await getSapItem(itemCode),
      error: null,
    }
  } catch (error: unknown) {
    const message = error instanceof SapServiceLayerError || error instanceof Error
      ? error.message
      : 'No se pudo consultar SAP'

    return {
      item: null,
      error: message,
    }
  }
}

export default async function ConsultaSapPage({ searchParams }: ConsultaSapPageProps) {
  await requirePagePermission('module:consulta-sap')

  const params = await searchParams
  const initialCode = params?.code?.trim() || DEFAULT_ITEM_CODE
  const initial = await loadInitialItem(initialCode)

  return (
    <ConsultaSapClient
      initialCode={initialCode}
      initialItem={initial.item}
      initialError={initial.error}
    />
  )
}
