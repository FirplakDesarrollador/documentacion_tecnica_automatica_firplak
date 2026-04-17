'use client'

import React, { useState } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function ImportCsvButton() {
    const [isImporting, setIsImporting] = useState(false)
    const router = useRouter()

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsImporting(true)

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    // Send to API Route for processing
                    const res = await fetch('/api/products/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: results.data }),
                    })

                    if (!res.ok) throw new Error('API processing failed')

                    const responseData = await res.json()
                    toast.success(`Imported ${responseData.count} products successfully`)
                    router.refresh()
                } catch (error) {
                    console.error(error)
                    toast.error('Failed to import CSV')
                } finally {
                    setIsImporting(false)
                }
            },
            error: (error) => {
                console.error('CSV Parsing Error:', error)
                toast.error('Invalid CSV file')
                setIsImporting(false)
            }
        })
    }

    return (
        <div className="relative">
            <Input
                type="file"
                accept=".csv"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={handleFileUpload}
                disabled={isImporting}
            />
            <Button variant="outline" disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import CSV'}
            </Button>
        </div>
    )
}
