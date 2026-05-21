import Link from 'next/link'
import { ArrowLeft, Edit3 } from 'lucide-react'
import MassEditClient from './MassEditClient'
import { Button } from '@/components/ui/button'

export default function SkuEditorPage() {
  return (
    <div className="flex flex-col gap-8 text-foreground pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/configuration" className="text-slate-400 hover:text-slate-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <Edit3 className="w-8 h-8 text-emerald-500" />
              Editor Masivo de SKUs
            </h1>
          </div>
          <p className="text-slate-500 max-w-2xl">
            Herramienta avanzada para actualizar masivamente información de los SKUs, como código de barras, estado, y atributos personalizados JSONB (sku_attrs).
          </p>
        </div>
      </div>

      <MassEditClient />
    </div>
  )
}
