import Link from 'next/link'
import { FileText, GitBranch, ClipboardCheck } from 'lucide-react'

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
            Herramientas separadas para alinear LdM/BOM SAP con Supabase y construir hojas de ruta usando códigos ya importados.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/product-design/bom"
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-indigo-50 p-3 text-indigo-700">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Importación y alineación LdM/BOM</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Importa desde SAP, relaciona componentes, revisa faltantes y prepara la base productiva en Supabase + App.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/product-design/color-audit"
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-emerald-50 p-3 text-emerald-700">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Auditoría de colores SAP</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Contrasta U_Color contra el color codificado en todos los SKU de venta, con avance y exportación.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/product-design/route-sheets/cabinets"
            className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-md bg-indigo-50 p-3 text-indigo-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Hojas de ruta - Cabinets</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Edita documentos productivos con base en códigos ya importados y validados desde la LdM/BOM.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  )
}
