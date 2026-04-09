'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface GenerateFiltersProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
}

export function GenerateFilters({ families, references }: GenerateFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [family, setFamily] = useState<string[]>(searchParams.getAll('f'))
    const [reference, setReference] = useState<string[]>(searchParams.getAll('r'))

    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            family.forEach(f => params.append('f', f))
            reference.forEach(r => params.append('r', r))
            // Preserve template selection if any
            const templateId = searchParams.get('template_id')
            if (templateId) params.set('template_id', templateId)
            router.push(`/generate?${params.toString()}`)
        }, 300)
        return () => clearTimeout(timeout)
    }, [family, reference, router]) // eslint-disable-line react-hooks/exhaustive-deps

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
