'use client'

import * as React from "react"
import { Box, Image as ImageIcon, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IsometricGroupView } from '@/components/assets/IsometricGroupView'
import { FlatAssetGrid } from '@/components/assets/FlatAssetGrid'

interface GroupedRow {
    id: string
    name: string
    type: string
    file_path: string
    relation_count: number
    family_code: string | null
    product_name: string | null
}

interface Props {
    isometricRows: GroupedRow[]
    icons: any[]
    logos: any[]
    allAssets: any[]
    defaultNames: string[]
    searchQuery: string
}

type TabId = 'isometrics' | 'icons' | 'logos'

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'isometrics', label: 'Isométricos', icon: <Box className="h-4 w-4" /> },
    { id: 'icons', label: 'Iconos', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'logos', label: 'Logos', icon: <Database className="h-4 w-4" /> },
]

export function AssetsGallery({ isometricRows, icons, logos, allAssets, defaultNames, searchQuery }: Props) {
    const [activeTab, setActiveTab] = React.useState<TabId>('isometrics')

    const isSearching = searchQuery.trim().length > 0

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {isSearching ? (
                <div className="p-5">
                    <div className="mb-4">
                        <p className="text-sm text-slate-500 font-medium">
                            Resultados para: <span className="text-slate-900 font-bold">&ldquo;{searchQuery}&rdquo;</span>
                            <span className="ml-2 text-slate-400">({allAssets.length} encontrado(s))</span>
                        </p>
                    </div>
                    {allAssets.length > 0 ? (
                        <FlatAssetGrid assets={allAssets} defaultNames={defaultNames} />
                    ) : (
                        <div className="text-center py-12 text-slate-400 text-sm font-medium">
                            No se encontraron recursos con ese criterio.
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="flex border-b border-slate-200 bg-slate-50/50">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all border-b-2 -mb-[1px]",
                                    activeTab === tab.id
                                        ? "text-indigo-700 border-indigo-500 bg-white"
                                        : "text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300"
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="p-5">
                        {activeTab === 'isometrics' && (
                            <IsometricGroupView rows={isometricRows} defaultNames={defaultNames} />
                        )}
                        {activeTab === 'icons' && (
                            <FlatAssetGrid assets={icons} defaultNames={defaultNames} />
                        )}
                        {activeTab === 'logos' && (
                            <FlatAssetGrid assets={logos} defaultNames={defaultNames} />
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
