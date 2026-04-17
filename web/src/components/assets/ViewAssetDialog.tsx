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
import { Eye, Download, X } from 'lucide-react'

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
            <DialogContent className="sm:max-w-3xl p-0 overflow-hidden bg-slate-900 border-slate-800">
                <DialogHeader className="p-4 bg-white/10 backdrop-blur-md absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between space-y-0">
                    <DialogTitle className="text-white font-medium truncate pr-8">
                        {assetName}
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                        <a 
                            href={assetUrl} 
                            download={assetName}
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-white/20 text-white hover:bg-white/30 h-8 px-3"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                        </a>
                    </div>
                </DialogHeader>
                
                <div className="relative w-full min-h-[400px] max-h-[80vh] flex items-center justify-center p-12 pt-20">
                    <img 
                        src={assetUrl} 
                        alt={assetName} 
                        className="max-w-full max-h-full object-contain shadow-2xl"
                    />
                </div>
                
                <div className="p-3 bg-white/5 text-[10px] text-white/40 text-center uppercase tracking-widest pointer-events-none">
                    Previsualización de Recurso
                </div>
            </DialogContent>
        </Dialog>
    )
}
