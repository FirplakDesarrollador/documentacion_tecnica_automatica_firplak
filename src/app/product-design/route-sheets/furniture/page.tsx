import { requirePagePermission } from '@/utils/auth/access'
import { getPilotBomSummariesAction } from '../../actions'
import { FurnitureRouteDesignClient } from './FurnitureRouteDesignClient'

export default async function FurnitureRouteDesignPage() {
  await requirePagePermission('module:product-design')
  const { summaries } = await getPilotBomSummariesAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Hojas de ruta diseño - Muebles</p>
          <h1 className="text-2xl font-bold text-slate-900">LdM SAP y hoja de ruta editable</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Importa los SKUs piloto desde SAP, revisa la lista de materiales resuelta y edita la información productiva que verá planta.
          </p>
        </div>
        <FurnitureRouteDesignClient initialSummaries={summaries} />
      </div>
    </main>
  )
}
