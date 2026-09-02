'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Tags } from 'lucide-react'
import { toast } from 'sonner'

import { saveSapBomCostCategoryMappingAction } from '@/app/configuration/actions'
import type { SapBomCostCategoryMapping } from '@/lib/sap/costCategoryResolver'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Props = { initialMapping: SapBomCostCategoryMapping }

export function SapBomCostCategorySettingsSection({ initialMapping }: Props) {
  const [text, setText] = useState(() => JSON.stringify(initialMapping, null, 2))
  const [savedMapping, setSavedMapping] = useState(initialMapping)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      try {
        const saved = await saveSapBomCostCategoryMappingAction({ mapping: JSON.parse(text) as unknown })
        setSavedMapping(saved)
        setText(JSON.stringify(saved, null, 2))
        toast.success('Clasificación SAP guardada y verificada.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar la clasificación SAP.')
      }
    })
  }

  return (
    <Card className="border-2 border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50">
        <CardTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900"><Tags className="size-5 text-slate-600" /> Clasificación de costos SAP</CardTitle>
        <CardDescription>Relaciona atributos de artículos SAP con material, empaque, mano de obra o CIF. La prioridad es grupo de artículo, grupo de material, familia y grupo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <textarea value={text} onChange={event => setText(event.target.value)} spellCheck={false} className="min-h-64 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" aria-label="Mapping de categorías de costo SAP en JSON" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={isPending}>Guardar clasificación</Button>
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Vigente: {Object.values(savedMapping).reduce((total, source) => total + Object.keys(source).length, 0)} reglas</span>
        </div>
      </CardContent>
    </Card>
  )
}
