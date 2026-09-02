'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, RefreshCw, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createSapCodeFromEstimationAction,
  listEstimationDesignationsAction,
  prepareSapCodeFromEstimationAction,
  saveEstimationMissingTranslationsAction,
  syncCreatedSubBomsFromSapAction,
  type EstimationSapCreationPreview,
  type EstimationSapProductInput,
  type ProductDesignEstimation,
} from './actions'
import { ProductCreationForm } from './ProductCreationForm'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación SAP.'
}

export function CreateSapCodeButton({
  estimation,
  onConverted,
}: {
  estimation: ProductDesignEstimation
  onConverted: (estimation: ProductDesignEstimation) => void
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<EstimationSapCreationPreview | null>(null)
  const [product, setProduct] = useState<EstimationSapProductInput>({
    productName: estimation.provisionalName,
    specialLabel: null,
    commercialMeasure: null,
    designation: 'NA',
    line: 'NA',
    stackingMax: null,
  })
  const [confirmed, setConfirmed] = useState(false)
  const [designationOptions, setDesignationOptions] = useState<string[]>([])
  const [missingTranslations, setMissingTranslations] = useState<string[]>([])
  const [translationValues, setTranslationValues] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const prepare = (nextProduct: EstimationSapProductInput) => {
    setProduct(nextProduct)
    setMissingTranslations([])
    startTransition(async () => {
      try {
        const nextPreview = await prepareSapCodeFromEstimationAction({ id: estimation.id, product: nextProduct })
        setPreview(nextPreview)
        setConfirmed(false)
      } catch (error) {
        const message = errorMessage(error)
        const match = message.match(/^Faltan traducciones al inglés para: (.+)\. Regístralas/u)
        if (!match) {
          toast.error(message)
          return
        }
        const terms = match[1]!.split(',').map(term => term.trim()).filter(Boolean)
        setMissingTranslations(terms)
        setTranslationValues(Object.fromEntries(terms.map(term => [term, ''])))
      }
    })
  }

  const saveMissingTranslations = () => {
    startTransition(async () => {
      try {
        await saveEstimationMissingTranslationsAction({ translations: missingTranslations.map(term => ({ term, translation: translationValues[term] ?? '' })) })
        setMissingTranslations([])
        setTranslationValues({})
        toast.success('Traducciones guardadas. Ejecuta nuevamente el dry-run.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const openCreationDialog = () => {
    setOpen(true)
    startTransition(async () => {
      try {
        setDesignationOptions(await listEstimationDesignationsAction({ id: estimation.id }))
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const create = () => {
    startTransition(async () => {
      try {
        const result = await createSapCodeFromEstimationAction({ id: estimation.id, product, confirmed })
        onConverted(result.estimation)
        toast.success(`Código ${result.preview.itemCode} creado y verificado en SAP.`)
        setOpen(false)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  const syncCanvas = () => {
    startTransition(async () => {
      try {
        onConverted(await syncCreatedSubBomsFromSapAction({ id: estimation.id }))
        toast.success('El lienzo fue sincronizado con las sub-LdM creadas en SAP.')
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  if (estimation.convertedAt && estimation.sapCreatedItemCode) {
    return <div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />SAP verificado: {estimation.sapCreatedItemCode}</Badge><Button type="button" size="sm" variant="outline" disabled={isPending} onClick={syncCanvas}>{isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{!isPending && <RefreshCw className="h-3.5 w-3.5" />}Sincronizar lienzo SAP</Button></div>
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setPreview(null) }}>
      <Button type="button" onClick={openCreationDialog}><WandSparkles className="h-4 w-4" />Crear código SAP</Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear código SAP desde cotización</DialogTitle>
          <DialogDescription>Primero revisa el dry-run. La creación requiere una casilla de confirmación y relee SAP al finalizar.</DialogDescription>
        </DialogHeader>
        {!preview ? <div className="space-y-4">{missingTranslations.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Completa las traducciones para continuar</p><p className="mt-1 text-xs">Estos términos se usan para construir el nombre SAP recomendado en inglés.</p><div className="mt-3 space-y-2">{missingTranslations.map(term => <div key={term} className="grid gap-1 sm:grid-cols-2 sm:items-center"><label htmlFor={`translation-${term}`} className="break-words text-xs font-medium">{term}</label><Input id={`translation-${term}`} value={translationValues[term] ?? ''} onChange={(event) => setTranslationValues(current => ({ ...current, [term]: event.target.value }))} placeholder="Traducción al inglés" /></div>)}</div><Button type="button" className="mt-3" onClick={saveMissingTranslations} disabled={isPending || missingTranslations.some(term => !(translationValues[term] ?? '').trim())}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}Guardar traducciones</Button></div>}<ProductCreationForm product={product} designationOptions={designationOptions} pending={isPending} onChange={setProduct} onPrepare={prepare} /></div> : (
          <div className="space-y-4">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
              <p><strong>Artículo:</strong> {preview.itemCode}</p>
              <p><strong>Descripción SAP:</strong> {preview.sapDescription}</p>
              <p><strong>Descripción SAP EN:</strong> {preview.itemPayload.ForeignName as string}</p>
              <p><strong>Designación:</strong> {preview.designation}</p>
              <p><strong>Grupo SAP:</strong> {preview.itemsGroupCode}</p>
              <p><strong>Bodega de salida LdM:</strong> {preview.outputWarehouse}</p>
               <p><strong>Datos que se crearán:</strong> artículo válido, descripción ES/EN, grupo SAP y configuración comercial.</p>
               <p><strong>Retención del artículo final:</strong> {preview.itemPayload.WTLiable === 'tYES' ? 'Sí, heredada del artículo vendible origen.' : 'No.'}</p>
               <p><strong>Componentes directos:</strong> {preview.tree.finalItemLines.length}</p>
               <p><strong>Sub-LdM por crear o reutilizar:</strong> {preview.tree.subBoms.length}</p>
             </div>
             {preview.tree.subBoms.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Paso 1: preparar sub-LdM</p><p className="mt-1 text-xs">Estas estructuras se procesan antes del artículo final porque la LdM final las necesita como componentes.</p>{preview.tree.subBoms.map(plan => <div key={plan.itemCode} className="mt-2"><p><strong>{plan.reuseExisting ? 'Reutilizar' : 'Crear'} {plan.itemCode}</strong></p><p className="text-xs">Basada en {plan.sourceItemCode} · {plan.itemName} · {plan.lines.length} componentes</p></div>)}</div>}
             <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><p className="font-semibold">Retenciones verificadas desde SAP</p>{preview.withholdings.map(withholding => <div key={withholding.targetItemCode} className="mt-2"><p><strong>{withholding.sourceItemCode}</strong> → {withholding.targetItemCode}</p>{withholding.fields.length === 0 ? <p className="text-xs">Sin campos de retención en el artículo origen.</p> : withholding.fields.map((field, index) => <p key={`${withholding.targetItemCode}-${field.field}-${index}`} className="text-xs">{field.field}: {field.value}</p>)}</div>)}</div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-semibold">Componentes nivel 2</p>{preview.tree.finalItemLines.map(line => <p key={`${line.ItemCode}-${line.Quantity}`}>{line.ItemCode} · {line.Quantity}</p>)}</div>
            <ul className="space-y-1 text-xs text-amber-800">{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />Estoy de acuerdo con crear los artículos, LdM y retenciones mostrados en SAP.</label>
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={isPending}>Editar formulario</Button><Button type="button" onClick={create} disabled={!confirmed || isPending}>{isPending && <Loader2 className="h-4 w-4 animate-spin" />}Crear código SAP</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
