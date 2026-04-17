'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, BookOpen } from 'lucide-react'
import { translateMissingProducts } from '@/app/products/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function AiTranslateButton() {
    const [isTranslating, setIsTranslating] = useState(false)
    const router = useRouter()

    const handleTranslate = async () => {
        setIsTranslating(true)
        const toastId = toast.loading("Traduciendo con el Motor de Glosario...")

        try {
            const res = await translateMissingProducts()
            if (res.success) {
                if (res.count === 0) {
                    toast.success("Todos los productos tienen sus nombres técnicos.", { id: toastId })
                } else {
                    toast.success(res.message, { id: toastId })
                    router.refresh()
                }
            } else {
                toast.error("Error en la traducción: " + (res.message || 'Error desconocido'), { id: toastId })
            }
        } catch (error) {
            toast.error("Error al procesar la traducción.", { id: toastId })
        } finally {
            setIsTranslating(false)
        }
    }

    return (
        <Button
            variant="secondary"
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border-indigo-200"
            onClick={handleTranslate}
            disabled={isTranslating}
            title="Traduce nombres técnicos vacíos usando el glosario"
        >
            {isTranslating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <BookOpen className="mr-2 h-4 w-4 text-indigo-500" />
            )}
            {isTranslating ? 'Traduciendo...' : 'Traducir Vacíos (Glosario)'}
        </Button>
    )
}
