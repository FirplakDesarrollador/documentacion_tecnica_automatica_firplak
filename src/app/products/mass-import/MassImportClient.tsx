'use client'

import { useState } from 'react'
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, XCircle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { FamilyFilterOption } from '@/lib/data/filters'

type RpcRow = {
  sku_complete: string
  errors?: string[]
  warnings?: string[]
  created_ids?: { sku_id?: string, version_id?: string, reference_id?: string }
}

function summarizeRows(rows: RpcRow[]) {
  const withErrors = rows.filter(r => (r.errors || []).length > 0).length
  const withWarnings = rows.filter(r => (r.warnings || []).length > 0).length
  return { total: rows.length, withErrors, withWarnings }
}

export function MassImportClient(_props: { families: FamilyFilterOption[] }) {
  return <ProductsImportClient />
}

function ProductsImportClient() {
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [templateFile, setTemplateFile] = useState<File | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  const [previewResult, setPreviewResult] = useState<any>(null)
  const [executeResult, setExecuteResult] = useState<any>(null)

  const generateTemplate = async () => {
    if (!baseFile) return
    setIsGenerating(true)
    setPreviewResult(null)
    setExecuteResult(null)
    try {
      const fd = new FormData()
      fd.append('file', baseFile)
      const res = await fetch('/api/mass-import/template', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        if (j?.error_code === 'MASS_IMPORT_BASE_NO_VALID_ROWS') {
          const found = Array.isArray(j?.details?.found_headers) ? j.details.found_headers.filter(Boolean) : []
          const skuAccepted = Array.isArray(j?.details?.expected?.accepted_sku_headers) ? j.details.expected.accepted_sku_headers : []
          const descAccepted = Array.isArray(j?.details?.expected?.accepted_description_headers) ? j.details.expected.accepted_description_headers : []
          const foundTxt = found.length ? found.join(', ') : '(ninguno / no detectado)'
          const msg =
            `${j?.error || 'Archivo base invalido.'}\n` +
            `Headers encontrados: ${foundTxt}\n` +
            `Headers aceptados para SKU: ${skuAccepted.join(', ')}\n` +
            `Headers aceptados para descripcion: ${descAccepted.join(', ')}`
          throw new Error(msg)
        }
        throw new Error(j?.error || `Error generando plantilla (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PLANTILLA_CARGA_MASIVA_V6.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Plantilla V6 generada.')
    } catch (e: any) {
      // Avoid console.error here; Next.js overlays it as a red error even when it's an expected validation error.
      toast.error(e?.message || 'Error generando plantilla.')
    } finally {
      setIsGenerating(false)
    }
  }

  const previewImport = async () => {
    if (!templateFile) return
    setIsPreviewing(true)
    setPreviewResult(null)
    setExecuteResult(null)
    try {
      const fd = new FormData()
      fd.append('file', templateFile)
      const res = await fetch('/api/mass-import/preview', { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.success) throw new Error(j?.error || 'Preview fallo')
      setPreviewResult(j.result)
      const rows: RpcRow[] = j.result?.rows || []
      const s = summarizeRows(rows)
      if (s.withErrors > 0) toast.error(`Preview con errores: ${s.withErrors} filas bloqueadas.`)
      else toast.success(`Preview OK (${s.total} filas).`)
    } catch (e: any) {
      toast.error(e?.message || 'Preview fallo.')
    } finally {
      setIsPreviewing(false)
    }
  }

  const executeImport = async () => {
    if (!templateFile) return
    setIsExecuting(true)
    setExecuteResult(null)
    try {
      const fd = new FormData()
      fd.append('file', templateFile)
      const res = await fetch('/api/mass-import/execute', { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.success) throw new Error(j?.error || 'Execute fallo')
      setExecuteResult(j)
      toast.success(j.safeMode ? 'Ejecucion completada (modo seguro: cleanup aplicado).' : 'Ejecucion completada.')
    } catch (e: any) {
      toast.error(e?.message || 'Execute fallo.')
    } finally {
      setIsExecuting(false)
    }
  }

  const previewRows: RpcRow[] = previewResult?.rows || []
  const previewSummary = summarizeRows(previewRows)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-slate-700" />
            Paso 1: Generar Plantilla V6
          </CardTitle>
          <CardDescription>
            Sube un archivo base (CSV o XLSX) con <b>SKU_COMPLETE</b> y <b>SAP_DESCRIPTION</b>. El sistema te devuelve una plantilla XLSX.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".csv,.xlsx"
            onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }}
            onChange={(e) => setBaseFile(e.target.files?.[0] || null)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button onClick={generateTemplate} disabled={!baseFile || isGenerating} className="w-full">
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generar plantilla
          </Button>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          La plantilla incluye `Carga`, `Familias_nuevas`, `Colores_nuevos`, `Versiones_nuevas` y `Diagnostico`.
        </CardFooter>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Paso 2: Preview + Importar
          </CardTitle>
          <CardDescription>
            Sube la plantilla diligenciada. Primero ejecuta <b>Preview</b> (bloquea enums invalidos y REF_ATTR desconocidos). Luego ejecuta <b>Importar</b>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".xlsx"
            onClick={(e) => { (e.currentTarget as HTMLInputElement).value = '' }}
            onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button variant="outline" onClick={previewImport} disabled={!templateFile || isPreviewing}>
              {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Preview (dry-run)
            </Button>
            <Button onClick={executeImport} disabled={!templateFile || isExecuting}>
              {isExecuting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Importar
            </Button>
          </div>

          {previewResult && (
            <div className={`rounded-md border p-3 ${previewSummary.withErrors > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-2">
                {previewSummary.withErrors > 0 ? (
                  <XCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                <div className="text-sm font-medium">
                  Preview: {previewSummary.total} filas, {previewSummary.withErrors} con error, {previewSummary.withWarnings} con warning
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Si hay `REF_ATTR_*` desconocidos o familias sin schema, ve a{' '}
                <Link className="underline" href="/configuration/reference-editor">/configuration/reference-editor</Link>.
              </div>
            </div>
          )}

          {executeResult && (
            <div className={`rounded-md border p-3 ${executeResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {executeResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <div className="text-sm font-medium">
                  {executeResult.safeMode ? 'Ejecucion completada (modo seguro: no persiste).' : 'Ejecucion completada.'}
                </div>
              </div>
              {executeResult.cleanupResult && (
                <div className="text-xs text-muted-foreground mt-2">
                  {executeResult.summary ? (
                    <>
                      Creados: {executeResult.summary.created_skus} SKUs, {executeResult.summary.created_version_variants} versiones, {executeResult.summary.created_reference_variants} referencias. Cleanup: {executeResult.cleanupResult.deleted_skus} SKUs, {executeResult.cleanupResult.deleted_versions} versiones, {executeResult.cleanupResult.deleted_references} referencias.
                    </>
                  ) : (
                    <>Cleanup (solo modo seguro): {executeResult.cleanupResult.deleted_skus} SKUs, {executeResult.cleanupResult.deleted_versions} versiones, {executeResult.cleanupResult.deleted_references} referencias.</>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
