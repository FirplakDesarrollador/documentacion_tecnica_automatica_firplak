'use client'

import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'

interface ProductWarning {
    productCode: string
    productName: string
    missingFields: string[]
}

interface ValidationWarningsProps {
    warnings: ProductWarning[]
    /** Si true, sólo muestra un resumen colapsado */
    compact?: boolean
}

/** Mapeo de dataField a nombre legible en español */
const FIELD_LABELS: Record<string, string> = {
    final_name_es: 'Nombre final (ES)',
    final_name_en: 'Nombre final (EN)',
    barcode_text: 'Código de barras EAN',
    isometric_asset_id: 'Imagen isométrica',
    isometric_path: 'Imagen isométrica',
    commercial_measure: 'Medida comercial',
    weight_kg: 'Peso (kg)',
    width_cm: 'Ancho (cm)',
    depth_cm: 'Profundidad (cm)',
    height_cm: 'Alto (cm)',
    sap_description: 'Descripción SAP',
    cabinet_name: 'Nombre del gabinete',
    color_code: 'Código de color',
    familia_code: 'Familia',
}

export function fieldLabel(field: string): string {
    return FIELD_LABELS[field] || field
}

export function ValidationWarnings({ warnings, compact = false }: ValidationWarningsProps) {
    const productosConProblemas = warnings.filter(w => w.missingFields.length > 0)
    const productosOk = warnings.length - productosConProblemas.length
    const totalFaltantes = productosConProblemas.reduce((acc, w) => acc + w.missingFields.length, 0)

    if (warnings.length === 0) {
        return null
    }

    if (productosConProblemas.length === 0) {
        return (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">Todos los productos están completos para esta plantilla.</span>
            </div>
        )
    }

    if (compact) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                    <span className="font-semibold">{productosConProblemas.length}</span> producto(s) con datos incompletos
                    ({totalFaltantes} campo(s) faltante(s))
                </span>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-200 bg-amber-50">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">
                        Advertencias de exportación
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                        {productosConProblemas.length} producto(s) tienen campos requeridos por la plantilla incompletos.
                        {productosOk > 0 && ` ${productosOk} producto(s) están completos.`}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full font-medium">
                    <Info className="w-3 h-3" />
                    Aún puedes exportar
                </div>
            </div>

            {/* Lista de productos con problemas */}
            <div className="divide-y divide-amber-100 max-h-56 overflow-y-auto">
                {productosConProblemas.map((w) => (
                    <div key={w.productCode} className="flex items-start gap-3 px-4 py-3">
                        <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                                {w.productCode}
                                {w.productName && (
                                    <span className="text-slate-500 font-normal ml-1.5">— {w.productName}</span>
                                )}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {w.missingFields.map(f => (
                                    <span
                                        key={f}
                                        className="inline-flex items-center text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                                    >
                                        {fieldLabel(f)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Determina si un producto tiene isométrico asignado.
 * Acepta cualquiera de los dos campos como fuente válida.
 */
export function hasIsometric(product: Record<string, any>): boolean {
    return Boolean(product.isometric_asset_id || product.isometric_path)
}

/**
 * Dado un producto y los criterios requeridos por la plantilla,
 * retorna los nombres legibles de los campos/recursos que faltan.
 */
export function getMissingFields(product: Record<string, any>, requirements: any[]): string[] {
    const missing: string[] = []

    for (const req of requirements) {
        // 1. Validar campos de datos (dynamic_text con dataField)
        if (req.dataField) {
            const val = product[req.dataField]
            if (val === null || val === undefined || val === '') {
                missing.push(req.dataField)
            }
        }

        // 2. Validar marcadores de imagen de isométrico
        //    Usa la regla: isometric_asset_id OR isometric_path
        if (req.type === 'image') {
            const isIsometric = (
                req.content === 'isometrico_placeholder' ||
                req.content === 'Isométrico' ||
                req.dataField === 'isometric_path' ||
                req.dataField === 'isometric_asset_id'
            )
            if (isIsometric && !hasIsometric(product)) {
                missing.push('isometric_asset_id')
            }
        }
    }

    return Array.from(new Set(missing))
}

/**
 * Extrae los elementos requeridos de una plantilla.
 * Solo incluye elementos explícitamente marcados como required=true.
 * Los dynamic_text sin required=true NO se tratan como obligatorios.
 */
export function getTemplateRequiredFields(elementsJson: string): any[] {
    try {
        const elements: any[] = JSON.parse(elementsJson)
        return elements.filter(el => el.required === true)
    } catch {
        return []
    }
}
