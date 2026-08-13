import { notFound } from 'next/navigation'

import { EstimationEditorClient } from '../EstimationEditorClient'
import {
  getEstimationFamilyCreationOptionsAction,
  getEstimationFamilyInferenceAction,
  getProductDesignEstimationAction,
  listEstimationCommercialColorsAction,
} from '../actions'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function ProductDesignEstimationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission('module:product-design:estimations')
  const { id } = await params
  const [estimation, colors, familyCreationOptions] = await Promise.all([
    getProductDesignEstimationAction(id),
    listEstimationCommercialColorsAction(),
    getEstimationFamilyCreationOptionsAction(),
  ])
  if (!estimation) notFound()

  const homologueItemCode = estimation.draft.homologue?.sapItemCode ?? estimation.homologueSapItemCode
  const initialFamilyInference = !estimation.familyCode && homologueItemCode
    ? await getEstimationFamilyInferenceAction({
      sapPrefix: estimation.draft.homologue?.sapPrefix ?? estimation.sapPrefix,
      homologueItemCode,
    })
    : null

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <EstimationEditorClient
          initialEstimation={estimation}
          commercialColors={colors}
          familyCreationOptions={familyCreationOptions}
          initialFamilyInference={initialFamilyInference}
        />
      </div>
    </main>
  )
}
