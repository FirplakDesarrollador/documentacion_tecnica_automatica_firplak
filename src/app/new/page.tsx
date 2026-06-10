'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { ProductForm } from './ProductForm'

export default function NewProductPage() {
    const router = useRouter()
    const [resetKey, setResetKey] = useState(0)

    return (
        <div className="max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between mb-4">
                <Button
                    variant="ghost"
                    onClick={() => router.push('/')}
                    className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Volver a Inicio
                </Button>
                <Button
                    variant="outline"
                    onClick={() => setResetKey(k => k + 1)}
                    className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm"
                >
                    <RotateCcw className="w-4 h-4" /> Reiniciar
                </Button>
            </div>
            <ProductForm key={resetKey} />
        </div>
    )
}
