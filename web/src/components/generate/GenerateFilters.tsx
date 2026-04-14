'use client'

import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'

interface GenerateFiltersProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    familyIds: string[]
    referenceIds: string[]
    onChange: (family: string[], reference: string[]) => void
}

export function GenerateFilters({ 
    families, 
    references,
    familyIds,
    referenceIds,
    onChange
}: GenerateFiltersProps) {

    const handleFamilyChange = (vals: string[]) => {
        onChange(vals, []) // Reset references when family changes
    }

    const handleReferenceChange = (vals: string[]) => {
        onChange(familyIds, vals)
    }

    return (
        <div className="flex items-center gap-3 flex-wrap">
            <MultiSelectSearchField
                options={families}
                values={familyIds}
                onChange={handleFamilyChange}
                placeholder="Familia"
                className="max-w-[220px]"
            />
            <MultiSelectSearchField
                options={references}
                values={referenceIds}
                onChange={handleReferenceChange}
                placeholder="Referencia · Medida"
                className="max-w-[420px]"
            />
        </div>
    )
}
