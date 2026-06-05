'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, Download, FileUp, Loader2, PackageSearch, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getOrphanReferencesAction, inactivateOrphanReferencesAction, type OrphanReferenceRow } from '@/app/assets/orphans-actions'
import { normalizeText } from '@/lib/isometrics/bulkMatch'
import { directoryInputProps } from '@/lib/ui/directoryInputProps'
import { supabase } from '@/lib/supabase'

type ParsedExcel = {
  groups: Array<{
    similarity_code: string
    expected_svg_filename: string
    reference_ids: string[]
    family_codes: string[]
    reference_labels: Record<string, string>
  }>
  allowed_reference_ids: string[]
  expected_filename_to_group: Record<string, string>
  warnings: string[]
}

type WizardItem = {
  id: string // relative_path
  relative_path: string
  base_name: string
  ext: string
  similarity_code: string
  expected_svg_filename: string
  match_status: 'OK' | 'NO_MATCH_EXPECTED_NAME' | 'DUPLICATE_EXPECTED_NAME'
  target_reference_ids: string[]
  target_reference_labels: Record<string, string>
}

function stripExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.')
  if (idx > 0) return { base: fileName.slice(0, idx), ext: fileName.slice(idx).toLowerCase() }
  return { base: fileName, ext: '' }
}

function isAiFilename(fileName: string) {
  return String(fileName || '')
    .trim()
    .toLowerCase()
    .endsWith('.ai')
}

