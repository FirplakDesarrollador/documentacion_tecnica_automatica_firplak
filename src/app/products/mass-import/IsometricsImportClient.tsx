'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { directoryInputProps } from '@/lib/ui/directoryInputProps'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'
import type { FamilyFilterOption } from '@/lib/data/filters'
import { createClient } from '@/utils/supabase/client'

type PreviewItem = {
  item_id: string
  relative_path: string
  base_name: string
  ext: string
  parsed: unknown | null
  match_status: string
  match_mode: string | null
  target_granularity: 'reference' | 'version'
  target_reference_ids: string[]
  target_version_ids: string[]
  target_reference_summaries?: Array<{
    id: string
    family_code: string | null
    reference_code: string | null
    designation: string | null
    product_name: string | null
    commercial_measure: string | null
    line: string | null
    special_label: string | null
    accessory_text: string | null
  }>
  target_version_summaries?: Array<{
    id: string
    reference_id: string
    version_code: string
    accessory_text: string | null
    reference_code: string | null
    family_code: string | null
    designation: string | null
    product_name: string | null
    commercial_measure: string | null
    line: string | null
    special_label: string | null
  }>
  conflict_group_code: string | null
  conflict_target_ids: string[]
  conflict_target_reference_summaries?: Array<{ id: string; reference_code: string | null; family_code: string | null; product_name: string | null }>
  conflict_target_version_summaries?: Array<{ id: string; version_code: string; reference_code: string | null; family_code: string | null; product_name: string | null }>
  notes: string | null
}

type PreviewResponse = {
  success: boolean
  job: {
    id: string | null
    mode: 'stateful' | 'stateless'
    total: number
    ignored: number
    matchOk: number
    noMatch: number
    ambiguous: number
    conflicts: number
  }
  items: PreviewItem[]
  error?: string
}

type JobResponse = {
  success: boolean
  job?: {
    id?: string | null
  }
  items?: unknown[]
  error?: string
}

type JobPreviewItemRaw = {
  id?: unknown
  item_id?: unknown
  relative_path?: unknown
  base_name?: unknown
  ext?: unknown
  parsed?: unknown
  match_status?: unknown
  target_version_ids?: unknown
  target_reference_ids?: unknown
  conflict_group_code?: unknown
  target_reference_summaries?: unknown
  target_version_summaries?: unknown
  conflict_target_reference_summaries?: unknown
  conflict_target_version_summaries?: unknown
  notes?: unknown
  selected?: unknown
}

