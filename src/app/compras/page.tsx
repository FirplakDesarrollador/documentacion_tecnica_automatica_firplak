import { requirePagePermission } from '@/utils/auth/access'

export default async function ComprasPage() {
  await requirePagePermission('module:compras:proveedores')
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compras</h1>
      <p className="text-sm text-slate-600">Accede a proveedores sincronizados desde SAP.</p>
    </div>
  )
}
