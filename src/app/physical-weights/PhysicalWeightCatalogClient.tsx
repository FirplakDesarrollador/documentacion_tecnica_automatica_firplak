'use client'

import { useMemo, useState, useTransition } from 'react'
import { Save, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  listPhysicalWeightCatalogAction,
  savePhysicalWeightCatalogItemAction,
  type PhysicalWeightCatalogItem,
} from './actions'

function numberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

export default function PhysicalWeightCatalogClient({ initialItems }: { initialItems: PhysicalWeightCatalogItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(initialItems[0]?.itemCode ?? null)
  const [kgPerUom, setKgPerUom] = useState(initialItems[0] ? numberInput(initialItems[0].kgPerUom) : '')
  const [source, setSource] = useState(initialItems[0]?.source ?? '')
  const [note, setNote] = useState(initialItems[0]?.note ?? '')
  const [isPending, startTransition] = useTransition()
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CO')
    return normalized ? items.filter(item => `${item.itemCode} ${item.itemName ?? ''}`.toLocaleLowerCase('es-CO').includes(normalized)) : items
  }, [items, query])
  const selected = items.find(item => item.itemCode === selectedCode) ?? null

  function select(item: PhysicalWeightCatalogItem): void {
    setSelectedCode(item.itemCode)
    setKgPerUom(numberInput(item.kgPerUom))
    setSource(item.source ?? '')
    setNote(item.note ?? '')
  }

  function save(): void {
    if (!selected) return
    startTransition(async () => {
      try {
        const saved = await savePhysicalWeightCatalogItemAction({
          itemCode: selected.itemCode,
          kgPerUom: kgPerUom.trim() ? Number(kgPerUom) : null,
          source,
          note,
        })
        setItems(current => current.map(item => item.itemCode === saved.itemCode ? saved : item))
        select(saved)
        toast.success('Factor físico guardado.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar el factor físico.')
      }
    })
  }

  function searchCatalog(): void {
    startTransition(async () => {
      try {
        const results = await listPhysicalWeightCatalogAction(query)
        setItems(results)
        if (!results.some(item => item.itemCode === selectedCode)) {
          const first = results[0] ?? null
          setSelectedCode(first?.itemCode ?? null)
          setKgPerUom(first ? numberInput(first.kgPerUom) : '')
          setSource(first?.source ?? '')
          setNote(first?.note ?? '')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo consultar el catálogo físico.')
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader><CardTitle>Factores físicos de componentes</CardTitle><CardDescription>Un factor expresa cuántos kg representa una unidad de medida del componente. Las cotizaciones congelan el factor al calcular.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchCatalog() } }} placeholder="Filtrar por código o nombre" /></div><Button type="button" variant="outline" onClick={searchCatalog} disabled={isPending}>Buscar</Button></div>
          <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200">
            {filtered.map(item => <button key={item.itemCode} type="button" onClick={() => select(item)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm last:border-b-0 ${item.itemCode === selectedCode ? 'bg-sky-50' : 'hover:bg-slate-50'}`}><p className="font-semibold">{item.itemCode}</p><p className="text-slate-600">{item.itemName ?? 'Sin nombre local'}</p><p className="mt-1 text-xs text-slate-500">{item.kgPerUom === null ? 'Sin factor' : `${item.kgPerUom} kg/UOM`} {item.source ? `· ${item.source}` : ''}</p></button>)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Editar factor</CardTitle><CardDescription>{selected ? `${selected.itemCode} · ${selected.itemName ?? 'Sin nombre local'}` : 'Selecciona un componente.'}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="kg-per-uom">kg por UOM</Label><Input id="kg-per-uom" inputMode="decimal" value={kgPerUom} onChange={event => setKgPerUom(event.target.value)} placeholder="Ej. 0.35" disabled={!selected || isPending} /></div>
          <div className="space-y-2"><Label htmlFor="weight-source">Fuente</Label><Input id="weight-source" value={source} onChange={event => setSource(event.target.value)} placeholder="Ficha técnica, pesaje, proveedor" disabled={!selected || isPending} /></div>
          <div className="space-y-2"><Label htmlFor="weight-note">Nota</Label><Textarea id="weight-note" value={note} onChange={event => setNote(event.target.value)} placeholder="Unidad, condición de pesaje o vigencia" disabled={!selected || isPending} /></div>
          <Button type="button" className="w-full" disabled={!selected || isPending} onClick={save}><Save className="h-4 w-4" />Guardar factor</Button>
        </CardContent>
      </Card>
    </div>
  )
}
