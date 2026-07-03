import { requirePagePermission } from '@/utils/auth/access'
import { getProductivePilotSkusAction } from '../../actions'
import { FurnitureRouteViewClient } from './FurnitureRouteViewClient'

export default async function FurnitureRouteViewPage() {
  await requirePagePermission('module:productive-modules')
  const pilotSkus = await getProductivePilotSkusAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="no-print">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Hojas de ruta vista - Muebles</p>
          <h1 className="text-2xl font-bold text-slate-900">Consulta e impresión para producción</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Selecciona el SKU, ingresa orden y cantidad. El formato impreso es fijo para esta primera versión.
          </p>
        </div>
        <FurnitureRouteViewClient pilotSkus={pilotSkus} />
      </div>
    </main>
  )
}
