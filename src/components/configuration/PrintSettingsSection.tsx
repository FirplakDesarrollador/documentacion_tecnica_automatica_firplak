'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'
import {
  defaultPrintSettings,
  PRINT_SETTINGS_KEY,
  type PrintColorMode,
  type PrintSettings,
  normalizePrintColorMode,
} from '@/lib/printSettings'

export function PrintSettingsSection() {
  const [colorMode, setColorMode] = useState<PrintColorMode>(() => {
    if (typeof window === 'undefined') return defaultPrintSettings.colorMode

    const saved = window.localStorage.getItem(PRINT_SETTINGS_KEY)
    if (!saved) return defaultPrintSettings.colorMode

    try {
      const parsed = JSON.parse(saved) as Partial<PrintSettings>
      return normalizePrintColorMode(parsed.colorMode)
    } catch {
      return defaultPrintSettings.colorMode
    }
  })

  const save = () => {
    window.localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify({ colorMode }))
    toast.success('Configuración de impresión guardada')
  }

  return (
    <Card className="border-2 border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
            <Printer className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <CardTitle className="text-lg font-extrabold tracking-tight text-slate-900">Impresión</CardTitle>
            <CardDescription>
              Controla cómo el agente local interpreta el color del bitmap térmico.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label className="font-bold text-slate-800">Modo de color</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setColorMode('normal')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  colorMode === 'normal'
                    ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg border border-slate-300 bg-white grid grid-cols-2 overflow-hidden">
                    <span className="bg-black" />
                    <span className="bg-white" />
                    <span className="bg-white" />
                    <span className="bg-black" />
                  </div>
                  <span className="font-bold text-slate-900">Normal</span>
                </div>
                <p className="text-sm text-slate-600">Negro imprime negro; blanco queda sin impresión.</p>
              </button>

              <button
                type="button"
                onClick={() => setColorMode('inverted')}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  colorMode === 'inverted'
                    ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg border border-slate-300 bg-black grid grid-cols-2 overflow-hidden">
                    <span className="bg-white" />
                    <span className="bg-black" />
                    <span className="bg-black" />
                    <span className="bg-white" />
                  </div>
                  <span className="font-bold text-slate-900">Inverso</span>
                </div>
                <p className="text-sm text-slate-600">Negro queda blanco; blanco imprime negro.</p>
              </button>
            </div>
          </div>

          <div>
            <Button onClick={save} className="font-bold">Guardar</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
