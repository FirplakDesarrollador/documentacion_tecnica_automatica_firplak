'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export function ResourceSearch() {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    const [query, setQuery] = useState(searchParams.get('q') || '')

    useEffect(() => {
        const timeout = setTimeout(() => {
            const currentQ = searchParams.get('q') || ''
            if (query === currentQ) return

            const params = new URLSearchParams(searchParams.toString())
            if (query) {
                params.set('q', query)
            } else {
                params.delete('q')
            }
            router.push(`/assets?${params.toString()}`)
        }, 300)
        
        return () => clearTimeout(timeout)
    }, [query, router, searchParams])

    return (
        <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar recursos (nombre, categoría, ruta)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 h-10 border-slate-200 focus:ring-indigo-500 rounded-lg shadow-sm"
            />
        </div>
    )
}
