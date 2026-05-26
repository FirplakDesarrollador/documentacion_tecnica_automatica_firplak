'use client'

import { Image as ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ViewAssetDialog } from '@/components/assets/ViewAssetDialog'
import { EditAssetDialog } from '@/components/assets/EditAssetDialog'
import { DeleteAssetDialog } from '@/components/assets/DeleteAssetDialog'

interface Props {
    assets: any[]
    defaultNames: string[]
}

export function FlatAssetGrid({ assets, defaultNames }: Props) {
    if (assets.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400 text-sm font-medium">
                No hay recursos de este tipo.
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {assets.map((asset: any) => {
                const isDefault = defaultNames.includes(asset.name)
                return (
                    <div
                        key={asset.id}
                        className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden"
                    >
                        <ViewAssetDialog assetName={asset.name} assetUrl={asset.file_path}>
                            <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer border-b border-slate-100">
                                {asset.file_path ? (
                                    <img
                                        src={asset.file_path}
                                        alt={asset.name}
                                        className="max-w-full max-h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                                    />
                                ) : (
                                    <ImageIcon className="h-10 w-10 text-slate-300" />
                                )}
                            </div>
                        </ViewAssetDialog>
                        <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-1">
                                <Badge className="bg-slate-100 text-slate-600 ring-1 ring-slate-600/10 text-[8px] px-1.5 py-0 font-bold uppercase tracking-tight">
                                    {asset.type}
                                </Badge>
                                {asset.type?.toUpperCase() === 'ISOMETRIC' && asset.relation_count === 0 && (
                                    <Badge className="bg-rose-500 text-white border-none text-[7px] h-3.5 font-bold animate-pulse">
                                        HUÉRFANO
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs font-bold text-slate-900 leading-snug break-words" title={asset.name}>
                                {asset.name}
                                {isDefault && (
                                    <span className="ml-1 text-[8px] text-slate-400 font-normal">(Sistema)</span>
                                )}
                            </p>
                            <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <EditAssetDialog
                                    assetId={asset.id}
                                    assetName={asset.name}
                                    assetType={asset.type}
                                    isDefault={isDefault}
                                />
                                {!isDefault && (
                                    <DeleteAssetDialog
                                        assetId={asset.id}
                                        assetName={asset.name}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
