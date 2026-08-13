import { SalesEstimationsClient } from './SalesEstimationsClient'
import { getSalesPricingFormulaConfigAction, listSharedSalesEstimationsAction } from './actions'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function SalesEstimationsPage() {
  await requirePagePermission('module:sales:estimations')
  const [estimations, formulas] = await Promise.all([
    listSharedSalesEstimationsAction(),
    getSalesPricingFormulaConfigAction(),
  ])

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Ventas</p>
          <h1 className="text-2xl font-bold text-slate-900">Cotizaciones compartidas</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Administra precios y respuesta comercial sobre los costos técnicos compartidos. No altera la LdM ni crea datos en SAP.
          </p>
        </header>
        <SalesEstimationsClient initialEstimations={estimations} initialFormulas={formulas} />
      </div>
    </main>
  )
}
