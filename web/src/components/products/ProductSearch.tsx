'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface ProductSearchProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
}

export function ProductSearch({ families, references }: ProductSearchProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Read multiple values from query parameters
    const [family, setFamily] = useState<string[]>(searchParams.getAll('f'))
    const [reference, setReference] = useState<string[]>(searchParams.getAll('r'))

    useEffect(() => {
        const timeout = setTimeout(() => {
            const params = new URLSearchParams()
            family.forEach(f => params.append('f', f))
            // Los valores de referencia son compuestos "ref_code|||commercial_measure"
            // Decodificamos para pasar ref_code en ?r= y commercial_measure en ?m=
            reference.forEach(v => {
                const [rc, cm] = v.split('|||')
                params.append('r', rc)
                if (cm) params.append('m', cm)
            })
            router.push(`/products?${params.toString()}`)
        }, 300)
        return () => clearTimeout(timeout)
    }, [family, reference, router])

    // Reset downstream filters if parent changes
    const handleFamilyChange = (vals: string[]) => {
        setFamily(vals)
        setReference([])
    }

    const handleReferenceChange = (vals: string[]) => {
        setReference(vals)
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
                placeholder="Referencia · Medida"
                className="max-w-[420px]"
            />
        </div>
    )
}
