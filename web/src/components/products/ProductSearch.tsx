'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface ProductSearchProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    measures: string[]
}

export function ProductSearch({ families, references, measures }: ProductSearchProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Read multiple values from query parameters
    const [family, setFamily] = useState<string[]>(searchParams.getAll('f'))
    const [reference, setReference] = useState<string[]>(searchParams.getAll('r'))
    const [measure, setMeasure] = useState<string[]>(searchParams.getAll('m'))

    // Debounce search
    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            family.forEach(f => params.append('f', f))
            reference.forEach(r => params.append('r', r))
            measure.forEach(m => params.append('m', m))
            
            router.push(`/products?${params.toString()}`)
        }, 300)

        return () => clearTimeout(timeout)
    }, [family, reference, measure, router])

    // Reset downstream filters if parent changes
    const handleFamilyChange = (vals: string[]) => {
        setFamily(vals)
        if (vals.length === 0) {
            setReference([])
            setMeasure([])
        } else {
            // Keep reference if it's still valid (can't easily check client-side without props, so reset is safer)
            setReference([])
            setMeasure([])
        }
    }

    const handleReferenceChange = (vals: string[]) => {
        setReference(vals)
        setMeasure([])
    }

    return (
        <div className="flex items-center gap-3 flex-1">
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
