import { requirePagePermission } from '@/utils/auth/access'
import { getPilotBomSummariesAction } from '../../actions'
import { CabinetsRouteDesignClient } from './CabinetsRouteDesignClient'

export default async function CabinetsRouteDesignPage() {
  await requirePagePermission('module:product-design')
  const { summaries } = await getPilotBomSummariesAction()

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Hojas de ruta diseno - Cabinets</p>
          <h1 className="text-2xl font-bold text-slate-900">Hoja de ruta editable con match BOM</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Carga la hoja original, cruza herrajes y materiales contra la LdM resuelta y guarda ajustes de diseno sin modificar la BOM SAP.
          </p>
        </div>
        <CabinetsRouteDesignClient initialSummaries={summaries} />
      </div>
    </main>
  )
}
