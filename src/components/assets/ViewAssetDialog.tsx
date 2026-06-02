'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye, Download } from 'lucide-react'

interface Props {
    assetName: string;
    assetUrl: string;
    children?: React.ReactNode;
}

export function ViewAssetDialog({ assetName, assetUrl, children }: Props) {
    const [open, setOpen] = useState(false)

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
            <DialogContent className="sm:max-w-3xl p-0 overflow-hidden bg-white">
                <DialogHeader className="p-4 bg-slate-100 border-b border-slate-200 flex flex-row items-center justify-between space-y-0">
                    <DialogTitle className="text-slate-800 font-medium truncate pr-8">
                        {assetName}
                    </DialogTitle>
                    <div className="flex items-center gap-2">
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
                
                <div className="relative w-full min-h-[400px] max-h-[80vh] flex items-center justify-center p-12 pt-20 bg-white">
                    <img 
                        src={assetUrl} 
                        alt={assetName} 
                        className="max-w-full max-h-full object-contain shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.15)]"
                    />
                </div>
                
                <div className="p-3 bg-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-widest pointer-events-none border-t border-slate-200">
                    Previsualización de Recurso
                </div>
            </DialogContent>
        </Dialog>
    )
}
