'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LayoutTemplate, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

export interface TemplateOption {
    id: string
    name: string
    document_type: string
    width_mm: number
    height_mm: number
    orientation: string
    active: boolean
    elements_json: string
    export_formats?: string
    export_filename_format?: string
}

interface TemplatePickerProps {
    templates: TemplateOption[]
    selectedTemplateId: string | null
    onSelect?: (templateId: string) => void
    /** Si es true, el cambio actualiza los query params de la URL */
    updateUrl?: boolean
}

export function TemplatePicker({ templates, selectedTemplateId, onSelect, updateUrl = false }: TemplatePickerProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => {
        setIsMounted(true)
    }, [])

    const selected = templates.find(t => t.id === selectedTemplateId)

    const handleSelect = (id: string) => {
        console.log("[TemplatePicker] handleSelect disparado con ID:", id)
        if (onSelect) onSelect(id)
        if (updateUrl) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('template_id', id)
            router.push(`/generate?${params.toString()}`)
        }
    }

    if (!isMounted) {
        return (
            <Button variant="outline" className="flex items-center gap-2 min-w-[200px] justify-between bg-white border-slate-200 opacity-50 cursor-wait">
                <div className="flex items-center gap-2 min-w-0">
                    <LayoutTemplate className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="truncate text-sm font-medium text-slate-400">
                        Cargando...
                    </span>
                </div>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-300" />
            </Button>
        )
    }

    if (templates.length === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <LayoutTemplate className="w-4 h-4 shrink-0" />
                <span>No hay plantillas activas. <a href="/templates" className="underline font-medium">Crear una plantilla</a></span>
            </div>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 min-w-[200px] justify-between bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <LayoutTemplate className="w-4 h-4 shrink-0 text-indigo-500" />
                        <span className="truncate text-sm font-medium text-slate-700">
                            {selected ? selected.name : 'Elegir plantilla'}
                        </span>
                    </div>
                    <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-xl border-slate-200 shadow-lg">
                <DropdownMenuLabel className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                    Plantillas disponibles
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={selectedTemplateId ?? ''} onValueChange={handleSelect}>
                    {templates.map(t => (
                        <DropdownMenuRadioItem
                            key={t.id}
                            value={t.id}
                            onSelect={(e) => {
                                // Llamar directamente por seguridad en caso que onValueChange falle
                                handleSelect(t.id)
                            }}
                            className="flex flex-col items-start gap-1 py-3 px-3 cursor-pointer"
                        >
                            <div className="flex items-center gap-2 w-full">
                                <span className="font-medium text-slate-800 text-sm">{t.name}</span>
                                {t.active && (
                                    <Badge variant="default" className="bg-green-600 text-[10px] px-1.5 py-0 ml-auto shrink-0">Activa</Badge>
                                )}
                            </div>
                            <span className="text-xs text-slate-400 pl-0">
                                {t.document_type} · {t.width_mm}×{t.height_mm}mm · {t.orientation}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
