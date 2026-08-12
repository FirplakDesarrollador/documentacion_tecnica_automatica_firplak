import { EstimationsClient } from './EstimationsClient'
import { listEstimationCommercialColorsAction, listProductDesignEstimationsAction } from './actions'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function ProductDesignEstimationsPage() {
  await requirePagePermission('module:product-design')
  const [estimations, colors] = await Promise.all([
    listProductDesignEstimationsAction(),
    listEstimationCommercialColorsAction(),
  ])

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Diseño de producto</p>
          <h1 className="text-2xl font-bold text-slate-900">Cotizaciones de nuevos productos</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Construye un lienzo de LdM editable desde un homólogo SAP, sin crear todavía referencias, SKU ni estructuras en SAP.
          </p>
        </header>
        <EstimationsClient initialEstimations={estimations} commercialColors={colors} />
      </div>
    </main>
  )
}
