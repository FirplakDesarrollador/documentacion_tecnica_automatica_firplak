'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EstimationSapProductInput } from './actions'

type ProductCreationFormProps = {
  product: EstimationSapProductInput
  designationOptions: string[]
  pending: boolean
  onChange: (product: EstimationSapProductInput) => void
  onPrepare: (product: EstimationSapProductInput) => void
}

export function ProductCreationForm({ product, designationOptions, pending, onChange, onPrepare }: ProductCreationFormProps) {
  const [isNewDesignation, setIsNewDesignation] = useState(false)
  const prepare = () => {
    onPrepare(product)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="sap-product-name">Nombre del producto</Label>
        <Input id="sap-product-name" value={product.productName} onChange={(event) => onChange({ ...product, productName: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sap-special-label">Etiqueta especial</Label>
        <Input id="sap-special-label" value={product.specialLabel ?? ''} onChange={(event) => onChange({ ...product, specialLabel: event.target.value || null })} placeholder="Opcional" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sap-commercial-measure">Medida comercial</Label>
        <Input id="sap-commercial-measure" value={product.commercialMeasure ?? ''} onChange={(event) => onChange({ ...product, commercialMeasure: event.target.value || null })} placeholder="Opcional" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="sap-designation">Designación</Label>
        {isNewDesignation ? <div className="flex gap-2"><Input id="sap-designation" value={product.designation ?? ''} onChange={(event) => onChange({ ...product, designation: event.target.value })} placeholder="Nueva designación" /><Button type="button" variant="outline" onClick={() => { setIsNewDesignation(false); onChange({ ...product, designation: null }) }}>Usar existentes</Button></div> : <select id="sap-designation" value={product.designation ?? ''} onChange={(event) => { if (event.target.value === '__NEW__') { setIsNewDesignation(true); onChange({ ...product, designation: null }); return } onChange({ ...product, designation: event.target.value || null }) }} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"><option value="">Seleccionar designación...</option><option value="__NEW__">Agregar nueva...</option>{product.designation && !designationOptions.includes(product.designation) && <option value={product.designation}>{product.designation}</option>}{designationOptions.map(designation => <option key={designation} value={designation}>{designation}</option>)}</select>}
      </div>
      <p className="text-xs text-amber-800 sm:col-span-2">La designación es obligatoria, puede ser NA y alimenta la nomenclatura. Peso, apilamiento y línea quedan pendientes de completar en el catálogo.</p>
      <Button type="button" className="sm:col-span-2" onClick={prepare} disabled={pending || !product.productName.trim() || !product.designation?.trim()}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Preparar dry-run
      </Button>
    </div>
  )
}