async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function OrphanProductsDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<'list' | 'associate'>('list')
  const [loading, setLoading] = React.useState(false)
  const [orphans, setOrphans] = React.useState<OrphanReferenceRow[]>([])
  const [lastLoadedAt, setLastLoadedAt] = React.useState<Date | null>(null)
  const [selectedOrphanIds, setSelectedOrphanIds] = React.useState<Record<string, boolean>>({})

  const [parsingExcel, setParsingExcel] = React.useState(false)
  const [excel, setExcel] = React.useState<ParsedExcel | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
  const [fileByRelativePath, setFileByRelativePath] = React.useState<Map<string, File>>(new Map())
  const [ignoredAiCount, setIgnoredAiCount] = React.useState(0)

  const [items, setItems] = React.useState<WizardItem[]>([])
  const [missingGroups, setMissingGroups] = React.useState<string[]>([])
  const [targetSelectionByItemId, setTargetSelectionByItemId] = React.useState<Record<string, string[]>>({})

  const [isApplying, setIsApplying] = React.useState(false)
  const [progress, setProgress] = React.useState<{ phase: string; current: number; total: number } | null>(null)

  const resetDialogState = React.useCallback(() => {
    setStep('list')
    setOrphans([])
    setExcel(null)
    setSelectedFiles([])
    setFileByRelativePath(new Map())
    setIgnoredAiCount(0)
    setItems([])
    setMissingGroups([])
    setTargetSelectionByItemId({})
    setProgress(null)
    setSelectedOrphanIds({})
  }, [])

  const loadOrphans = async () => {
    setLoading(true)
    try {
      const data = await getOrphanReferencesAction()
      setOrphans(Array.isArray(data) ? data : [])
      setLastLoadedAt(new Date())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los huérfanos')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        void loadOrphans()
        return
      }
      resetDialogState()
    },
    [resetDialogState]
  )

  const selectedOrphanCount = React.useMemo(() => Object.values(selectedOrphanIds).filter(Boolean).length, [selectedOrphanIds])

  const setAllOrphansSelected = (checked: boolean) => {
    if (!checked) {
      setSelectedOrphanIds({})
      return
    }
    const next: Record<string, boolean> = {}
    for (const o of orphans) next[o.reference_id] = true
    setSelectedOrphanIds(next)
  }

  const toggleOrphanSelected = (referenceId: string) => {
    setSelectedOrphanIds(prev => ({ ...prev, [referenceId]: !prev[referenceId] }))
  }

  const inactivateSelected = async () => {
    const ids = Object.entries(selectedOrphanIds)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k)
    if (ids.length === 0) return
    const ok = window.confirm(`¿Inactivar ${ids.length} referencia(s)? Esto las sacará del listado de huérfanos.`)
    if (!ok) return

    setLoading(true)
    try {
      const res = await inactivateOrphanReferencesAction(ids)
      toast.success(`Inactivadas: ${res.updated}`)
      setSelectedOrphanIds({})
      await loadOrphans()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron inactivar referencias')
    } finally {
      setLoading(false)
    }
  }

  const downloadExcel = async () => {
    try {
      const res = await fetch('/api/assets/orphans/export')
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || 'No se pudo exportar')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ORPHAN_REFERENCES_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error exportando Excel')
    }
  }

  const onUploadExcel = async (file: File | null) => {
    if (!file) return
    setParsingExcel(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/assets/orphans/parse', { method: 'POST', body: fd })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j?.success) throw new Error(String(j?.error || 'No se pudo leer el Excel'))
      const parsed = j as ParsedExcel & { success: true }
      setExcel(parsed)
      if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) {
        toast.message(`Excel leído con warnings: ${parsed.warnings.length}`)
      } else toast.success('Excel leído correctamente.')
      setStep('associate')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el Excel')
    } finally {
      setParsingExcel(false)
    }
  }

  const onPickFolder = (files: FileList | null) => {
    const rawList = Array.from(files || [])
    const aiFiles = rawList.filter(f => isAiFilename(f.name)).length
    const list = rawList.filter(f => !isAiFilename(f.name))
    setSelectedFiles(list)
    setIgnoredAiCount(aiFiles)
    const m = new Map<string, File>()
    for (const f of list) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      m.set(rel, f)
    }
    setFileByRelativePath(m)
    setItems([])
    setMissingGroups([])
    setTargetSelectionByItemId({})
    setProgress(null)
  }

  const buildPreview = () => {
    if (!excel) {
      toast.error('Primero sube el Excel.')
      return
    }
    if (selectedFiles.length === 0) {
      toast.error('Selecciona una carpeta con SVGs.')
      return
    }

    const expectedToGroup = excel.expected_filename_to_group || {}
    const groupByCode = new Map(excel.groups.map(g => [g.similarity_code, g] as const))

    // Invert expected_filename_to_group so a similarity_code can accept multiple expected filenames
    // (useful when user intentionally merges multiple rows under the same similarity_code).
    const expectedBasesBySim = new Map<string, string[]>()
    for (const [expectedBaseNorm, sim] of Object.entries(expectedToGroup)) {
      const code = String(sim || '').trim()
      if (!code) continue
      const list = expectedBasesBySim.get(code) || []
      list.push(String(expectedBaseNorm || '').trim())
      expectedBasesBySim.set(code, list)
    }

    // Map expected base name => occurrences in folder
    const matchedByExpected = new Map<string, WizardItem[]>()
    const previewItems: WizardItem[] = []

    for (const f of selectedFiles) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const { base, ext } = stripExtension(f.name)
      const normBase = normalizeText(base)
      const sim = expectedToGroup[normBase]
      if (!sim) {
        // ignore but count as no-match items (we show them so user knows why it's being ignored)
        previewItems.push({
          id: rel,
          relative_path: rel,
          base_name: base,
          ext,
          similarity_code: '',
          expected_svg_filename: '',
          match_status: 'NO_MATCH_EXPECTED_NAME',
          target_reference_ids: [],
          target_reference_labels: {},
        })
        continue
      }
      const group = groupByCode.get(sim)
      if (!group) continue
      const it: WizardItem = {
        id: rel,
        relative_path: rel,
        base_name: base,
        ext,
        similarity_code: sim,
        expected_svg_filename: group.expected_svg_filename,
        match_status: 'OK',
        target_reference_ids: group.reference_ids.slice(),
        target_reference_labels: group.reference_labels || {},
      }
      const list = matchedByExpected.get(normBase) || []
      list.push(it)
      matchedByExpected.set(normBase, list)
      previewItems.push(it)
    }

    // Mark duplicates: if 2 files share same expected base name, require user to keep 1.
    for (const [, list] of matchedByExpected.entries()) {
      if (list.length <= 1) continue
      for (const it of list) {
        it.match_status = 'DUPLICATE_EXPECTED_NAME'
      }
    }

    const missing: string[] = []
    for (const g of excel.groups) {
      const sim = String(g.similarity_code || '').trim()
      const expectedBases =
        (sim && expectedBasesBySim.get(sim)?.filter(Boolean)) ||
        [normalizeText(String(g.expected_svg_filename || '').replace(/\.svg$/i, ''))]

      const hasAny = expectedBases.some(b => matchedByExpected.has(normalizeText(b)))
      if (!hasAny) missing.push(`${g.similarity_code} (${g.expected_svg_filename})`)
    }

    setItems(previewItems)
    setMissingGroups(missing)
    setTargetSelectionByItemId(() => {
      const next: Record<string, string[]> = {}
      for (const it of previewItems) {
        if (it.match_status !== 'OK') continue
        next[it.id] = it.target_reference_ids.slice()
      }
      return next
    })

    const ok = previewItems.filter(i => i.match_status === 'OK').length
    const ignored = previewItems.filter(i => i.match_status === 'NO_MATCH_EXPECTED_NAME').length
    const dup = previewItems.filter(i => i.match_status === 'DUPLICATE_EXPECTED_NAME').length
    toast.success(`Preview: OK=${ok} · ignorados=${ignored} · duplicados=${dup} · faltan grupos=${missing.length}`)
  }

  const toggleRefTarget = (itemId: string, refId: string) => {
    setTargetSelectionByItemId(prev => {
      const current = prev[itemId] || []
      const exists = current.includes(refId)
      const next = exists ? current.filter(x => x !== refId) : [...current, refId]
      return { ...prev, [itemId]: next }
    })
  }

  const apply = async () => {
    if (!excel) return
    const okItems = items.filter(it => it.match_status === 'OK')
    if (okItems.length === 0) {
      toast.error('No hay archivos OK para aplicar.')
      return
    }
    const duplicates = items.filter(it => it.match_status === 'DUPLICATE_EXPECTED_NAME')
    if (duplicates.length > 0) {
      toast.error('Hay duplicados por nombre esperado. Deja solo un SVG por nombre esperado.')
      return
    }
    for (const it of okItems) {
      const selected = targetSelectionByItemId[it.id] || []
      if (selected.length === 0) {
        toast.error(`No hay referencias seleccionadas para: ${it.relative_path}`)
        return
      }
    }

    setIsApplying(true)
    setProgress({ phase: 'hash', current: 0, total: okItems.length })
    try {
      const itemToHash: Array<{ item: WizardItem; sha256: string; ext: string; contentType: string; file: File }> = []
      for (let i = 0; i < okItems.length; i++) {
        const it = okItems[i]
        const file = fileByRelativePath.get(it.relative_path)
        if (!file) throw new Error(`No se encontró el archivo local para: ${it.relative_path}`)
        const bytes = await file.arrayBuffer()
        const sha = await sha256Hex(bytes)
        const ext = it.ext || '.svg'
        itemToHash.push({ item: it, sha256: sha, ext, contentType: file.type || 'application/octet-stream', file })
        setProgress({ phase: 'hash', current: i + 1, total: okItems.length })
      }

      setProgress({ phase: 'prepare_uploads', current: 0, total: 1 })
      const resPrep = await fetch('/api/isometrics/mass-import/prepare-uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: itemToHash.map(i => ({ sha256: i.sha256, ext: i.ext, content_type: i.contentType })),
        }),
      })
      const prep = await resPrep.json().catch(() => null)
      if (!resPrep.ok || !prep?.success) throw new Error(prep?.error || 'Prepare uploads failed')
      const tokenByStoragePath = new Map<string, { token: string }>()
      for (const u of prep.uploads || []) tokenByStoragePath.set(String(u.storage_path), { token: String(u.token) })

      const uploaded = new Set<string>()
      setProgress({ phase: 'upload', current: 0, total: itemToHash.length })
      for (let i = 0; i < itemToHash.length; i++) {
        const x = itemToHash[i]
        const storagePath = `assets/isometrics/${x.sha256}${x.ext && x.ext.startsWith('.') ? x.ext : '.svg'}`
        const tok = tokenByStoragePath.get(storagePath)?.token
        if (!tok) throw new Error(`No token for ${storagePath}`)
        if (!uploaded.has(storagePath)) {
          const { error } = await supabase.storage.from('assets').uploadToSignedUrl(storagePath, tok, x.file, { contentType: x.contentType })
          if (error) throw new Error(`Upload failed (${storagePath}): ${error.message}`)
          uploaded.add(storagePath)
        }
        setProgress({ phase: 'upload', current: i + 1, total: itemToHash.length })
      }

      // Apply in chunks
      const chunkSize = 25
      setProgress({ phase: 'apply', current: 0, total: itemToHash.length })
      for (let offset = 0; offset < itemToHash.length; offset += chunkSize) {
        const chunk = itemToHash.slice(offset, offset + chunkSize)
        const resApply = await fetch('/api/isometrics/mass-import/apply-chunk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            overwriteExisting: true,
            items: chunk.map(c => ({
              relative_path: c.item.relative_path,
              target_granularity: 'reference',
              target_reference_ids: targetSelectionByItemId[c.item.id] || c.item.target_reference_ids,
              target_version_ids: [],
              sha256: c.sha256,
              ext: c.ext,
            })),
          }),
        })
        const aj = await resApply.json().catch(() => null)
        if (!resApply.ok || !aj?.success) throw new Error(aj?.error || 'Apply failed')
        setProgress({ phase: 'apply', current: Math.min(offset + chunk.length, itemToHash.length), total: itemToHash.length })
      }

      toast.success('Asociación completada.')
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setIsApplying(false)
      setProgress(null)
    }
  }

  const orphanCount = orphans.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: 'outline', className: 'gap-2 border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm transition-all h-10 px-4' }))}
      >
        <PackageSearch className="h-4 w-4" />
        Productos huérfanos
      </DialogTrigger>
      <DialogContent className="sm:max-w-[70vw] w-full p-0 bg-white border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-slate-700" />
            Productos huérfanos (sin isométrico y sin sugerencia usable)
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Descarga un Excel con nombres esperados + grupos S#. Luego sube el Excel y asocia por carpeta (100% determinístico).
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-2 space-y-4 overflow-y-auto flex-1">
          {step === 'list' && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-slate-100 text-slate-700 border border-slate-200">Huérfanos: {loading ? '…' : orphanCount}</Badge>
                {lastLoadedAt && <div className="text-xs text-muted-foreground">Actualizado: {lastLoadedAt.toLocaleString()}</div>}
                <div className="flex-1" />
                <Button variant="outline" onClick={loadOrphans} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Refrescar
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={downloadExcel} disabled={loading || orphanCount === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar referencias
                </Button>
                <Button variant="destructive" onClick={inactivateSelected} disabled={loading || selectedOrphanCount === 0}>
                  Inactivar ({selectedOrphanCount})
                </Button>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.xls"
                    onChange={e => onUploadExcel(e.currentTarget.files?.[0] || null)}
                    className="hidden"
                    id="orphans-excel-upload"
                  />
                  <label htmlFor="orphans-excel-upload" className={cn(buttonVariants({ variant: 'outline' }), 'gap-2 cursor-pointer')}>
                    {parsingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                    Asociación masiva (subir Excel)
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <input
                          type="checkbox"
                          checked={orphans.length > 0 && selectedOrphanCount === orphans.length}
                          onChange={e => setAllOrphansSelected(e.currentTarget.checked)}
                          aria-label="Seleccionar todo"
                        />
                      </TableHead>
                      <TableHead>Familia</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Designación</TableHead>
                      <TableHead>Medida</TableHead>
                      <TableHead>Accesorio</TableHead>
                      <TableHead>Special</TableHead>
                      <TableHead>Línea</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : orphans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          No hay huérfanos.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orphans.slice(0, 500).map(o => (
                        <TableRow key={o.reference_id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedOrphanIds[o.reference_id])}
                              onChange={() => toggleOrphanSelected(o.reference_id)}
                              aria-label={`Seleccionar ${o.family_code || ''} ${o.reference_code || ''}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{o.family_code || 'NA'}</TableCell>
                          <TableCell className="font-mono text-xs">{o.reference_code || 'NA'}</TableCell>
                          <TableCell className="max-w-[420px] whitespace-normal break-words">
                            <div className="font-medium">{o.sample_final_name_es || o.product_name || 'Sin nombre'}</div>
                            {o.sample_sku_complete && <div className="text-xs text-muted-foreground font-mono">{o.sample_sku_complete}</div>}
                          </TableCell>
                          <TableCell className="text-xs">{o.designation || 'NA'}</TableCell>
                          <TableCell className="text-xs">{o.commercial_measure || 'NA'}</TableCell>
                          <TableCell className="text-xs">{o.accessory_text || 'NA'}</TableCell>
                          <TableCell className="text-xs">{o.special_label || 'NA'}</TableCell>
                          <TableCell className="text-xs">{o.line || 'NA'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {orphans.length > 500 && <div className="text-xs text-muted-foreground">Mostrando 500 de {orphans.length} filas.</div>}
            </>
          )}

          {step === 'associate' && (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Modo determinístico por Excel (solo asocia nombres esperados)
                </div>
                {excel?.warnings?.length ? <div className="text-xs text-amber-800">Warnings del Excel: {excel.warnings.length}</div> : null}
              </div>

              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Carpeta con SVGs</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  {...directoryInputProps}
                  onClick={e => {
                    ;(e.currentTarget as HTMLInputElement).value = ''
                  }}
                  onChange={e => onPickFolder(e.target.files)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="text-xs text-muted-foreground">Ignorados .ai: {ignoredAiCount}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={buildPreview} disabled={!excel || selectedFiles.length === 0}>
                  <Upload className="h-4 w-4 mr-2" />
                  Preview (dry-run)
                </Button>
                <Button onClick={apply} disabled={isApplying || items.filter(i => i.match_status === 'OK').length === 0}>
                  {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Aplicar
                </Button>
                {progress && (
                  <div className="text-xs text-muted-foreground">
                    {progress.phase}: {progress.current}/{progress.total}
                  </div>
                )}
              </div>

              {missingGroups.length > 0 && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
                  <div className="text-sm font-medium text-rose-900">Faltan SVGs para {missingGroups.length} grupos</div>
                  <div className="mt-1 text-xs text-rose-800 whitespace-normal break-words">{missingGroups.slice(0, 10).join(' · ')}{missingGroups.length > 10 ? ' …' : ''}</div>
                </div>
              )}

              {items.length > 0 && (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead>Archivo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Targets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.slice(0, 500).map(it => (
                        <TableRow key={it.id}>
                          <TableCell className="max-w-[520px] whitespace-normal break-words">{it.relative_path}</TableCell>
                          <TableCell>
                            {it.match_status === 'OK' && <Badge className="bg-emerald-600">OK</Badge>}
                            {it.match_status === 'NO_MATCH_EXPECTED_NAME' && <Badge variant="outline">IGNORED</Badge>}
                            {it.match_status === 'DUPLICATE_EXPECTED_NAME' && <Badge className="bg-amber-600">DUP</Badge>}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{it.similarity_code || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {it.match_status !== 'OK' ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <details>
                                <summary className="cursor-pointer text-muted-foreground">
                                  refs={(targetSelectionByItemId[it.id] || it.target_reference_ids).length} · {it.expected_svg_filename}
                                </summary>
                                <div className="mt-2 space-y-1">
                                  {it.target_reference_ids.map(refId => {
                                    const selected = targetSelectionByItemId[it.id] || it.target_reference_ids
                                    const checked = selected.includes(refId)
                                    const label = it.target_reference_labels?.[refId] || refId
                                    return (
                                      <label key={refId} className="flex items-start gap-2 text-muted-foreground">
                                        <input type="checkbox" checked={checked} onChange={() => toggleRefTarget(it.id, refId)} />
                                        <span className="whitespace-normal break-words">{label}</span>
                                      </label>
                                    )
                                  })}
                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => setTargetSelectionByItemId(prev => ({ ...prev, [it.id]: it.target_reference_ids.slice() }))}
                                    >
                                      Seleccionar todo
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => setTargetSelectionByItemId(prev => ({ ...prev, [it.id]: [] }))}
                                    >
                                      Limpiar
                                    </Button>
                                  </div>
                                </div>
                              </details>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="p-6 pt-0 shrink-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          {step === 'associate' && (
            <Button variant="outline" onClick={() => setStep('list')} disabled={isApplying}>
              Volver
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
