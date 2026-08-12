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
      <Input
        id={`${id}-filter`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filtrar por código o nombre"
      />
      <select
        id={id}
        value={colorCode ?? ''}
        onChange={(event) => {
          const selected = colors.find(color => color.colorCode === event.target.value) ?? null
          onSelect(selected)
        }}
        className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"
      >
        <option value="">Sin seleccionar</option>
        {filteredColors.map(color => (
          <option key={color.colorCode} value={color.colorCode}>
            {color.colorCode} · {color.colorName || 'Sin nombre'}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500">
        Se guarda el color del catálogo comercial. El gelcoat SAP se confirma por separado.
      </p>
    </div>
  )
}
