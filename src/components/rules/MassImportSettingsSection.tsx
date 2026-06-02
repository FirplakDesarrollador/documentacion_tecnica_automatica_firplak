'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { saveMassImportSettingsAction } from '@/app/rules/actions'

export function MassImportSettingsSection(props: { initialExecuteEnabled: boolean; initialSafeMaxRows: number }) {
  const [executeEnabled, setExecuteEnabled] = useState<boolean>(!!props.initialExecuteEnabled)
  const [safeMaxRows, setSafeMaxRows] = useState<string>(String(props.initialSafeMaxRows ?? 15))
  const [isPending, startTransition] = useTransition()

  const onSave = () => {
    const n = parseInt(String(safeMaxRows || '').trim() || '0', 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('SAFE_MAX_ROWS debe ser un número mayor a 0')
      return
    }

    startTransition(async () => {
      try {
        await saveMassImportSettingsAction({ executeEnabled, safeMaxRows: n })
        toast.success('Configuración de carga masiva guardada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error guardando configuración')
      }
    })
  }

  return (
    <Card className="border-2 border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50">
        <CardTitle className="text-lg font-extrabold tracking-tight text-slate-900">Carga Masiva (V6)</CardTitle>
        <CardDescription>Configura el modo de ejecución y límites de seguridad sin editar `.env`.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={executeEnabled}
              onCheckedChange={(v) => setExecuteEnabled(v === true)}
              id="mi-exec-enabled"
            />
            <div className="grid gap-1">
              <Label htmlFor="mi-exec-enabled" className="font-bold text-slate-800">
                MASS_IMPORT_EXECUTE_ENABLED
              </Label>
              <div className="text-sm text-slate-600">
                Si está activo, `Execute` persiste SKUs/referencias/versiones. Si está apagado, el import corre en modo seguro.
              </div>
            </div>
          </div>

          <div className="grid gap-2 max-w-[280px]">
            <Label htmlFor="mi-safe-max" className="font-bold text-slate-800">
              MASS_IMPORT_SAFE_MAX_ROWS
            </Label>
            <Input
              id="mi-safe-max"
              inputMode="numeric"
              value={safeMaxRows}
              onChange={(e) => setSafeMaxRows(e.target.value)}
              placeholder="15"
            />
            <div className="text-xs text-slate-500">Solo aplica cuando `MASS_IMPORT_EXECUTE_ENABLED` está apagado.</div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onSave} disabled={isPending} className="font-bold">
              Guardar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

