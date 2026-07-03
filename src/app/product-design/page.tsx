import Link from 'next/link'
import { FileText, PackageSearch } from 'lucide-react'

import { requirePagePermission } from '@/utils/auth/access'

export default async function ProductDesignPage() {
  await requirePagePermission('module:product-design')

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Diseño de producto</p>
          <h1 className="text-2xl font-bold text-slate-900">Herramientas técnicas de producto</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Módulo inicial para importar LdM desde SAP, editar hojas de ruta de muebles y preparar la información técnica que luego usará producción.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/product-design/route-sheets/furniture"
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-indigo-50 p-3 text-indigo-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Hojas de ruta diseño - Muebles</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Importa el piloto SAP, revisa la LdM resuelta y edita la hoja de ruta fija para muebles.
                </p>
              </div>
            </div>
          </Link>

          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-slate-500">
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-slate-100 p-3">
                <PackageSearch className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-700">Siguientes ensayos</h2>
                <p className="mt-1 text-sm">
                  Creación de códigos, subestructuras profundas y validaciones de inconsistencias SAP quedan preparados para fases posteriores.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
