import Link from 'next/link'
import { ArrowRight, ClipboardList, Wrench } from 'lucide-react'

import { BackLink } from '@/components/navigation/BackLink'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function EngineeringPage() {
  await requirePagePermission('module:engineering')

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-2">
      <header className="space-y-2">
        <BackLink href="/" label="Volver a Inicio" />
        <div className="flex items-center gap-2 text-sm font-semibold text-firplak-green">
          <Wrench className="h-4 w-4" />
          Ingeniería
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Operaciones SAP</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Centraliza los trámites operativos de SAP que se realizan desde la aplicación. Las consultas generales de SAP continúan disponibles en su acceso directo habitual.
        </p>
      </header>

      <Link href="/engineering/sap-operations/transfer-requests" className="block max-w-2xl">
        <Card className="border-firplak-green/20 transition hover:-translate-y-0.5 hover:border-firplak-green/45 hover:shadow-md">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-firplak-green/10 text-firplak-green">
              <ClipboardList className="h-5 w-5" />
            </div>
            <CardTitle className="flex items-center justify-between gap-4">
              Solicitudes de traslado
              <ArrowRight className="h-5 w-5 text-firplak-green" />
            </CardTitle>
            <CardDescription>
              Crea solicitudes verificadas en SAP, revisa su historial y descarga el comprobante PDF para compartirlo por Teams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-medium text-slate-500">
              Esta primera versión no ejecuta traslados físicos ni llama a StockTransfers.
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
