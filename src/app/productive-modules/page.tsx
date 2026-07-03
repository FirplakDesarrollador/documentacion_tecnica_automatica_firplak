import Link from 'next/link'
import { ClipboardList } from 'lucide-react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function ProductiveModulesPage() {
  await requirePagePermission('module:productive-modules')

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Módulos productivos</p>
          <h1 className="text-2xl font-bold text-slate-900">Consulta operativa para planta</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Módulo inicial para visualizar hojas de ruta ya aprobadas, ingresar orden/cantidad e imprimir el formato fijo de producción.
          </p>
        </div>

        <Link
          href="/productive-modules/route-sheets/furniture"
          className="group max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-emerald-50 p-3 text-emerald-700">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Hojas de ruta vista - Muebles</h2>
              <p className="mt-1 text-sm text-slate-600">
                Selecciona SKU piloto, orden y cantidad para visualizar e imprimir la hoja de ruta.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </main>
  )
}
