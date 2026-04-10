'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
    onUploadComplete?: (asset: any) => void;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    className?: string;
    label?: string;
    type?: string;
}

export function UploadAssetButton({ onUploadComplete, variant = "default", className, label, type }: Props = {}) {
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)

        try {
            const formData = new FormData()
            formData.append('file', file)
            if (type) formData.append('type', type)

            const response = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                throw new Error('Upload failed')
            }

            const result = await response.json()
            if (!result.success) throw new Error(result.error)

            toast.success('Recurso subido correctamente')
            if (onUploadComplete) {
                onUploadComplete(result.asset)
            } else {
                router.refresh()
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast.error('Error al subir el recurso')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/png, image/jpeg, image/svg+xml"
            />
            <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant={variant}
                className={className}
            >
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                {isUploading ? 'Subiendo...' : (label || 'Adjuntar recurso')}
            </Button>
        </>
    )
}
