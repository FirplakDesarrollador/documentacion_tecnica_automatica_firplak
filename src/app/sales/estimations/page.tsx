import { SalesEstimationsClient } from './SalesEstimationsClient'
import { listSharedSalesEstimationsAction } from './actions'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function SalesEstimationsPage() {
  await requirePagePermission('module:sales')
  const estimations = await listSharedSalesEstimationsAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Ventas</p>
          <h1 className="text-2xl font-bold text-slate-900">Cotizaciones compartidas</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Consulta los costos y escenarios que Diseño decidió compartir. Esta vista no edita la cotización ni crea datos en SAP.
          </p>
        </header>
        <SalesEstimationsClient initialEstimations={estimations} />
      </div>
    </main>
  )
}
