'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { deleteTemplate } from '@/app/templates/actions'
import { toast } from 'sonner'

const CONFIRMATION_STEPS = [
    "¿Estás segur@ de que deseas eliminar esta plantilla?",
    "¿Estás bien, bien segur@?",
    "Mira que la vas a borrar para siempre... ¿Eres human@ de verdad?",
    "Bueno, conste que te avisé. Si le das a 'Sí' otra vez se eliminará y no hay vuelta atrás.",
    "Ok, ok, te doy una última oportunidad... ¿Sí la eliminas definitivamente?"
]

export function DeleteTemplateButton({ id }: { id: string }) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(0)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleConfirm = async () => {
        if (step < CONFIRMATION_STEPS.length - 1) {
            setStep(step + 1)
        } else {
            // Delete it for real
            setIsDeleting(true)
            const res = await deleteTemplate(id)
            setIsDeleting(false)
            if (res.success) {
                toast.success("¡Plantilla eliminada exitosamente!")
                setOpen(false)
                setStep(0)
            } else {
                toast.error("Error al eliminar: " + res.error)
            }
        }
    }

    const handleCancel = () => {
        setOpen(false)
        setStep(0)
    }

    return (
        <>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>
                <Trash2 className="h-4 w-4" />
            </Button>

            <Dialog open={open} onOpenChange={(val) => !val && handleCancel()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar Plantilla {step > 2 ? '🔥' : '⚠️'}</DialogTitle>
                        <DialogDescription className="pt-4 text-base font-medium text-slate-800">
                            {CONFIRMATION_STEPS[step]}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 flex justify-between sm:justify-between items-center w-full">
                        <Button variant="outline" onClick={handleCancel}>
                            ¡No, me arrepentí! (Cancelar)
                        </Button>
                        <Button variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Sí, continuar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
