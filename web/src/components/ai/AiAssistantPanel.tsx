'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'

interface AiAssistantPanelProps {
    sapDescription: string
    onApplySuggestions: (suggestions: Record<string, any>) => void
}

export function AiAssistantPanel({ sapDescription, onApplySuggestions }: AiAssistantPanelProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false)

    const handleAnalyze = async () => {
        if (!sapDescription.trim()) {
            toast.error('SAP Description is empty.')
            return
        }

        setIsAnalyzing(true)
        try {
            const response = await fetch('/api/ai/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sapDescription }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to analyze')
            }

            const data = await response.json()
            onApplySuggestions(data.suggestions)
            toast.success('Applied AI suggestions successfully.')
        } catch (error: any) {
            console.error(error)
            toast.error(error.message || 'Failed to contact AI Assistant')
        } finally {
            setIsAnalyzing(false)
        }
    }

    return (
        <Card className="p-4 bg-muted/50 border-blue-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-blue-900 text-sm">Gemini Assistant</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
                Click below to parse the SAP description and automatically fill in product attributes like type, name, color, and flags.
            </p>
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !sapDescription}
                className="w-full bg-blue-100 text-blue-700 hover:bg-blue-200"
            >
                {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {isAnalyzing ? 'Analyzing...' : 'Auto-fill from Description'}
            </Button>
        </Card>
    )
}
