'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listSuppliersAction, syncSapSuppliersAction, type SupplierListItem } from './actions'

export function SuppliersClient({ initialSuppliers, initialLastSyncAt }: { initialSuppliers: SupplierListItem[]; initialLastSyncAt: string | null }) {
  const [query, setQuery] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>(initialSuppliers)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialLastSyncAt)
  const [confirmed, setConfirmed] = useState(false)
  const [isPending, startTransition] = useTransition()

  const load = (nextQuery = query) => {
    startTransition(async () => {
      try {
        const result = await listSuppliersAction(nextQuery)
        setSuppliers(result.suppliers)
        setLastSyncAt(result.lastSyncAt)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudieron cargar proveedores.')
      }
    })
  }

  const sync = () => {
    startTransition(async () => {
      try {
        const result = await syncSapSuppliersAction({ confirmed })
        setLastSyncAt(result.lastSyncAt)
        setConfirmed(false)
        toast.success(`${result.synced} proveedores sincronizados y verificados.`)
        const refreshed = await listSuppliersAction(query)
        setSuppliers(refreshed.suppliers)
        setLastSyncAt(refreshed.lastSyncAt)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudieron sincronizar proveedores.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Proveedores</h1><p className="mt-1 text-sm text-slate-600">Maestro local sincronizado desde SAP.</p></div>
        <Badge variant="outline">Último sync: {lastSyncAt ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSyncAt)) : 'sin datos'}</Badge>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') load() }} placeholder="Buscar por código o nombre" />
        <Button type="button" variant="outline" onClick={() => load()} disabled={isPending}>Buscar</Button>
        <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo sincronizar</label>
        <Button type="button" onClick={sync} disabled={!confirmed || isPending}><RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />Sincronizar SAP</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="p-3">Código</th><th className="p-3">Proveedor</th><th className="p-3">Moneda</th><th className="p-3">Contacto</th><th className="p-3">Estado</th></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.bpCode} className="border-t border-slate-100 hover:bg-slate-50"><td className="p-3 font-medium">{supplier.bpCode}</td><td className="p-3">{supplier.cardName}</td><td className="p-3">{supplier.defaultCurrency ?? '—'}</td><td className="p-3">{supplier.emailAddress ?? supplier.phone1 ?? '—'}</td><td className="p-3"><Badge variant={supplier.isActive ? 'secondary' : 'outline'}>{supplier.isActive ? 'Activo' : 'Inactivo'}</Badge></td></tr>)}{suppliers.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No hay proveedores locales. Sincroniza SAP para cargar el maestro.</td></tr>}</tbody></table></div>
    </div>
  )
}
