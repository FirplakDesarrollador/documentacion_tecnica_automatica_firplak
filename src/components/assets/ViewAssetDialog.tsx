'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye, Download, FileText } from 'lucide-react'

interface Props {
    assetName: string;
    assetUrl: string;
    children?: React.ReactNode;
}

function isImageAsset(path: string) {
    return /\.(svg|png|jpe?g|gif|webp)(?:\?|$)/i.test(path)
}

function isPdfAsset(path: string) {
    return /\.pdf(?:\?|$)/i.test(path)
}

export function ViewAssetDialog({ assetName, assetUrl, children }: Props) {
    const [open, setOpen] = useState(false)
    const [intrinsicSize, setIntrinsicSize] = useState<{ width: number; height: number } | null>(null)

    if (!assetUrl) return children || null

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger 
                nativeButton={children ? false : undefined}
                render={children ? (children as React.ReactElement) : (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                        <Eye className="h-4 w-4" />
                    </Button>
                )} 
            />
            <DialogContent className="flex max-h-[90vh] w-[min(92vw,56rem)] flex-col overflow-hidden bg-white p-0 sm:max-w-[56rem]">
                <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-slate-200 bg-slate-100 p-4 pr-12">
                    <DialogTitle className="min-w-0 flex-1 break-words pr-2 text-slate-800 font-medium leading-snug">
                        {assetName}
                    </DialogTitle>
                    <div className="flex shrink-0 items-center gap-2">
                        <a 
                            href={assetUrl} 
                            download={assetName}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-slate-800 text-white hover:bg-slate-700 h-8 px-3"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                        </a>
                    </div>
                </DialogHeader>
                
                <div className="min-h-0 flex-1 overflow-auto bg-white p-4 sm:p-6">
                    <div className="flex min-h-[240px] items-center justify-center">
                        {isPdfAsset(assetUrl) ? (
                            <iframe
                                src={assetUrl}
                                title={assetName}
                                className="h-[62vh] min-h-[420px] w-full rounded-lg border border-slate-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.15)]"
                            />
                        ) : isImageAsset(assetUrl) ? (
                            <Image
                                src={assetUrl}
                                alt={assetName}
                                width={intrinsicSize?.width ?? 1200}
                                height={intrinsicSize?.height ?? 1200}
                                unoptimized
                                sizes="(max-width: 640px) 92vw, 56rem"
                                className="h-auto max-h-[62vh] w-auto max-w-full object-contain shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.15)]"
                                onLoadingComplete={(img) => {
                                    const width = img.naturalWidth || 0
                                    const height = img.naturalHeight || 0
                                    if (width > 0 && height > 0) {
                                        setIntrinsicSize((prev) => {
                                            if (prev?.width === width && prev?.height === height) return prev
                                            return { width, height }
                                        })
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-8 py-12 text-slate-400">
                                <FileText className="h-10 w-10" />
                                <p className="text-sm font-medium">Este tipo de recurso solo se puede descargar.</p>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="p-3 bg-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-widest pointer-events-none border-t border-slate-200">
                    Previsualización de Recurso
                </div>
            </DialogContent>
        </Dialog>
    )
}
