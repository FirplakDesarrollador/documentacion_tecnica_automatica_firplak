import { BackLink } from '@/components/navigation/BackLink'
import { requirePagePermission } from '@/utils/auth/access'

import { listEngineeringEstimationReviewsAction } from './actions'
import { EngineeringEstimationReviewsClient } from './EngineeringEstimationReviewsClient'

export const dynamic = 'force-dynamic'

export default async function EngineeringEstimationsPage() {
  await requirePagePermission('module:engineering')
  const estimations = await listEngineeringEstimationReviewsAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="space-y-2">
          <BackLink href="/engineering" label="Volver a Ingeniería" />
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Cotizador de nuevos productos</p>
          <h1 className="text-2xl font-bold text-slate-900">Revisiones técnicas de cotizaciones</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Consulta las cotizaciones vivas y deja una revisión técnica para Diseño. Esta revisión es informativa: no crea artículos SAP ni bloquea la decisión comercial.
          </p>
        </header>

        <EngineeringEstimationReviewsClient initialEstimations={estimations} />
      </div>
    </main>
  )
}
