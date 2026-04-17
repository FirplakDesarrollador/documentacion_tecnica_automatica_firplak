'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteAssetAction } from '@/app/assets/actions'

interface Props {
    assetId: string;
    assetName: string;
}

export function DeleteAssetDialog({ assetId, assetName }: Props) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(1)
    const [isDeleting, setIsDeleting] = useState(false)

    const funnyMessages = [
        `¿En serio vas a borrar "${assetName}"? Me costó mucho guardarlo... :(`,
        `¡Oye! Sigo pensando que es mala idea. ¿Segur@ que no lo quieres para Navidad?`,
        `Última oportunidad... mira que si lo borras, un gatito en alguna parte dejará de ronronear. ¿Confirmas el desastre?`,
        `¡Dije que NO! Ah, bueno, tú mandas... Ejecutando destrucción total...`
    ]

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const res = await deleteAssetAction(assetId)
            if (res.success) {
                toast.success('Recurso destruido. Espero que estés feliz con lo que has hecho.')
                setOpen(false)
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al eliminar')
        } finally {
            setIsDeleting(false)
        }
    }

    const nextStep = () => {
        if (step < 4) {
            setStep(step + 1)
        } else {
            handleDelete()
        }
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (!val) setStep(1)
        }}>
            <DialogTrigger render={
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                        {step === 4 ? "¡ADVERTENCIA FINAL!" : "Confirmación de Borrado"}
                    </DialogTitle>
                    <DialogDescription className="pt-4 text-slate-700 font-medium">
                        {funnyMessages[step - 1]}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-6">
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={isDeleting}>
                        Me arrepentí
                    </Button>
                    <Button 
                        variant={step === 4 ? "destructive" : "outline"} 
                        onClick={nextStep}
                        disabled={isDeleting}
                        className={step === 4 ? "animate-bounce" : ""}
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {step === 4 ? "SÍ, BÓRRALO YA" : "Sí, estoy segure"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
