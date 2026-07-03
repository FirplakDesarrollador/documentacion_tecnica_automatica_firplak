'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'

import { saveSapWriteSettingsAction } from '@/app/configuration/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

type SapWriteSettingsSectionProps = {
  initialEnabled: boolean
}

export function SapWriteSettingsSection({
  initialEnabled,
}: SapWriteSettingsSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  const onSave = () => {
    startTransition(async () => {
      try {
        await saveSapWriteSettingsAction({ enabled })
        toast.success(enabled ? 'Escrituras SAP activadas en la app' : 'Escrituras SAP inactivadas en la app')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo guardar la configuracion SAP')
      }
    })
  }

  return (
    <Card className="border-2 border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50">
        <CardTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
          <LockKeyhole className="h-5 w-5 text-slate-600" />
          Escrituras SAP
        </CardTitle>
        <CardDescription>
          Controla si la app puede crear o actualizar articulos en SAP desde los flujos administrativos.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={enabled}
              onCheckedChange={(value) => setEnabled(value === true)}
              id="sap-writes-enabled"
            />
            <div className="grid gap-1">
              <Label htmlFor="sap-writes-enabled" className="font-bold text-slate-800">
                Permitir escrituras SAP desde la app
              </Label>
              <div className="text-sm text-slate-600">
                Si esta apagado, los dry-runs siguen funcionando, pero los PATCH/POST reales a SAP quedan bloqueados.
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              {enabled ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              Estado: {enabled ? 'habilitado' : 'bloqueado'}
            </div>
            <p className="mt-1 text-slate-600">
              Este switch es la fuente de control para permitir o bloquear PATCH/POST reales a SAP desde la app.
            </p>
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
