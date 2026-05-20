'use client'

import { MultiSelectSearchField } from '@/components/ui-custom/MultiSelectSearchField'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface GenerateFiltersProps {
    families: { value: string, label: string }[]
    references: { value: string, label: string }[]
    familyIds: string[]
    referenceIds: string[]
    onChange: (family: string[], reference: string[]) => void
    textFilter: string
    onTextFilterChange: (val: string) => void
}

export function GenerateFilters({ 
    families, 
    references,
    familyIds,
    referenceIds,
    onChange,
    textFilter,
    onTextFilterChange
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
                placeholder="Referencia · Designación · Medida..."
                className="max-w-[420px]"
            />
            <div className="relative flex items-center max-w-[280px] w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                    type="text"
                    placeholder="Buscar por nombre o color..."
                    value={textFilter}
                    onChange={(e) => onTextFilterChange(e.target.value)}
                    className="pl-9 pr-8 h-10 w-full"
                />
                {textFilter && (
                    <button
                        onClick={() => onTextFilterChange('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    )
}
