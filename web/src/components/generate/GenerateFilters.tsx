'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface GenerateFiltersProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    measures: string[]
}

export function GenerateFilters({ families, references, measures }: GenerateFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [family, setFamily] = useState<string[]>(searchParams.getAll('f'))
    const [reference, setReference] = useState<string[]>(searchParams.getAll('r'))
    const [measure, setMeasure] = useState<string[]>(searchParams.getAll('m'))

    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            family.forEach(f => params.append('f', f))
            reference.forEach(r => params.append('r', r))
            measure.forEach(m => params.append('m', m))
            // Preserve template selection if any
            const templateId = searchParams.get('template_id')
            if (templateId) params.set('template_id', templateId)
            router.push(`/generate?${params.toString()}`)
        }, 300)
        return () => clearTimeout(timeout)
    }, [family, reference, measure, router]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleFamilyChange = (vals: string[]) => {
        setFamily(vals)
        setReference([])
        setMeasure([])
    }

    const handleReferenceChange = (vals: string[]) => {
        setReference(vals)
        setMeasure([])
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
                placeholder="Referencia"
                className="max-w-[320px]"
            />
            <MultiSelectSearchField
                options={measures.map(m => ({ value: m, label: m }))}
                values={measure}
                onChange={setMeasure}
                placeholder="Medida"
                className="max-w-[220px]"
            />
        </div>
    )
}
