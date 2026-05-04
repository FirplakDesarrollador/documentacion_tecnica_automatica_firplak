'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Ghost, Skull } from 'lucide-react'

interface ConfirmOverwriteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  initialData: any
  currentData: any
}

export function ConfirmOverwriteModal({
  isOpen,
  onClose,
  onConfirm,
  initialData,
  currentData
}: ConfirmOverwriteModalProps) {
  
  // Calcular diferencias significativas
  const diffs = initialData ? Object.keys(currentData).filter(key => {
    // Ignorar campos internos o irrelevantes para la comparación visual
    if (['id', 'created_at', 'updated_at', 'isometric_asset_id', 'familia_code', 'ref_code', 'version_code'].includes(key)) return false
    
    const valInit = initialData[key]
    const valCurr = currentData[key]
    
    // Normalización básica para comparación
    const normalize = (v: any) => (v === null || v === undefined || v === '' ? 'NA' : String(v).trim())
    
    return normalize(valInit) !== normalize(valCurr)
  }) : []

  if (diffs.length === 0 && isOpen) {
    // Si no hay cambios, podríamos saltar el modal, pero el usuario quiere ver "todo lo que cambia"
    // así que si llega aquí es porque al menos algo (incluso calculado) cambió.
  }

  const fieldLabels: Record<string, string> = {
    code: 'Código',
    sap_description: 'Descripción SAP',
    product_type: 'Tipo de Producto',
    cabinet_name: 'Nombre Cabinet',
    color_code: 'Código Color',
    color_name: 'Nombre Color',
    rh: 'RH',
    assembled_flag: '¿Es Armado?',
    canto_puertas: 'Canto Puertas',
    line: 'Línea',
    use_destination: 'Destino',
    commercial_measure: 'Medida Comercial',
    accessory_text: 'Accesorios',
    designation: 'Designación',
    width_cm: 'Ancho (cm)',
    depth_cm: 'Fondo (cm)',
    height_cm: 'Alto (cm)',
    weight_kg: 'Peso (kg)',
    final_name_es: 'Nombre Final (ES)',
    final_name_en: 'Nombre Final (EN)',
    bisagras: 'Bisagras',
    carb2: 'CARB2',
    special_label: 'Etiqueta Especial',
    barcode_text: 'Código Barras',
    private_label_flag: 'Marca Propia',
    private_label_client_name: 'Cliente Marca Propia',
    armado_con_lvm: 'Armado con LVM',
    status: 'Estado'
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-3xl font-black text-red-600 flex items-center gap-3 animate-bounce">
            <Skull className="w-8 h-8" />
            ¡¡¡¿¿¿NAANI???!!!
            <Skull className="w-8 h-8" />
          </DialogTitle>
          <DialogDescription className="text-xl font-bold text-slate-900 border-b pb-4">
            ¿ESTÁS TOTALMENTE SEGURO DE LO QUE VAS A HACER? 
            <span className="block text-sm font-normal text-slate-500 mt-1 italic">
              "Un gran poder conlleva una gran responsabilidad... y no queremos que explote la base maestra."
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 flex-1 overflow-hidden flex flex-col">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2 text-amber-600 shrink-0">
            <AlertTriangle className="w-4 h-4" />
            Detección de cambios detectada (Escaneo nivel Super Saiyajin):
          </p>
          
          <ScrollArea className="flex-1 rounded-md border border-slate-200 bg-slate-50/50">
            <Table className="table-fixed w-full">
              <TableHeader className="bg-slate-100 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="font-bold w-[140px]">Propiedad</TableHead>
                  <TableHead className="font-bold text-red-500">Antes</TableHead>
                  <TableHead className="font-bold text-green-600">Después</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((key) => {
                  const before = initialData[key] === null || initialData[key] === undefined || initialData[key] === '' ? 'VACÍO' : String(initialData[key])
                  const after = currentData[key] === null || currentData[key] === undefined || currentData[key] === '' ? 'VACÍO' : String(currentData[key])
                  
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium text-slate-500 text-[10px] uppercase break-words">{fieldLabels[key] || key}</TableCell>
                      <TableCell className="text-slate-400 line-through decoration-red-300 text-[11px] break-all">{before}</TableCell>
                      <TableCell className="font-bold text-slate-900 text-[11px] break-all">{after}</TableCell>
                    </TableRow>
                  )
                })}
                {diffs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-slate-400 italic">
                      No hay cambios reales... ¿Me estás trolleando?
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <DialogFooter className="flex flex-col gap-2 p-6 bg-slate-50 border-t border-slate-100 shrink-0 sm:flex-col sm:justify-center sm:space-x-0">
          <Button 
            onClick={onConfirm}
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-11 text-sm font-black shadow-md shadow-green-100 transition-all uppercase tracking-wider"
          >
            Omaewa... mou shindeiru... ¡HÁGALO!
          </Button>
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="w-full text-slate-500 hover:text-red-600 hover:bg-red-50 gap-2 h-10 text-xs font-bold transition-all"
          >
            <Ghost className="w-4 h-4" />
            Perdónenme todos, no acecto! ;-;
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
