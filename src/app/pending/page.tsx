import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import { getPendingSummary, type PendingDetail, type PendingReason } from '@/lib/engine/validationActions'

export default async function PendingPage() {
  const pendingSummary = await getPendingSummary()
  const pendingProducts = pendingSummary.details

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600 ring-1 ring-amber-600/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            Pendientes
          </h1>
          <p className="text-slate-500 mt-2 text-sm max-w-2xl leading-relaxed">
            Reporte de productos activos/exportables que requieren acciÃ³n (faltantes por plantillas, insumos de naming o traducciÃ³n EN).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50 text-slate-500">
            <TableRow>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Producto / CÃ³digo</TableHead>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Severidad</TableHead>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold">Motivos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-green-600 font-medium">
                  Â¡No hay pendientes! Todos los productos evaluados estÃ¡n listos.
                </TableCell>
              </TableRow>
            ) : (
              pendingProducts.map(({ productId, productCode, productName, severity, reasons }: PendingDetail) => (
                <TableRow key={productId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {productCode}
                      </span>
                      <span className="text-[10px] text-slate-500">{productName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {severity === 'critical' ? (
                      <Badge className="bg-rose-50 text-rose-700 ring-1 ring-rose-700/10 hover:bg-rose-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">
                        CrÃ­tico
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 ring-1 ring-amber-700/10 hover:bg-amber-50 text-[10px] px-2 py-0.5 font-bold uppercase tracking-tight">
                        Advertencia
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 py-1">
                      {reasons.map((r: PendingReason, idx: number) => (
                        <div key={`${r.code}-${idx}`} className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={
                              r.severity === 'critical'
                                ? 'text-[9px] font-bold border-none bg-rose-100 text-rose-700 px-1.5 py-0 uppercase tracking-tighter'
                                : 'text-[9px] font-bold border-none bg-amber-100 text-amber-800 px-1.5 py-0 uppercase tracking-tighter'
                            }
                          >
                            {r.code.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[11px] text-slate-700">{r.message}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

