'use client'

import { useState } from 'react'
import { Loader2, Save, ScanSearch, X } from 'lucide-react'
import { toast } from 'sonner'

import { saveGlossaryTermsAction } from '@/app/configuration/glossary/actions'
import { scanMissingGlossaryTermsAction } from '@/app/configuration/glossary/translation-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type MissingTermKind = 'RESOLVED_TYPE' | 'OTHER'

type MissingTermDraft = {
  term: string
  count: number
  translation: string
  category: string
  isNewCategory: boolean
  kind: MissingTermKind
}

type TranslationConflictScannerProps = {
  candidateCount: number
  categories: string[]
}

const DEFAULT_CATEGORIES = ['TECNICO', 'GENERAL', 'RESOLVED_TYPE', 'MATERIAL', 'ACCESORIO', 'DIMENSION']

function normalizeMissingTerm(raw: string): { term: string; kind: MissingTermKind; defaultCategory: string } {
  const upper = String(raw || '').trim().toUpperCase()
  const resolvedTypePrefix = 'RESOLVED_TYPE_MISSING:'

  if (upper.startsWith(resolvedTypePrefix)) {
    return {
      term: upper.slice(resolvedTypePrefix.length).trim(),
      kind: 'RESOLVED_TYPE',
      defaultCategory: 'RESOLVED_TYPE',
    }
  }

  return { term: upper, kind: 'OTHER', defaultCategory: 'GENERAL' }
}

export function TranslationConflictScanner({ candidateCount, categories }: TranslationConflictScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scannerModalOpen, setScannerModalOpen] = useState(false)
  const [missingTerms, setMissingTerms] = useState<MissingTermDraft[]>([])
  const [isSavingScan, setIsSavingScan] = useState(false)
  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...categories])).sort()

  const handleScanMissingTerms = async () => {
    setIsScanning(true)
    try {
      const res = await scanMissingGlossaryTermsAction()

      if (!res.success) {
        toast.error(res.error || 'Error al escanear conflictos')
        return
      }

      if (!res.missingTerms || res.missingTerms.length === 0) {
        toast.success('No se encontraron terminos faltantes en el catalogo.')
        return
      }

      setMissingTerms(res.missingTerms.map(missingTerm => {
        const normalized = normalizeMissingTerm(missingTerm.term)
        return {
          term: normalized.term,
          count: missingTerm.count,
          translation: '',
          category: normalized.defaultCategory,
          isNewCategory: false,
          kind: normalized.kind,
        }
      }))
      setScannerModalOpen(true)
    } catch (error) {
      console.error(error)
      toast.error('Error al escanear conflictos')
    } finally {
      setIsScanning(false)
    }
  }

  const handleSaveScan = async () => {
    const termsToSave = missingTerms.filter(term => term.translation.trim() !== '')

    if (termsToSave.length === 0) {
      toast.error('Ingresa al menos una traduccion para guardar')
      return
    }

    setIsSavingScan(true)
    try {
      const payload = termsToSave.map(term => ({
        term_es: term.term,
        term_en: term.translation.toUpperCase(),
        category: term.kind === 'RESOLVED_TYPE' ? 'RESOLVED_TYPE' : term.category,
        priority: term.kind === 'RESOLVED_TYPE' ? 20 : 10,
      }))
      const res = await saveGlossaryTermsAction(payload)

      if (res.success) {
        toast.success(res.message ?? 'Traducciones guardadas correctamente')
        setScannerModalOpen(false)
        window.location.reload()
      } else {
        toast.error(res.message)
      }
    } catch (error) {
      console.error(error)
      toast.error('Error al guardar traducciones')
    } finally {
      setIsSavingScan(false)
    }
  }

  const updateMissingTerm = (index: number, updater: (term: MissingTermDraft) => MissingTermDraft) => {
    setMissingTerms(current => current.map((term, currentIndex) => (
      currentIndex === index ? updater(term) : term
    )))
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">Conflictos de traduccion</p>
          <p className="text-xs text-amber-800">
            {candidateCount > 0
              ? `Hay ${candidateCount} productos con senales de traduccion por identificar.`
              : 'No hay senales rapidas de conflictos de traduccion.'}
          </p>
        </div>
        <Button
          onClick={handleScanMissingTerms}
          disabled={isScanning}
          variant="outline"
          className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
        >
          {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
          Escanear conflictos de traduccion
        </Button>
      </div>

      <Dialog open={scannerModalOpen} onOpenChange={setScannerModalOpen}>
        <DialogContent className="max-h-[80vh] max-w-4xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Conflictos de traduccion encontrados</DialogTitle>
            <DialogDescription>
              Se encontraron {missingTerms.length} terminos del catalogo sin traduccion en el glosario.
              Ingresa la traduccion al ingles para resolverlos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md my-4">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[300px] font-bold text-xs uppercase">Termino en espanol</TableHead>
                  <TableHead className="w-[80px] font-bold text-xs uppercase text-center">Frecuencia</TableHead>
                  <TableHead className="font-bold text-xs uppercase">Traduccion EN</TableHead>
                  <TableHead className="w-[150px] font-bold text-xs uppercase">Categoria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingTerms.map((item, index) => (
                  <TableRow key={`${item.term}-${item.count}`} className="hover:bg-slate-50/50">
                    <TableCell className="font-bold text-sm text-slate-800">{item.term}</TableCell>
                    <TableCell className="text-center text-slate-500 font-medium">
                      <Badge variant="outline">{item.count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.translation}
                        onChange={event => updateMissingTerm(index, term => ({
                          ...term,
                          translation: event.target.value.toUpperCase(),
                        }))}
                        placeholder="Ej: BASIC CABINET"
                        className="h-8 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      {item.isNewCategory ? (
                        <div className="flex gap-1">
                          <Input
                            value={item.category}
                            onChange={event => updateMissingTerm(index, term => ({
                              ...term,
                              category: event.target.value.toUpperCase(),
                            }))}
                            placeholder="NUEVA CAT..."
                            className="h-8 text-xs"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-1"
                            onClick={() => updateMissingTerm(index, term => ({
                              ...term,
                              isNewCategory: false,
                              category: term.kind === 'RESOLVED_TYPE' ? 'RESOLVED_TYPE' : 'GENERAL',
                            }))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Select
                          disabled={item.kind === 'RESOLVED_TYPE'}
                          value={item.category}
                          onValueChange={value => {
                            if (!value || item.kind === 'RESOLVED_TYPE') return
                            updateMissingTerm(index, term => ({
                              ...term,
                              isNewCategory: value === 'ADD_NEW',
                              category: value === 'ADD_NEW' ? '' : value,
                            }))
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map(category => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                            <div className="border-t my-1" />
                            <SelectItem value="ADD_NEW" className="text-blue-600 font-bold text-[10px]">
                              + NUEVA...
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScannerModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveScan} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={isSavingScan}>
              {isSavingScan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar traducciones ({missingTerms.filter(term => term.translation.trim()).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
