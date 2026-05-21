'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, PlusCircle, Save, Search, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'

import {
  createClientAction,
  createMissingClientsAction,
  renameClientAndPropagateAction,
  updateClientLogoAction,
} from './actions'

type ClientRow = {
  id: string
  name: string
  logo_asset_id: string | null
  logo_url?: string | null
}

type EditingClient = {
  isNew: boolean
  id?: string
  original_name?: string
  name: string
  logo_asset_id: string | null
  logo_url?: string | null
}

function getErrMessage(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Error desconocido'
  }
}

export default function ClientsClient({
  initialClients,
  initialMissing,
}: {
  initialClients: ClientRow[]
  initialMissing: string[]
}) {
  const [clients, setClients] = useState<ClientRow[]>(Array.isArray(initialClients) ? initialClients : [])
  const [missing, setMissing] = useState<string[]>(Array.isArray(initialMissing) ? initialMissing : [])
  const [searchTerm, setSearchTerm] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EditingClient | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isBulkCreating, setIsBulkCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => String(c.name || '').toLowerCase().includes(q))
  }, [clients, searchTerm])

  const openNew = () => {
    setEditing({ isNew: true, name: '', logo_asset_id: null, logo_url: null })
    setModalOpen(true)
  }

  const openEdit = (c: ClientRow) => {
    setEditing({
      isNew: false,
      id: c.id,
      original_name: c.name,
      name: c.name,
      logo_asset_id: c.logo_asset_id ?? null,
      logo_url: c.logo_url ?? null,
    })
    setModalOpen(true)
  }

  const openPreview = (c: ClientRow) => {
    const url = c.logo_url ? String(c.logo_url) : ''
    if (!url) return
    setPreview({ name: c.name, url })
    setPreviewOpen(true)
  }

  const syncUpsertLocal = (row: ClientRow) => {
    setClients((prev) => {
      const next = [...prev]
      const idx = next.findIndex((x) => x.id === row.id)
      if (idx >= 0) next[idx] = { ...next[idx], ...row }
      else next.unshift(row)
      next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      return next
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    const nameRaw = String(editing.name || '').trim()
    if (!nameRaw || nameRaw.toUpperCase() === 'NA') {
      toast.error('Nombre inválido (no puede ser vacío ni NA).')
      return
    }

    setIsSaving(true)
    try {
      if (editing.isNew) {
        const created = await createClientAction({
          name: nameRaw,
          logo_asset_id: editing.logo_asset_id,
        })
        syncUpsertLocal(created)
        setMissing((prev) => prev.filter((m) => m.toUpperCase() !== String(created.name || '').toUpperCase()))
        toast.success('Cliente creado correctamente.')
        setModalOpen(false)
        return
      }

      const clientId = String(editing.id || '')
      if (!clientId) throw new Error('client_id requerido')

      const originalName = String(editing.original_name || '').trim()
      const nextName = nameRaw
      const nameChanged = originalName && originalName.toUpperCase() !== nextName.toUpperCase()

      if (nameChanged) {
        const summary = await renameClientAndPropagateAction({ client_id: clientId, new_name: nextName })
        syncUpsertLocal({ id: clientId, name: summary?.new_name || nextName, logo_asset_id: editing.logo_asset_id })
        toast.success('Cliente renombrado y propagado correctamente.')
      }

      await updateClientLogoAction({ client_id: clientId, logo_asset_id: editing.logo_asset_id })
      syncUpsertLocal({ id: clientId, name: nextName, logo_asset_id: editing.logo_asset_id, logo_url: editing.logo_url })

      toast.success('Cliente actualizado correctamente.')
      setModalOpen(false)
    } catch (err: unknown) {
      console.error(err)
      toast.error(getErrMessage(err) || 'Error al guardar el cliente.')
    } finally {
      setIsSaving(false)
    }
  }

  const createMissingOne = async (name: string) => {
    const safe = String(name || '').trim()
    if (!safe) return
    try {
      const created = await createClientAction({ name: safe })
      syncUpsertLocal(created)
      setMissing((prev) => prev.filter((m) => m.toUpperCase() !== safe.toUpperCase()))
      toast.success(`Creado: ${created.name}`)
    } catch (err: unknown) {
      console.error(err)
      toast.error(getErrMessage(err) || `No se pudo crear: ${safe}`)
    }
  }

  const createMissingAll = async () => {
    if (missing.length === 0) return
    setIsBulkCreating(true)
    try {
      const created = await createMissingClientsAction(missing)
      if (Array.isArray(created)) created.forEach((r) => syncUpsertLocal(r))
      setMissing([])
      toast.success('Clientes faltantes creados.')
    } catch (err: unknown) {
      console.error(err)
      toast.error(getErrMessage(err) || 'Error creando clientes faltantes.')
    } finally {
      setIsBulkCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/configuration">
            <Button variant="outline" size="icon" className="border-slate-200 text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Editor de clientes</h1>
            <p className="text-slate-500 mt-1 text-sm font-medium">
              Administra clientes de Marca Propia (`public.clients`) y crea los faltantes detectados en el catálogo.
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold">
          <PlusCircle className="mr-2 h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-600 text-white border-none font-bold">FALTANTES</Badge>
              <div className="text-sm text-amber-900 font-semibold">
                Detectados {missing.length} clientes en el catálogo que no existen en `public.clients`.
              </div>
            </div>
            <Button
              onClick={createMissingAll}
              disabled={isBulkCreating}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {isBulkCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Crear todos
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {missing.slice(0, 60).map((name) => (
              <div key={name} className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                <div className="text-sm font-semibold text-slate-800 truncate">{name}</div>
                <Button variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-50" onClick={() => createMissingOne(name)}>
                  Crear
                </Button>
              </div>
            ))}
          </div>
          {missing.length > 60 && (
            <div className="mt-3 text-xs text-amber-900/80">
              Mostrando 60 de {missing.length}. Usa “Crear todos” para procesarlos en bloque.
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-start md:items-center bg-slate-50/50">
          <div className="flex items-center gap-2 w-full md:max-w-lg">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Total: <span className="font-bold text-slate-700">{clients.length}</span>
            {searchTerm.trim() ? (
              <>
                {' '}
                | Filtrados: <span className="font-bold text-slate-700">{filtered.length}</span>
              </>
            ) : null}
          </div>
        </div>

        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[80px] uppercase tracking-wider text-[10px] font-bold text-slate-500">Logo</TableHead>
              <TableHead className="uppercase tracking-wider text-[10px] font-bold text-slate-500">Nombre</TableHead>
              <TableHead className="w-[140px] text-right uppercase tracking-wider text-[10px] font-bold text-slate-500">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-slate-500">
                  No hay clientes para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openPreview(c)}
                      className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-slate-200 shadow-sm hover:ring-2 hover:ring-indigo-500/50 hover:border-indigo-400 transition-all"
                      title={c.logo_url ? 'Ver logo' : 'Sin logo'}
                      disabled={!c.logo_url}
                    >
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logo_url} alt={c.name} className="max-w-full max-h-full object-contain p-1.5" />
                      ) : (
                        <Users className="h-5 w-5 text-slate-300" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-800">{c.name}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" className="border-slate-200" onClick={() => openEdit(c)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Users className="h-5 w-5 text-slate-700" />
              {editing?.isNew ? 'Nuevo cliente' : 'Editar cliente'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {editing?.isNew
                ? 'Crea un cliente para Marca Propia y opcionalmente vincula un logo.'
                : 'Editar permite cambiar logo y renombrar. Renombrar propagará cambios a SKUs/Versiones/Plantillas.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-700 uppercase">Nombre</Label>
              <Input
                value={editing?.name || ''}
                onChange={(e) => setEditing((p) => (p ? { ...p, name: e.target.value } : p))}
                placeholder="Ej: SODIMAC CHILE"
                className="uppercase"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-700 uppercase">Logo</Label>
              <div className="flex items-center gap-3">
                <UploadAssetButton
                  type="logo"
                  variant="outline"
                  className="border-slate-200"
                  label="Subir logo"
                  onUploadComplete={(asset) =>
                    setEditing((p) =>
                      p
                        ? {
                            ...p,
                            logo_asset_id: asset?.id ? String(asset.id) : p.logo_asset_id,
                            logo_url: asset?.file_path ? String(asset.file_path) : p.logo_url,
                          }
                        : p
                    )
                  }
                />

                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-200"
                  onClick={() => setEditing((p) => (p ? { ...p, logo_asset_id: null, logo_url: null } : p))}
                >
                  Quitar logo
                </Button>

                {editing?.logo_url ? (
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editing.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 font-medium italic">Sin logo</div>
                )}
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="border-slate-200">
                Cancelar
              </Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-semibold" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">{preview?.name || 'Logo'}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">Preview del logo (fondo blanco).</DialogDescription>
          </DialogHeader>
          <div className="w-full rounded-lg border border-slate-200 bg-white p-6 flex items-center justify-center">
            {preview?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.name} className="max-h-[520px] w-auto object-contain" />
            ) : (
              <div className="text-sm text-slate-500">Sin logo</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
