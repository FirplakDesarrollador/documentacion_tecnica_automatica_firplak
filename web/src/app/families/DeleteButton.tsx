'use client'

import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { deleteFamilyAction } from '@/app/products/actions'
import { useState } from 'react'

export function DeleteButton({ code }: { code: string }) {
    const [loading, setLoading] = useState(false)

    const handleDelete = async () => {
        if (confirm(`¿Estás seguro de que deseas eliminar la familia con el código ${code}? Esta acción no se puede deshacer.`)) {
            setLoading(true)
            try {
                await deleteFamilyAction(code)
            } catch (error) {
                console.error("Failed to delete family:", error)
            } finally {
                setLoading(false)
            }
        }
    }

    return (
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDelete}
            disabled={loading}
            className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
        >
            <Trash2 className="h-4 w-4 mr-2" />
            {loading ? 'Eliminando...' : 'Eliminar'}
        </Button>
    )
}
