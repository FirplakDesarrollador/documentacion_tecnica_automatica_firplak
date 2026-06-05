'use client'

import * as React from "react"
import Image from 'next/image'
import { ChevronDown, ChevronRight, Image as ImageIcon, Box, FolderOpen, FileBox } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ViewAssetDialog } from '@/components/assets/ViewAssetDialog'
import { EditAssetDialog } from '@/components/assets/EditAssetDialog'
import { DeleteAssetDialog } from '@/components/assets/DeleteAssetDialog'

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
    rows: GroupedRow[]
    defaultNames: string[]
}

function AssetItem({ asset, isDefault }: { asset: GroupedRow; isDefault: boolean }) {
    return (
        <div className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm transition-all">
            <ViewAssetDialog assetName={asset.name} assetUrl={asset.file_path}>
                <div className="relative h-10 w-10 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-slate-200 cursor-pointer shrink-0 hover:ring-2 hover:ring-indigo-500/50 transition-all">
                    {asset.file_path ? (
                        <Image
                            src={asset.file_path}
                            alt={asset.name}
                            fill
                            unoptimized
                            sizes="40px"
                            className="object-contain"
                        />
                    ) : (
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                    )}
                </div>
            </ViewAssetDialog>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-bold leading-snug text-slate-900">{asset.name}</p>
                    {asset.relation_count === 0 && (
                        <Badge className="bg-rose-500 text-white border-none text-[8px] h-4 font-bold animate-pulse shrink-0">HUÉRFANO</Badge>
                    )}
                    {isDefault && (
                        <Badge variant="secondary" className="text-[8px] h-4 shrink-0">Sistema</Badge>
                    )}
                </div>
                {asset.file_path && (
                    <p className="mt-0.5 break-all text-[9px] text-slate-400">{asset.file_path}</p>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <EditAssetDialog assetId={asset.id} assetName={asset.name} assetType={asset.type} isDefault={isDefault} />
                {!isDefault && <DeleteAssetDialog assetId={asset.id} assetName={asset.name} />}
            </div>
        </div>
    )
}

export function IsometricGroupView({ rows, defaultNames }: Props) {
    const orphans = rows.filter(r => !r.family_code)
    const grouped = rows.filter(r => r.family_code)

    const familyMap = new Map<string, { productMap: Map<string, Set<string>> }>()
    for (const row of grouped) {
        const fc = row.family_code!
        if (!familyMap.has(fc)) {
            familyMap.set(fc, { productMap: new Map() })
        }
        const entry = familyMap.get(fc)!
        const pn = row.product_name || '(sin nombre)'
        if (!entry.productMap.has(pn)) {
            entry.productMap.set(pn, new Set())
        }
        entry.productMap.get(pn)!.add(row.id)
    }

    const getUniqueAssetsById = (ids: Set<string>) => {
        const seen = new Set<string>()
        return rows.filter(r => ids.has(r.id) && !seen.has(r.id) ? (seen.add(r.id), true) : false)
    }

    const [expandedFamilies, setExpandedFamilies] = React.useState<Set<string>>(new Set())
    const [expandedProducts, setExpandedProducts] = React.useState<Set<string>>(new Set())

    const toggleFamily = (fc: string) => {
        setExpandedFamilies(prev => {
            const next = new Set(prev)
            if (next.has(fc)) next.delete(fc)
            else next.add(fc)
            return next
        })
    }

    const toggleProduct = (key: string) => {
        setExpandedProducts(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    if (rows.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400 text-sm font-medium">
                No hay isométricos disponibles.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {Array.from(familyMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([familyCode, { productMap }]) => {
                    const isFamOpen = expandedFamilies.has(familyCode)
                    return (
                        <div key={familyCode} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <button
                                onClick={() => toggleFamily(familyCode)}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                            >
                                {isFamOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                <FolderOpen className="h-4 w-4 text-indigo-500" />
                                <span className="font-bold text-sm text-slate-800 uppercase">{familyCode}</span>
                                <Badge variant="secondary" className="ml-auto text-[10px]">
                                    {productMap.size} producto(s)
                                </Badge>
                            </button>
                            {isFamOpen && (
                                <div className="p-3 space-y-2">
                                    {Array.from(productMap.entries())
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([productName, assetIds]) => {
                                            const prodKey = `${familyCode}||${productName}`
                                            const isProdOpen = expandedProducts.has(prodKey)
                                            const productAssets = getUniqueAssetsById(assetIds)
                                            return (
                                                <div key={prodKey} className="rounded-lg border border-slate-100 overflow-hidden">
                                                    <button
                                                        onClick={() => toggleProduct(prodKey)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 transition-colors text-left"
                                                    >
                                                        {isProdOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                                                        <FileBox className="h-3.5 w-3.5 text-slate-500" />
                                                        <span className="text-sm font-semibold text-slate-700">{productName}</span>
                                                        <Badge variant="outline" className="ml-auto text-[9px]">
                                                            {productAssets.length} isométrico(s)
                                                        </Badge>
                                                    </button>
                                                    {isProdOpen && (
                                                        <div className="px-3 pb-3 space-y-2">
                                                            {productAssets.map(asset => (
                                                                <AssetItem key={asset.id} asset={asset} isDefault={defaultNames.includes(asset.name)} />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>
                    )
                })}

            {orphans.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 text-amber-800">
                        <Box className="h-4 w-4" />
                        <span className="font-bold text-sm uppercase">Isométricos sin asociar</span>
                        <Badge className="bg-amber-200 text-amber-700 border-none ml-auto text-[10px]">
                            {orphans.length} huérfano(s)
                        </Badge>
                    </div>
                    <div className="p-3 space-y-2">
                        {orphans.map(asset => (
                            <AssetItem key={asset.id} asset={asset} isDefault={defaultNames.includes(asset.name)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
