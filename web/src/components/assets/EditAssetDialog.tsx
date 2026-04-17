'use client'

import { useState, useRef } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit2, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateAssetAction } from '@/app/assets/actions'

interface Props {
    assetId: string;
    assetName: string;
    isDefault?: boolean;
    onUploadComplete?: (asset: any) => void;
}

export function EditAssetDialog({ assetId, assetName, isDefault, onUploadComplete }: Props) {
    const [name, setName] = useState(assetName)
    const [isUpdating, setIsUpdating] = useState(false)
    const [open, setOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const router = useRouter()

    const handleSave = async () => {
        setIsUpdating(true)
        try {
            // 1. If there's a file, upload it first
            let finalPath = ''
            if (selectedFile) {
                const formData = new FormData()
                formData.append('file', selectedFile)
                formData.append('assetId', assetId)

                const uploadRes = await fetch('/api/assets/upload', {
                    method: 'POST',
                    body: formData,
                })
                
                if (!uploadRes.ok) throw new Error('Error al subir el archivo')
                const uploadData = await uploadRes.json()
                finalPath = uploadData.asset?.file_path
            }

            // 2. Update name (if changed and not default)
            const nameToUpdate = !isDefault && name !== assetName ? name : undefined
            
            if (nameToUpdate || finalPath) {
                await updateAssetAction(assetId, { name: nameToUpdate, file_path: finalPath })
                toast.success('Recurso actualizado con éxito')
                setOpen(false)
                router.refresh()
            } else {
                setOpen(false)
            }
        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar')
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
                <Button variant="outline" size="sm" className="h-8 px-2 lg:px-3 gap-2">
                    <Edit2 className="h-4 w-4" />
                    Editar
                </Button>
            } />
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Recurso</DialogTitle>
                    <DialogDescription>
                        Actualiza el nombre o reemplaza el archivo del recurso.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Nombre</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isDefault}
                            className="col-span-3"
                        />
                    </div>
                    {isDefault && (
                        <p className="text-[10px] text-amber-600 ml-auto col-span-3 -mt-3">
                            Los nombres de sistema no pueden ser modificados.
                        </p>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Archivo</Label>
                        <div className="col-span-3">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="hidden"
                                accept="image/png, image/jpeg, image/svg+xml"
                            />
                            <Button 
                                variant="secondary" 
                                className="w-full justify-start text-xs font-normal h-9 truncate"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="mr-2 h-4 w-4" />
                                {selectedFile ? selectedFile.name : 'Seleccionar nuevo archivo...'}
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={isUpdating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isUpdating}>
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
