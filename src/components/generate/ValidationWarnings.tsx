'use client'

import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'
import { resolveBarcodeFormat, validateBarcodeValue } from '@/lib/export/barcodeUtils'

export interface TemplateValidationIssue {
    field: string
    reason: 'missing' | 'invalid'
    message: string
}

interface ProductWarning {
    productCode: string
    productName: string
    issues: TemplateValidationIssue[]
    missingFields?: string[]
}

interface ValidationWarningsProps {
    warnings: ProductWarning[]
    compact?: boolean
}

const FIELD_LABELS: Record<string, string> = {
    final_name_es: 'Nombre final (ES)',
    final_name_en: 'Nombre final (EN)',
    barcode_text: 'Código de barras EAN',
    code: 'Código SKU',
    isometric_asset_id: 'Imagen isométrica',
    isometric_path: 'Imagen isométrica',
    commercial_measure: 'Medida comercial',
    weight_kg: 'Peso (kg)',
    width_cm: 'Ancho (cm)',
    depth_cm: 'Profundidad (cm)',
    height_cm: 'Alto (cm)',
    sap_description: 'Descripción SAP',
    product_name: 'Nombre del gabinete',
    color_code: 'Código de color',
    familia_code: 'Familia',
}

export function fieldLabel(field: string): string {
    return FIELD_LABELS[field] || field
}

export function issueLabel(issue: TemplateValidationIssue): string {
    if (issue.field === 'barcode_text' && issue.reason === 'missing') return 'Código de barras EAN faltante'
    if (issue.field === 'barcode_text' && issue.reason === 'invalid') return 'Código de barras EAN inválido'
    if (issue.field === 'code' && issue.reason === 'missing') return 'Código SKU faltante'
    if (issue.field === 'code' && issue.reason === 'invalid') return 'Código SKU inválido'
    return issue.reason === 'invalid'
        ? `${fieldLabel(issue.field)} inválido`
        : fieldLabel(issue.field)
}

function normalizeWarningIssues(warning: ProductWarning): TemplateValidationIssue[] {
    if (Array.isArray(warning.issues)) return warning.issues
    return (warning.missingFields || []).map(field => ({
        field,
        reason: 'missing' as const,
        message: `${fieldLabel(field)} faltante.`,
    }))
}

export function ValidationWarnings({ warnings, compact = false }: ValidationWarningsProps) {
    const warningsWithIssues = warnings
        .map(w => ({ ...w, issues: normalizeWarningIssues(w) }))
        .filter(w => w.issues.length > 0)

    const productosConProblemas = warningsWithIssues.length
    const productosOk = warnings.length - productosConProblemas
    const totalIssues = warningsWithIssues.reduce((acc, w) => acc + w.issues.length, 0)

    if (warnings.length === 0) return null

    if (productosConProblemas === 0) {
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
                    <span className="font-semibold">{productosConProblemas}</span> producto(s) con datos faltantes o inválidos
                    ({totalIssues} incidencia(s))
                </span>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-200 bg-amber-50">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">
                        Advertencias de exportación
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                        {productosConProblemas} producto(s) tienen campos requeridos por la plantilla faltantes o inválidos.
                        {productosOk > 0 && ` ${productosOk} producto(s) están completos.`}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full font-medium">
                    <Info className="w-3 h-3" />
                    Exportación bloqueada
                </div>
            </div>

            <div className="divide-y divide-amber-100 max-h-56 overflow-y-auto">
                {warningsWithIssues.map((w) => (
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
                                {w.issues.map((issue) => (
                                    <span
                                        key={`${issue.field}-${issue.reason}`}
                                        className="inline-flex items-center text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                                    >
                                        {issueLabel(issue)}
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

interface TemplateRequirement {
    type?: string
    dataField?: string
    content?: string
    required?: boolean
}

export function hasIsometric(product: Record<string, unknown>): boolean {
    return Boolean(product.isometric_asset_id || product.isometric_path)
}

export function getTemplateValidationIssues(product: Record<string, unknown>, requirements: TemplateRequirement[]): TemplateValidationIssue[] {
    const issues: TemplateValidationIssue[] = []

    for (const req of requirements) {
        if (req.type === 'barcode' && req.dataField) {
            const format = resolveBarcodeFormat(req)
            const result = validateBarcodeValue(product[req.dataField], format)
            if (!result.ok) {
                issues.push({
                    field: req.dataField,
                    reason: result.errorCode === 'missing' ? 'missing' : 'invalid',
                    message: result.errorMessage || `${fieldLabel(req.dataField)} inválido.`,
                })
            }
            continue
        }

        if (req.dataField) {
            const val = product[req.dataField]
            if (val === null || val === undefined || val === '') {
                issues.push({
                    field: req.dataField,
                    reason: 'missing',
                    message: `${fieldLabel(req.dataField)} faltante.`,
                })
            }
        }

        if (req.type === 'image') {
            const isIsometric = (
                req.content === 'isometrico_placeholder' ||
                req.content === 'Isométrico' ||
                req.dataField === 'isometric_path' ||
                req.dataField === 'isometric_asset_id'
            )
            if (isIsometric && !hasIsometric(product)) {
                issues.push({
                    field: 'isometric_asset_id',
                    reason: 'missing',
                    message: 'Imagen isométrica faltante.',
                })
            }
        }
    }

    return issues.filter((issue, index, arr) =>
        arr.findIndex(candidate => candidate.field === issue.field && candidate.reason === issue.reason) === index
    )
}

export function getMissingFields(product: Record<string, unknown>, requirements: TemplateRequirement[]): string[] {
    return getTemplateValidationIssues(product, requirements).map(issue => issue.field)
}

export function getTemplateRequiredFields(elementsJson: string): TemplateRequirement[] {
    try {
        const elements: TemplateRequirement[] = JSON.parse(elementsJson)
        return elements.filter(el => el.required === true)
    } catch {
        return []
    }
}