function stripExtension(fileName: string) {
  const idx = fileName.lastIndexOf('.')
  if (idx > 0) return { base: fileName.slice(0, idx), ext: fileName.slice(idx).toLowerCase() }
  return { base: fileName, ext: '' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function getRelativePath(file: File) {
  const withRelativePath = file as File & { webkitRelativePath?: string }
  return withRelativePath.webkitRelativePath ? String(withRelativePath.webkitRelativePath) : file.name
}

function toPreviewTargetSelection(item: Pick<PreviewItem, 'item_id' | 'target_reference_ids' | 'target_version_ids'>) {
  return {
    [item.item_id]: {
      refIds: asStringArray(item.target_reference_ids),
      verIds: asStringArray(item.target_version_ids),
    },
  }
}

function toPreviewItemFromJob(raw: unknown): PreviewItem | null {
  if (!isRecord(raw)) return null
  const item = raw as JobPreviewItemRaw
  const itemId = item.id ?? item.item_id
  if (itemId === undefined || itemId === null) return null

  return {
    item_id: String(itemId),
    relative_path: String(item.relative_path || ''),
    base_name: String(item.base_name || ''),
    ext: String(item.ext || ''),
    parsed: item.parsed ?? null,
    match_status: String(item.match_status || ''),
    match_mode: null,
    target_granularity: asStringArray(item.target_version_ids).length > 0 ? 'version' : 'reference',
    target_reference_ids: asStringArray(item.target_reference_ids),
    target_version_ids: asStringArray(item.target_version_ids),
    conflict_group_code: item.conflict_group_code ? String(item.conflict_group_code) : null,
    conflict_target_ids: [],
    target_reference_summaries: Array.isArray(item.target_reference_summaries) ? (item.target_reference_summaries as PreviewItem['target_reference_summaries']) : undefined,
    target_version_summaries: Array.isArray(item.target_version_summaries) ? (item.target_version_summaries as PreviewItem['target_version_summaries']) : undefined,
    conflict_target_reference_summaries: Array.isArray(item.conflict_target_reference_summaries)
      ? (item.conflict_target_reference_summaries as PreviewItem['conflict_target_reference_summaries'])
      : undefined,
    conflict_target_version_summaries: Array.isArray(item.conflict_target_version_summaries)
      ? (item.conflict_target_version_summaries as PreviewItem['conflict_target_version_summaries'])
      : undefined,
    notes: item.notes ? String(item.notes) : null,
  }
}

function isAiFilename(fileName: string) {
  return String(fileName || '').trim().toLowerCase().endsWith('.ai')
}

async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function toCsv(items: PreviewItem[]) {
  const headers = [
    'relative_path',
    'base_name',
    'ext',
    'match_status',
    'match_mode',
    'target_granularity',
    'target_reference_ids',
    'target_version_ids',
    'target_refs_human',
    'target_versions_human',
    'conflict_group_code',
    'notes',
  ]
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const it of items) {
      lines.push(
        [
          esc(it.relative_path),
          esc(it.base_name),
          esc(it.ext),
          esc(it.match_status),
          esc(it.match_mode || ''),
          esc(it.target_granularity),
          esc((it.target_reference_ids || []).join('|')),
          esc((it.target_version_ids || []).join('|')),
          esc(
            (it.target_reference_summaries || [])
              .map(r => `${r.family_code || ''}-${r.reference_code || ''}:${r.designation || ''}:${r.product_name || ''}:${r.commercial_measure || ''}`)
              .join('|')
          ),
          esc(
            (it.target_version_summaries || [])
              .map(v => `${v.family_code || ''}-${v.reference_code || ''}:${v.version_code}:${v.product_name || ''}:${v.commercial_measure || ''}`)
              .join('|')
          ),
          esc(it.conflict_group_code || ''),
          esc(it.notes || ''),
        ].join(',')
      )
    }
  return lines.join('\n')
}

function formatRefSummary(r: NonNullable<PreviewItem['target_reference_summaries']>[number]) {
  const code = [r.family_code, r.reference_code].filter(Boolean).join('-')
  const name = [r.designation, r.product_name, r.commercial_measure].filter(v => v && v !== 'NA').join(' ')
  const extra = [r.line, r.special_label, r.accessory_text].filter(v => v && v !== 'NA').join(' · ')
  return `${code}${name ? ` · ${name}` : ''}${extra ? ` · ${extra}` : ''}`
}

function formatVersionSummary(v: NonNullable<PreviewItem['target_version_summaries']>[number]) {
  const code = [v.family_code, v.reference_code].filter(Boolean).join('-')
  const name = [v.designation, v.product_name, v.commercial_measure].filter(x => x && x !== 'NA').join(' ')
  const extra = [v.version_code, v.line, v.special_label, v.accessory_text].filter(x => x && x !== 'NA').join(' · ')
  return `${code}${name ? ` · ${name}` : ''}${extra ? ` · ${extra}` : ''}`
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

export function IsometricsImportClient(props: { families: FamilyFilterOption[] }) {
  const supabase = createClient()
  const { families } = props
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileByRelativePath, setFileByRelativePath] = useState<Map<string, File>>(new Map())
  const [ignoredAiCount, setIgnoredAiCount] = useState(0)

  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([])
  const [ignoreKeywordsCsv, setIgnoreKeywordsCsv] = useState('')
  const [overwriteExisting, setOverwriteExisting] = useState(true)
  const [includeLineInMatch, setIncludeLineInMatch] = useState(true)
  const [includeSpecialLabelInMatch, setIncludeSpecialLabelInMatch] = useState(true)

  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null)

  const [jobId, setJobId] = useState<string | null>(null)
  const [, setJobMode] = useState<'stateful' | 'stateless'>('stateful')
  const [resumeJobId, setResumeJobId] = useState('')
  const [items, setItems] = useState<PreviewItem[]>([])
  const [targetSelectionByItemId, setTargetSelectionByItemId] = useState<Record<string, { refIds: string[]; verIds: string[] }>>({})

  const conflictGroups = useMemo(() => {
    const groups = new Map<string, PreviewItem[]>()
    for (const it of items) {
      if (!it.conflict_group_code) continue
      const list = groups.get(it.conflict_group_code) || []
      list.push(it)
      groups.set(it.conflict_group_code, list)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const [conflictSelection, setConflictSelection] = useState<Record<string, string>>({})
  const hasUnresolvedConflicts = useMemo(() => {
    if (conflictGroups.length === 0) return false
    return conflictGroups.some(([code]) => !conflictSelection[code])
  }, [conflictGroups, conflictSelection])

  const summary = useMemo(() => {
    const s = {
      total: items.length,
      ignored: 0,
      matchOk: 0,
      noMatch: 0,
      ambiguous: 0,
      conflicts: 0,
    }
    for (const it of items) {
      if (it.match_status.startsWith('IGNORED')) s.ignored++
      else if (it.match_status.startsWith('MATCH_OK')) s.matchOk++
      else if (it.match_status === 'NO_MATCH' || it.match_status === 'PARSE_FAILED') s.noMatch++
      else if (it.match_status === 'AMBIGUOUS') s.ambiguous++
      else if (it.match_status === 'CONFLICT_REF') s.conflicts++
    }
    return s
  }, [items])

  const onPickFolder = (files: FileList | null) => {
    const rawList = Array.from(files || [])
    const aiFiles = rawList.filter(f => isAiFilename(f.name)).length
    const list = rawList.filter(f => !isAiFilename(f.name))
    setSelectedFiles(list)
    setIgnoredAiCount(aiFiles)
    const m = new Map<string, File>()
    for (const f of list) {
      const rel = getRelativePath(f)
      m.set(rel, f)
    }
    setFileByRelativePath(m)
    setJobId(null)
    setItems([])
    setTargetSelectionByItemId({})
    setConflictSelection({})
    setProgress(null)
    setResumeJobId('')
  }

  const preview = async () => {
    if (selectedFiles.length === 0) return
    if (selectedFamilies.length === 0) {
      toast.error('Selecciona al menos 1 familia para hacer el match (así se usa el diccionario real de Supabase para esa familia).')
      return
    }
    setIsPreviewing(true)
    setJobId(null)
    setItems([])
    setConflictSelection({})
    try {
      // Defense-in-depth: never send .ai files to the server.
      const effectiveFiles = selectedFiles.filter(f => !isAiFilename(f.name))
      const filesPayload = effectiveFiles.map(f => {
        const rel = getRelativePath(f)
        const { base, ext } = stripExtension(f.name)
        return { relative_path: rel, base_name: base, ext }
      })

      const res = await fetch('/api/isometrics/mass-import/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: filesPayload,
          options: {
            familyCodes: selectedFamilies,
            overwriteExisting,
            ignoreAi: true,
            treatExtensionlessAsSvg: true,
            includeLineInMatch,
            includeSpecialLabelInMatch,
            ignoreKeywordsCsv,
          },
        }),
      })
      const j = (await res.json().catch(() => null)) as PreviewResponse | null
      if (!res.ok || !j?.success) throw new Error(j?.error || 'Preview failed')
      setJobId(j.job.id || null)
      setJobMode(j.job.mode || 'stateless')
      setItems(j.items || [])
      setTargetSelectionByItemId(() => {
        const next: Record<string, { refIds: string[]; verIds: string[] }> = {}
        for (const it of j.items || []) {
          if (!isRecord(it) || !it.item_id) continue
          Object.assign(next, toPreviewTargetSelection({
            item_id: String(it.item_id),
            target_reference_ids: asStringArray(it.target_reference_ids),
            target_version_ids: asStringArray(it.target_version_ids),
          }))
        }
        return next
      })
      if ((j.job.conflicts || 0) > 0) toast.error(`Preview con conflictos: ${j.job.conflicts}. Debes elegir 1 archivo por grupo.`)
      else if ((j.job.ambiguous || 0) > 0) toast.error(`Preview con ambiguos: ${j.job.ambiguous}.`)
      else toast.success(`Preview OK (${j.job.total} archivos).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || 'Preview failed')
    } finally {
      setIsPreviewing(false)
    }
  }

  const resumeJob = async () => {
    const id = resumeJobId.trim()
    if (!id) return
    try {
      const res = await fetch(`/api/isometrics/mass-import/job?id=${encodeURIComponent(id)}`)
      const j = (await res.json().catch(() => null)) as JobResponse | null
      if (!res.ok || !j?.success) throw new Error(j?.error || 'No se pudo cargar el job')
      setJobId(String(j.job?.id || id))
      const loadedItems = Array.isArray(j.items) ? j.items : []
      const mapped = loadedItems.map(toPreviewItemFromJob).filter((item): item is PreviewItem => item !== null)
      setIgnoredAiCount(mapped.filter(it => it.match_status === 'IGNORED_AI').length)
      // Hide .ai items entirely (no mention in listing).
      setItems(mapped.filter(it => it.match_status !== 'IGNORED_AI'))
      setTargetSelectionByItemId(() => {
        const next: Record<string, { refIds: string[]; verIds: string[] }> = {}
        for (const it of mapped) {
          Object.assign(next, toPreviewTargetSelection(it))
        }
        return next
      })
      // Restore conflict selection from DB
      const sel: Record<string, string> = {}
      for (const it of loadedItems) {
        if (!isRecord(it)) continue
        if (it.conflict_group_code && it.selected && it.id) sel[String(it.conflict_group_code)] = String(it.id)
      }
      setConflictSelection(sel)
      toast.success('Job cargado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || 'No se pudo cargar el job')
    }
  }

  const downloadCsv = () => {
    const csv = toCsv(items)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bulk_isometrics_preview_${jobId || 'job'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const resolveConflicts = async () => {
    if (conflictGroups.length === 0) return
    // Ensure all groups have a selection
    for (const [groupCode] of conflictGroups) {
      if (!conflictSelection[groupCode]) {
        toast.error(`Falta seleccionar ganador para ${groupCode}.`)
        return
      }
    }
    setIsResolving(true)
    try {
      if (jobId) {
        const res = await fetch('/api/isometrics/mass-import/resolve-conflicts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, selections: conflictSelection }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.success) throw new Error(j?.error || 'Resolve failed')
      }

      // Always reflect the conflict resolution immediately in UI (also for stateless mode).
      const selections = { ...conflictSelection }
      setItems(prev =>
        prev.map(it => {
          const g = it.conflict_group_code
          if (!g) return it
          const winner = selections[g]
          if (!winner) return it
          const base = {
            ...it,
            conflict_group_code: null,
            conflict_target_ids: [],
            conflict_target_reference_summaries: [],
            conflict_target_version_summaries: [],
          }
          if (it.item_id === winner) {
            const resolvedStatus = it.target_granularity === 'version' ? 'MATCH_OK_VERSION_OVERRIDE' : 'MATCH_OK_REFERENCE'
            return {
              ...base,
              match_status: resolvedStatus,
              notes: it.notes ? `${it.notes}|conflict_resolved` : 'conflict_resolved',
            }
          }
          return {
            ...base,
            match_status: 'IGNORED_CONFLICT_LOSER',
            notes: it.notes ? `${it.notes}|conflict_loser_${g}` : `conflict_loser_${g}`,
          }
        })
      )
      setTargetSelectionByItemId(prev => {
        const next = { ...prev }
        for (const [groupCode, winnerId] of Object.entries(selections)) {
          for (const it of items) {
            if (it.conflict_group_code !== groupCode) continue
            if (it.item_id === winnerId) continue
            delete next[it.item_id]
          }
        }
        return next
      })

      toast.success(jobId ? 'Conflictos resueltos y guardados.' : 'Conflictos resueltos (local).')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || 'Resolve failed')
    } finally {
      setIsResolving(false)
    }
  }

  const confirmWidthOnlyAmbiguous = (itemId: string) => {
    setItems(prev =>
      prev.map(it => {
        if (it.item_id !== itemId) return it
        if (it.match_status !== 'AMBIGUOUS') return it
        if (!String(it.notes || '').includes('width_only_measure')) return it
        return {
          ...it,
          match_status: it.target_granularity === 'version' ? 'MATCH_OK_VERSION_OVERRIDE' : 'MATCH_OK_REFERENCE',
          notes: it.notes ? `${it.notes}|confirmed_width_only_measure` : 'confirmed_width_only_measure',
        }
      })
    )
  }

  const toggleTarget = (itemId: string, kind: 'ref' | 'ver', targetId: string) => {
    setTargetSelectionByItemId(prev => {
      const current = prev[itemId] || { refIds: [], verIds: [] }
      const list = kind === 'ref' ? current.refIds : current.verIds
      const exists = list.includes(targetId)
      const nextList = exists ? list.filter(id => id !== targetId) : [...list, targetId]
      return {
        ...prev,
        [itemId]: kind === 'ref' ? { ...current, refIds: nextList } : { ...current, verIds: nextList },
      }
    })
  }

  const apply = async () => {
    // Stateless mode is allowed: we can apply with the preview payload (targets) even if job tables don't exist.
    const eligible = items.filter(it => {
      if (it.match_status.startsWith('MATCH_OK')) return true
      if (it.match_status === 'CONFLICT_REF') {
        const g = it.conflict_group_code
        return Boolean(g && conflictSelection[g] === it.item_id)
      }
      return false
    })
    if (eligible.length === 0) {
      toast.error('No hay items aplicables (MATCH_OK o conflictos resueltos).')
      return
    }

    // If there are conflicts, enforce resolution first.
    if (conflictGroups.length > 0) {
      for (const [groupCode] of conflictGroups) {
        if (!conflictSelection[groupCode]) {
          toast.error(`Debes resolver ${groupCode} antes de aplicar.`)
          return
        }
      }
    }

    for (const it of eligible) {
      const sel = targetSelectionByItemId[it.item_id] || { refIds: it.target_reference_ids || [], verIds: it.target_version_ids || [] }
      if (it.target_granularity === 'version' && (!sel.verIds || sel.verIds.length === 0)) {
        toast.error(`No hay versiones seleccionadas para: ${it.relative_path}`)
        return
      }
      if (it.target_granularity === 'reference' && (!sel.refIds || sel.refIds.length === 0)) {
        toast.error(`No hay referencias seleccionadas para: ${it.relative_path}`)
        return
      }
    }

    setIsApplying(true)
    setProgress({ phase: 'hash', current: 0, total: eligible.length })
    try {
      const itemToHash: Array<{ item: PreviewItem; sha256: string; ext: string; contentType: string; file: File }> = []
      for (let i = 0; i < eligible.length; i++) {
        const it = eligible[i]
        const file = fileByRelativePath.get(it.relative_path)
        if (!file) throw new Error(`No se encontró el archivo local para: ${it.relative_path}`)
        const bytes = await file.arrayBuffer()
        const sha = await sha256Hex(bytes)
        const ext = it.ext || '.svg'
        itemToHash.push({ item: it, sha256: sha, ext, contentType: file.type || 'application/octet-stream', file })
        setProgress({ phase: 'hash', current: i + 1, total: eligible.length })
      }

      // Prepare signed uploads (dedup by sha256/ext)
      setProgress({ phase: 'prepare_uploads', current: 0, total: 1 })
      const resPrep = await fetch('/api/isometrics/mass-import/prepare-uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId || undefined,
          files: itemToHash.map(i => ({ sha256: i.sha256, ext: i.ext, content_type: i.contentType })),
        }),
      })
      const prep = await resPrep.json().catch(() => null)
      if (!resPrep.ok || !prep?.success) throw new Error(prep?.error || 'Prepare uploads failed')
      const tokenByStoragePath = new Map<string, { token: string }>()
      for (const u of prep.uploads || []) tokenByStoragePath.set(String(u.storage_path), { token: String(u.token) })

      // Upload (dedup)
      const uploaded = new Set<string>()
      setProgress({ phase: 'upload', current: 0, total: itemToHash.length })
      for (let i = 0; i < itemToHash.length; i++) {
        const x = itemToHash[i]
        const storagePath = `assets/isometrics/${x.sha256}${x.ext && x.ext.startsWith('.') ? x.ext : '.svg'}`
        const tok = tokenByStoragePath.get(storagePath)?.token
        if (!tok) throw new Error(`No token for ${storagePath}`)
        if (!uploaded.has(storagePath)) {
          const { error } = await supabase.storage.from('assets').uploadToSignedUrl(storagePath, tok, x.file, {
            contentType: x.contentType,
          })
          if (error) throw new Error(`Upload failed (${storagePath}): ${error.message}`)
          uploaded.add(storagePath)
        }
        setProgress({ phase: 'upload', current: i + 1, total: itemToHash.length })
      }

      // Apply in chunks (default 25)
      const chunkSize = 25
      setProgress({ phase: 'apply', current: 0, total: itemToHash.length })
      for (let offset = 0; offset < itemToHash.length; offset += chunkSize) {
        const chunk = itemToHash.slice(offset, offset + chunkSize)
        const resApply = await fetch('/api/isometrics/mass-import/apply-chunk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId || undefined,
            overwriteExisting,
            items: chunk.map(c => {
              const sel = targetSelectionByItemId[c.item.item_id] || { refIds: c.item.target_reference_ids || [], verIds: c.item.target_version_ids || [] }
              return {
                item_id: jobId ? c.item.item_id : undefined,
                relative_path: c.item.relative_path,
                target_granularity: c.item.target_granularity,
                target_reference_ids: sel.refIds,
                target_version_ids: sel.verIds,
                conflict_group_code: c.item.conflict_group_code,
                sha256: c.sha256,
                ext: c.ext,
              }
            }),
          }),
        })
        const aj = await resApply.json().catch(() => null)
        if (!resApply.ok || !aj?.success) throw new Error(aj?.error || 'Apply failed')
        setProgress({ phase: 'apply', current: Math.min(offset + chunk.length, itemToHash.length), total: itemToHash.length })
      }

      toast.success('Aplicación completada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e) || 'Apply failed')
    } finally {
      setIsApplying(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Importación Masiva de Isométricos
          </CardTitle>
          <CardDescription>
            Selecciona una carpeta de isométricos. El sistema hará match por nombre y permitirá aplicar en lote (un solo SVG puede asociarse a múltiples
            referencias/versiones).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Familias (requerido)</div>
              <MultiSelectSearchField
                options={families}
                values={selectedFamilies}
                onChange={setSelectedFamilies}
                placeholder="Seleccionar familias..."
                className="h-11"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Ignore keywords (CSV, opcional)</div>
              <Textarea
                value={ignoreKeywordsCsv}
                onChange={e => setIgnoreKeywordsCsv(e.target.value)}
                placeholder="Ej: exhibidor, exhibicion"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overwriteExisting} onChange={e => setOverwriteExisting(e.target.checked)} />
                Overwrite existente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeLineInMatch} onChange={e => setIncludeLineInMatch(e.target.checked)} />
                Incluir línea (CLASS/LIFE/ESSENTIAL/PRO)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSpecialLabelInMatch}
                  onChange={e => setIncludeSpecialLabelInMatch(e.target.checked)}
                />
                Incluir special_label (ej: puerta shaker)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground">Reanudar Job (opcional)</div>
              <input
                type="text"
                value={resumeJobId}
                onChange={e => setResumeJobId(e.target.value)}
                placeholder="Pega aquí el Job ID..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={resumeJob} disabled={!resumeJobId.trim()}>
                Cargar Job
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={preview} disabled={selectedFiles.length === 0 || isPreviewing}>
              {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
              Preview (dry-run)
            </Button>
            <Button variant="outline" onClick={downloadCsv} disabled={!items.length}>
              <Download className="w-4 h-4 mr-2" />
              Descargar CSV
            </Button>
            <Button onClick={apply} disabled={items.length === 0 || isApplying || isPreviewing || hasUnresolvedConflicts}>
              {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Aplicar
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Modo: <b>{jobId ? 'stateful (con Job en BD)' : 'stateless (sin tablas de Job)'}</b>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {progress.phase}: {progress.current}/{progress.total}
              </div>
              <Progress value={progress.total ? (progress.current / progress.total) * 100 : 0} />
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Preview no sube archivos. Apply usa dedupe por SHA256 (un solo upload por archivo idéntico) y asocia el asset a múltiples targets.
        </CardFooter>
      </Card>

      {items.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Resultado Preview</CardTitle>
            <CardDescription>
              Total: {summary.total} · Ignorados .ai: {ignoredAiCount} · Ignorados (otros): {summary.ignored} · OK: {summary.matchOk} · No match:{' '}
              {summary.noMatch} · Ambiguos: {summary.ambiguous} · Conflictos: {summary.conflicts}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {conflictGroups.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                <div className="text-sm font-medium text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Conflictos detectados (elige 1 ganador por grupo)
                </div>
                {conflictGroups.map(([groupCode, groupItems]) => (
                  <div key={groupCode} className="bg-white/80 rounded-md border border-amber-100 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{groupCode}</div>
                      <Badge variant="outline">{groupItems.length} archivos</Badge>
                    </div>
                    <div className="space-y-1">
                      {groupItems.map(it => (
                        <label key={it.item_id} className="flex items-start gap-2 text-sm">
                          <input
                            type="radio"
                            name={`conflict-${groupCode}`}
                            checked={conflictSelection[groupCode] === it.item_id}
                            onChange={() => setConflictSelection(prev => ({ ...prev, [groupCode]: it.item_id }))}
                          />
                          <span className="flex-1">
                            <div className="whitespace-normal break-words">{it.relative_path}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground whitespace-normal break-words">
                              {it.target_granularity === 'version'
                                ? `versions=${(it.target_version_summaries || []).length}`
                                : `refs=${(it.target_reference_summaries || []).length}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                              {it.target_granularity === 'version' &&
                                (it.target_version_summaries || []).map(v => {
                                  const selected = targetSelectionByItemId[it.item_id]?.verIds || it.target_version_ids || []
                                  const checked = selected.includes(v.id)
                                  return (
                                    <label key={v.id} className="flex items-start gap-2">
                                      <input type="checkbox" checked={checked} onChange={() => toggleTarget(it.item_id, 'ver', v.id)} />
                                      <span className="whitespace-normal break-words">{formatVersionSummary(v)}</span>
                                    </label>
                                  )
                                })}
                              {it.target_granularity === 'reference' &&
                                (it.target_reference_summaries || []).map(r => {
                                  const selected = targetSelectionByItemId[it.item_id]?.refIds || it.target_reference_ids || []
                                  const checked = selected.includes(r.id)
                                  return (
                                    <label key={r.id} className="flex items-start gap-2">
                                      <input type="checkbox" checked={checked} onChange={() => toggleTarget(it.item_id, 'ref', r.id)} />
                                      <span className="whitespace-normal break-words">{formatRefSummary(r)}</span>
                                    </label>
                                  )
                                })}
                            </div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={resolveConflicts} disabled={isResolving || hasUnresolvedConflicts}>
                    {isResolving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirmar resolución de conflictos
                  </Button>
                  <div className="text-xs text-amber-800">
                    {jobId ? 'Esto guarda la selección en el Job (auditable/reanudable).' : 'Modo stateless: no se guarda en BD, pero sí se refleja en pantalla y en Apply.'}
                  </div>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Targets</TableHead>
                  <TableHead>Conflicto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.slice(0, 500).map(it => (
                  <TableRow key={it.item_id}>
                    <TableCell className="max-w-[520px] whitespace-normal break-words">{it.relative_path}</TableCell>
                    <TableCell>
                      {it.match_status.startsWith('MATCH_OK') && <Badge className="bg-emerald-600">MATCH_OK</Badge>}
                      {it.match_status === 'CONFLICT_REF' && <Badge className="bg-amber-600">CONFLICT</Badge>}
                      {it.match_status === 'AMBIGUOUS' && <Badge className="bg-slate-600">AMBIGUOUS</Badge>}
                      {(it.match_status === 'NO_MATCH' || it.match_status === 'PARSE_FAILED') && <Badge className="bg-rose-600">NO_MATCH</Badge>}
                      {it.match_status.startsWith('IGNORED') && <Badge variant="outline">IGNORED</Badge>}
                      {it.match_status === 'AMBIGUOUS' && String(it.notes || '').includes('width_only_measure') && (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => confirmWidthOnlyAmbiguous(it.item_id)}
                            className="h-8 px-2 text-[11px]"
                          >
                            Confirmar (usar medida parcial)
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {it.target_granularity === 'version'
                            ? `versions=${(it.target_version_ids || []).length}`
                            : `refs=${(it.target_reference_ids || []).length}`}
                        </summary>
                        <div className="mt-1 space-y-1">
                          {it.target_granularity === 'version' &&
                            (it.target_version_summaries || []).map(v => {
                              const selected = targetSelectionByItemId[it.item_id]?.verIds || it.target_version_ids || []
                              const checked = selected.includes(v.id)
                              return (
                                <label key={v.id} className="flex items-start gap-2 text-muted-foreground">
                                  <input type="checkbox" checked={checked} onChange={() => toggleTarget(it.item_id, 'ver', v.id)} />
                                  <span className="whitespace-normal break-words">{formatVersionSummary(v)}</span>
                                </label>
                              )
                            })}
                          {it.target_granularity === 'reference' &&
                            (it.target_reference_summaries || []).map(r => {
                              const selected = targetSelectionByItemId[it.item_id]?.refIds || it.target_reference_ids || []
                              const checked = selected.includes(r.id)
                              return (
                                <label key={r.id} className="flex items-start gap-2 text-muted-foreground">
                                  <input type="checkbox" checked={checked} onChange={() => toggleTarget(it.item_id, 'ref', r.id)} />
                                  <span className="whitespace-normal break-words">{formatRefSummary(r)}</span>
                                </label>
                              )
                            })}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              const refs = (it.target_reference_summaries || []).map(r => r.id)
                              const vers = (it.target_version_summaries || []).map(v => v.id)
                              setTargetSelectionByItemId(prev => ({
                                ...prev,
                                [it.item_id]: {
                                  refIds: uniq(refs),
                                  verIds: uniq(vers),
                                },
                              }))
                            }}
                          >
                            Seleccionar todo
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setTargetSelectionByItemId(prev => ({ ...prev, [it.item_id]: { refIds: [], verIds: [] } }))
                            }}
                          >
                            Limpiar selección
                          </Button>
                        </div>
                      </details>
                    </TableCell>
                    <TableCell>
                      {it.conflict_group_code ? (
                        <div className="space-y-1">
                          <Badge variant="outline">{it.conflict_group_code}</Badge>
                          {(it.conflict_target_reference_summaries || []).length > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              Conflict refs:{' '}
                              {(it.conflict_target_reference_summaries || [])
                                .slice(0, 4)
                                .map(r => [r.family_code, r.reference_code].filter(Boolean).join('-'))
                                .filter(Boolean)
                                .join(', ')}
                              {(it.conflict_target_reference_summaries || []).length > 4 ? '…' : ''}
                            </div>
                          )}
                          {(it.conflict_target_version_summaries || []).length > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              Conflict vers:{' '}
                              {(it.conflict_target_version_summaries || [])
                                .slice(0, 4)
                                .map(v => `${[v.family_code, v.reference_code].filter(Boolean).join('-')}:${v.version_code}`)
                                .filter(Boolean)
                                .join(', ')}
                              {(it.conflict_target_version_summaries || []).length > 4 ? '…' : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.length > 500 && <div className="text-xs text-muted-foreground">Mostrando 500 de {items.length} filas.</div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
