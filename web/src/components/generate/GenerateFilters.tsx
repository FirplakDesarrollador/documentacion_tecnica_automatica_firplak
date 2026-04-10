'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface GenerateFiltersProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
}

const STORAGE_KEYS = {
    FAMILY: 'generate_filter_family',
    REFERENCE: 'generate_filter_reference',
    TEMPLATE: 'generate_filter_template_id'
}

export function GenerateFilters({ families, references }: GenerateFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Inicializamos con lo que haya en la URL si existe
    const [family, setFamily] = useState<string[]>(() => searchParams.getAll('f'))
    const [reference, setReference] = useState<string[]>(() => searchParams.getAll('r'))

    // Efecto para restaurar desde localStorage solo si la URL está vacía
    useEffect(() => {
        const hasUrlParams = searchParams.has('f') || searchParams.has('r')
        
        if (!hasUrlParams) {
            const savedFamily = localStorage.getItem(STORAGE_KEYS.FAMILY)
            const savedReference = localStorage.getItem(STORAGE_KEYS.REFERENCE)
            const savedTemplate = localStorage.getItem(STORAGE_KEYS.TEMPLATE)

            if (savedFamily) {
                try {
                    const parsed = JSON.parse(savedFamily)
                    if (Array.isArray(parsed) && parsed.length > 0) setFamily(parsed)
                } catch (e) { console.error("Error parsing family from localStorage", e) }
            }

            if (savedReference) {
                try {
                    const parsed = JSON.parse(savedReference)
                    if (Array.isArray(parsed) && parsed.length > 0) setReference(parsed)
                } catch (e) { console.error("Error parsing reference from localStorage", e) }
            }
            
            // Si hay un template guardado pero no en URL, lo añadiremos luego via useEffect de sincronización
        }
    }, []) // Solo al montar

    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            
            // Actualizar URL
            family.forEach(f => params.append('f', f))
            reference.forEach(r => params.append('r', r))
            
            // Persistir Filtros en localStorage
            localStorage.setItem(STORAGE_KEYS.FAMILY, JSON.stringify(family))
            localStorage.setItem(STORAGE_KEYS.REFERENCE, JSON.stringify(reference))

            // Manejo de Template ID
            let templateId = searchParams.get('template_id')
            if (!templateId) {
                // Si no está en URL, buscamos en localStorage
                templateId = localStorage.getItem(STORAGE_KEYS.TEMPLATE)
            }
            
            if (templateId) {
                params.set('template_id', templateId)
                localStorage.setItem(STORAGE_KEYS.TEMPLATE, templateId)
            }

            // Evitar empujar una URL vacía si no hay nada que persistir y no hay params actuales
            const hasNewParams = family.length > 0 || reference.length > 0 || templateId
            const isDifferent = params.toString() !== searchParams.toString()

            if (isDifferent) {
                router.push(`/generate?${params.toString()}`)
            }
        }, 300)
        return () => clearTimeout(timeout)
    }, [family, reference, router, searchParams])

    const handleFamilyChange = (vals: string[]) => {
        setFamily(vals)
        setReference([])
    }

    const handleReferenceChange = (vals: string[]) => {
        setReference(vals)
    }

    return (
        <div className="flex items-center gap-3 flex-wrap">
            <MultiSelectSearchField
                options={families}
                values={family}
                onChange={handleFamilyChange}
                placeholder="Familia"
                className="max-w-[220px]"
            />
            <MultiSelectSearchField
                options={references}
                values={reference}
                onChange={handleReferenceChange}
                placeholder="Referencia · Medida"
                className="max-w-[420px]"
            />
        </div>
    )
}
