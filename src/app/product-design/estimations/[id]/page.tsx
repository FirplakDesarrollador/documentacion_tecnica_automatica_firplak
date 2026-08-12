import { notFound } from 'next/navigation'

import { EstimationEditorClient } from '../EstimationEditorClient'
import { getProductDesignEstimationAction, listEstimationCommercialColorsAction } from '../actions'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function ProductDesignEstimationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission('module:product-design')
  const { id } = await params
  const [estimation, colors] = await Promise.all([
    getProductDesignEstimationAction(id),
    listEstimationCommercialColorsAction(),
  ])
  if (!estimation) notFound()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <EstimationEditorClient initialEstimation={estimation} commercialColors={colors} />
      </div>
    </main>
  )
}
