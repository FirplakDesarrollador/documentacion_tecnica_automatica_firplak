'use client'

import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EstimationCommercialColorCandidate } from './actions'

type CommercialColorSelectorProps = {
  colors: readonly EstimationCommercialColorCandidate[]
  colorCode: string | null
  onSelect: (color: EstimationCommercialColorCandidate | null) => void
  id: string
}

export function CommercialColorSelector({ colors, colorCode, onSelect, id }: CommercialColorSelectorProps) {
  const [query, setQuery] = useState('')
  const filteredColors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleUpperCase('es-CO')
    const matches = normalizedQuery
      ? colors.filter(color => `${color.colorCode} ${color.colorName}`.toLocaleUpperCase('es-CO').includes(normalizedQuery))
      : [...colors]
    const selected = colorCode ? colors.find(color => color.colorCode === colorCode) : null
    return selected && !matches.some(color => color.colorCode === selected.colorCode)
      ? [selected, ...matches]
      : matches
  }, [colorCode, colors, query])

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-filter`}>Color comercial</Label>
      <div className="flex min-w-0 overflow-hidden rounded-lg border border-input bg-white shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        <Input
          id={`${id}-filter`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por código o nombre"
          aria-label="Filtrar colores comerciales"
          className="min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <select
          id={id}
          value={colorCode ?? ''}
          onChange={(event) => {
            const selected = colors.find(color => color.colorCode === event.target.value) ?? null
            onSelect(selected)
          }}
          className="h-10 min-w-0 flex-[1.45] border-0 border-l border-input bg-transparent px-3 text-sm outline-none"
          aria-label="Seleccionar color comercial"
        >
          <option value="">{query.trim() ? 'Seleccione un resultado' : 'Sin seleccionar'}</option>
          {filteredColors.map(color => (
            <option key={color.colorCode} value={color.colorCode}>
              {color.colorCode} · {color.colorName || 'Sin nombre'}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-500">
        Escribe en el campo izquierdo para filtrar inmediatamente las opciones del desplegable ({filteredColors.length} resultado{filteredColors.length === 1 ? '' : 's'}). Luego selecciona el color. El gelcoat SAP se confirma por separado.
      </p>
    </div>
  )
}
