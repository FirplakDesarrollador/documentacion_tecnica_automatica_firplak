'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
    Printer,
    Search,
    X,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Settings2,
    ChevronDown,
    ChevronUp,
    FileText,
    Download,
    Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

import { TemplatePicker, type TemplateOption } from '@/components/generate/TemplatePicker'
import { GenerateProductTable, type GenerateProduct } from '@/components/generate/GenerateProductTable'
import { getTemplateRequiredFields, getTemplateValidationIssues } from '@/components/generate/ValidationWarnings'
import { hydrateTemplateElements } from '@/lib/export/exportUtils'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import type { ProductPayload } from '@/lib/engine/translator'
import { PIXELS_PER_MM } from '@/lib/constants'
import {
    PRINT_TARGET_3NSTAR,
    normalizePrintTarget,
    resolveThermalPrintLayout,
} from '@/lib/printLayout'
import { getFilteredProducts, resolvePrintAssetsAction, resolveZoneHomeEnForPrintAction } from '@/app/print/actions'
import { resolvePublicDocumentUrlsForProductAction } from '@/app/templates/actions'
import { defaultPrintSettings, normalizePrintColorMode, PRINT_SETTINGS_KEY } from '@/lib/printSettings'
import { convertImageBlobToTspl } from '@/lib/print/browserTspl'
import {
    getWebUsbErrorMessage,
    isWebUsbSupported,
    reconnectAuthorizedWebUsbPrinter,
    requestWebUsbPrinter,
    sendWebUsbPrintJob,
    type WebUsbPrinterConnection,
} from '@/lib/print/webusb'
import {
    buildPrintRuntimeValues,
    isValidOfNumber,
    normalizeOfNumberInput,
    PRINT_RUNTIME_VARIABLE_KEYS,
    templateUsesPrintRuntimeVariable,
} from '@/lib/templates/printRuntimeVariables'
import { appendLabelBoxSuffix, expandLabelBoxProducts } from '@/lib/engine/labelParts'
import { attachDocumentQrUrls, collectRelatedDocumentQrSlots } from '@/lib/templates/documentQrFields'

interface PrintClientProps {
    templates: TemplateOption[]
    rules: Record<string, unknown>[]
}

type PrintStatus = 'pending' | 'printing' | 'done' | 'error'

interface PrintJob {
    id: string
    product: GenerateProduct
    copies: number
    ofNumber?: string | null
}

interface PrintItem extends PrintJob {
    status: PrintStatus
    error?: string
}

interface OfPrintEntry {
    id: string
    ofNumber: string
    copies: number
}

const PRINTER_CONFIG_KEY = 'samiGen-printer-config'
const PRINT_AGENT_VERSION = '1.0.6'
const PRINT_AGENT_DOWNLOAD_URL = `/downloads/samigen-print-agent-setup-${PRINT_AGENT_VERSION}.exe`
const PRINT_AGENT_PORTABLE_URL = `/downloads/samigen-print-agent-portable-${PRINT_AGENT_VERSION}.zip`
const PRINT_RENDER_TIMEOUT_MS = 45000
const PRINT_AGENT_TIMEOUT_MS = 60000
const PRINT_AGENT_HEALTH_TIMEOUT_MS = 12000
const PRINT_AGENT_CHECK_INTERVAL_MS = 15000
const PRINT_AGENT_OFFLINE_FAILURES = 3
const MIN_PRINT_COPIES = 1
const MAX_PRINT_COPIES = 999
const CORE_FIRPLAK_SOURCE = 'core_firplak'
const GENERIC_DATASETS_SOURCE = 'custom_datasets'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PrintFormat = 'pdf' | 'jpg'
type PrintTransport = 'local_agent' | 'webusb'
type DocumentQrTemplateElement = {
    type?: string
    documentQrMode?: string | null
    documentSlot?: string | null
}

interface PrinterConfig {
    transport: PrintTransport
    agentUrl: string
    printerName: string
}

interface AgentHealth {
    printers: string[]
    printerDetected: boolean
    supportsJobMetadata: boolean
}

type PrintRuntimeOverrides = {
    ofNumber?: string | null
    copies?: number
}

const defaultPrinterConfig: PrinterConfig = {
    transport: 'local_agent',
    agentUrl: 'http://127.0.0.1:3344',
    printerName: '3nStar LTT334',
}

function getSavedPrintColorMode() {
    if (typeof window === 'undefined') return defaultPrintSettings.colorMode
    const saved = window.localStorage.getItem(PRINT_SETTINGS_KEY)
    if (!saved) return defaultPrintSettings.colorMode

    try {
        return normalizePrintColorMode(JSON.parse(saved)?.colorMode)
    } catch {
        return defaultPrintSettings.colorMode
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function normalizeAgentHealth(value: unknown): AgentHealth {
    if (!isRecord(value)) {
        return { printers: [], printerDetected: false, supportsJobMetadata: false }
    }

    const capabilities = isRecord(value.capabilities) ? value.capabilities : {}
    const printers = Array.isArray(value.printers)
        ? value.printers.filter((printer): printer is string => typeof printer === 'string')
        : []

    return {
        printers,
        printerDetected: value.printerDetected === true,
        supportsJobMetadata: capabilities.jobMetadata === true,
    }
}

function normalizeAgentBaseUrl(value: string): string {
    const trimmed = value.trim()
    const fallback = defaultPrinterConfig.agentUrl
    if (!trimmed) return fallback

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    try {
        const url = new URL(withProtocol)
        url.pathname = url.pathname.replace(/\/(?:health|ping|scan-usb|print)\/?$/i, '')
        url.search = ''
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch {
        return trimmed
            .replace(/\/(?:health|ping|scan-usb|print)\/?$/i, '')
            .replace(/\/+$/, '') || fallback
    }
}

function normalizePrintTransport(value: unknown): PrintTransport {
    return value === 'webusb' ? 'webusb' : 'local_agent'
}

function isExternalTemplateDataSource(value: string | null | undefined): boolean {
    const dataSource = String(value || CORE_FIRPLAK_SOURCE).trim()
    return dataSource === GENERIC_DATASETS_SOURCE || UUID_RE.test(dataSource)
}

function normalizePrinterConfig(value: unknown): PrinterConfig {
    if (!isRecord(value)) return defaultPrinterConfig

    return {
        transport: normalizePrintTransport(value.transport),
        agentUrl: typeof value.agentUrl === 'string'
            ? normalizeAgentBaseUrl(value.agentUrl)
            : defaultPrinterConfig.agentUrl,
        printerName: typeof value.printerName === 'string' && value.printerName.trim()
            ? value.printerName
            : defaultPrinterConfig.printerName,
    }
}

function normalizePrintCopyCount(value: number): number {
    if (!Number.isFinite(value)) return MIN_PRINT_COPIES
    return Math.max(MIN_PRINT_COPIES, Math.min(MAX_PRINT_COPIES, Math.trunc(value)))
}

function parsePrintCopyCount(value: string): number {
    return normalizePrintCopyCount(Number.parseInt(value, 10))
}

function hasDuplicateOfNumbers(entries: OfPrintEntry[]): boolean {
    const seen = new Set<string>()

    for (const entry of entries) {
        if (!isValidOfNumber(entry.ofNumber)) continue
        if (seen.has(entry.ofNumber)) return true
        seen.add(entry.ofNumber)
    }

    return false
}

function isDuplicateOfNumber(entries: OfPrintEntry[], ofNumber: string): boolean {
    if (!isValidOfNumber(ofNumber)) return false
    return entries.filter(entry => entry.ofNumber === ofNumber).length > 1
}

function getTimeoutSignal(timeoutMs: number) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(timeoutMs)
    }

    const controller = new AbortController()
    window.setTimeout(() => controller.abort(), timeoutMs)
    return controller.signal
}

async function attachResolvedDocumentQrUrls(
    product: GenerateProduct,
    elements: DocumentQrTemplateElement[]
): Promise<GenerateProduct> {
    const slots = collectRelatedDocumentQrSlots(elements)
    if (slots.length === 0) return product

    try {
        const urls = await resolvePublicDocumentUrlsForProductAction(product as unknown as Record<string, unknown>, slots)
        return attachDocumentQrUrls(product as unknown as Record<string, unknown>, urls) as unknown as GenerateProduct
    } catch {
        return product
    }
}

function getPrintRequestError(err: unknown, fallback: string) {
    if (err instanceof DOMException && err.name === 'TimeoutError') return fallback
    if (err instanceof DOMException && err.name === 'AbortError') return fallback
    return (err as Error)?.message || fallback
}

function getAgentCheckErrorMessage(err: unknown) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        return 'La comprobacion del agente tardo mas de lo esperado. Se conserva el ultimo estado valido.'
    }

    return (err as Error)?.message || 'No se pudo comprobar el agente local.'
}

export function PrintClient({ templates, rules }: PrintClientProps) {
    const [textFilter, setTextFilter] = useState('')
    const [products, setProducts] = useState<GenerateProduct[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templates[0]?.id ?? null)
    const [printFormat, setPrintFormat] = useState<PrintFormat>('pdf')
    const [copies, setCopies] = useState(1)
    const [showPrinterConfig, setShowPrinterConfig] = useState(false)
    const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(PRINTER_CONFIG_KEY)
            if (saved) {
                try { return normalizePrinterConfig(JSON.parse(saved)) } catch { /* ignore */ }
            }
        }
        return defaultPrinterConfig
    })

    const [printItems, setPrintItems] = useState<PrintItem[]>([])
    const [isPrinting, setIsPrinting] = useState(false)
    const [showPrintDialog, setShowPrintDialog] = useState(false)
    const [showOfEntryDialog, setShowOfEntryDialog] = useState(false)
    const [ofEntries, setOfEntries] = useState<Record<string, OfPrintEntry[]>>({})
    const [agentOnline, setAgentOnline] = useState<boolean | null>(null)
    const [agentPrinters, setAgentPrinters] = useState<string[]>([])
    const [printerDetected, setPrinterDetected] = useState<boolean>(false)
    const [agentSupportsJobMetadata, setAgentSupportsJobMetadata] = useState<boolean>(false)
    const [agentCheckIssue, setAgentCheckIssue] = useState<string | null>(null)
    const [webUsbSupported, setWebUsbSupported] = useState(false)
    const [webUsbConnection, setWebUsbConnection] = useState<WebUsbPrinterConnection | null>(null)
    const [webUsbConnecting, setWebUsbConnecting] = useState(false)
    const [webUsbIssue, setWebUsbIssue] = useState<string | null>(null)
    const agentFailureCountRef = useRef(0)
    const agentHasRespondedRef = useRef(false)
    const agentCheckedUrlRef = useRef<string | null>(null)
    const ofEntryIdRef = useRef(0)

    const normalizedAgentUrl = useMemo(
        () => normalizeAgentBaseUrl(printerConfig.agentUrl),
        [printerConfig.agentUrl]
    )

    useEffect(() => {
        localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(printerConfig))
    }, [printerConfig])

    const checkAgent = useCallback(async () => {
        if (agentCheckedUrlRef.current !== normalizedAgentUrl) {
            agentCheckedUrlRef.current = normalizedAgentUrl
            agentFailureCountRef.current = 0
            agentHasRespondedRef.current = false
            setAgentOnline(null)
            setAgentPrinters([])
            setPrinterDetected(false)
            setAgentSupportsJobMetadata(false)
            setAgentCheckIssue(null)
        }

        try {
            const res = await fetch(`${normalizedAgentUrl}/health`, {
                cache: 'no-store',
                signal: getTimeoutSignal(PRINT_AGENT_HEALTH_TIMEOUT_MS),
            })
            if (res.ok) {
                const data = normalizeAgentHealth(await res.json())
                if (agentCheckedUrlRef.current !== normalizedAgentUrl) return

                agentFailureCountRef.current = 0
                agentHasRespondedRef.current = true
                setAgentOnline(true)
                setAgentPrinters(data.printers)
                setPrinterDetected(data.printerDetected)
                setAgentSupportsJobMetadata(data.supportsJobMetadata)
                setAgentCheckIssue(null)
            } else {
                throw new Error(`El agente respondio con estado HTTP ${res.status}.`)
            }
        } catch (err) {
            if (agentCheckedUrlRef.current !== normalizedAgentUrl) return

            agentFailureCountRef.current += 1
            setAgentCheckIssue(getAgentCheckErrorMessage(err))

            if (!agentHasRespondedRef.current || agentFailureCountRef.current >= PRINT_AGENT_OFFLINE_FAILURES) {
                setAgentOnline(false)
                setAgentPrinters([])
                setPrinterDetected(false)
                setAgentSupportsJobMetadata(false)
            }
        }
    }, [normalizedAgentUrl])

    useEffect(() => {
        if (printerConfig.transport !== 'local_agent') return

        checkAgent()
        const interval = setInterval(checkAgent, PRINT_AGENT_CHECK_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [checkAgent, printerConfig.transport])

    useEffect(() => {
        const supported = isWebUsbSupported()
        setWebUsbSupported(supported)
        if (!supported || printerConfig.transport !== 'webusb') return

        let cancelled = false
        reconnectAuthorizedWebUsbPrinter()
            .then((connection) => {
                if (cancelled) return
                if (connection) {
                    setWebUsbConnection(connection)
                    setWebUsbIssue(null)
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) setWebUsbIssue(getWebUsbErrorMessage(err))
            })

        return () => {
            cancelled = true
        }
    }, [printerConfig.transport])

    const connectWebUsbPrinter = useCallback(async () => {
        setWebUsbConnecting(true)
        setWebUsbIssue(null)

        try {
            const connection = await requestWebUsbPrinter()
            setWebUsbConnection(connection)
            toast.success(`Impresora WebUSB conectada: ${connection.deviceName}`)
        } catch (err: unknown) {
            const message = getWebUsbErrorMessage(err)
            setWebUsbIssue(message)
            setWebUsbConnection(null)
            toast.error(message)
        } finally {
            setWebUsbConnecting(false)
        }
    }, [])

    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId]
    )
    const selectedTemplateUsesExternalRows = isExternalTemplateDataSource(selectedTemplate?.data_source)
    const recordLabel = selectedTemplateUsesExternalRows ? 'registro' : 'producto'
    const recordLabelPlural = selectedTemplateUsesExternalRows ? 'registros' : 'productos'

    const templateRequiresOfNumber = useMemo(
        () => selectedTemplate
            ? templateUsesPrintRuntimeVariable(selectedTemplate.elements_json, PRINT_RUNTIME_VARIABLE_KEYS.ofNumber)
            : false,
        [selectedTemplate]
    )

    const selectedPrintTarget = normalizePrintTarget(selectedTemplate?.print_target)
    const requiresAgent = selectedPrintTarget === PRINT_TARGET_3NSTAR
    const selectedPrintTransport = printerConfig.transport
    const usesLocalAgent = requiresAgent && selectedPrintTransport === 'local_agent'
    const usesWebUsb = requiresAgent && selectedPrintTransport === 'webusb'
    const thermalLayout = useMemo(() => {
        if (!selectedTemplate || !requiresAgent) return null
        return resolveThermalPrintLayout({
            designWidthMm: selectedTemplate.width_mm,
            designHeightMm: selectedTemplate.height_mm,
            mediaWidthMm: selectedTemplate.media_width_mm,
            mediaLengthMm: selectedTemplate.media_length_mm,
            mediaGapMm: selectedTemplate.media_gap_mm,
        })
    }, [requiresAgent, selectedTemplate])

    const requiredFields = useMemo(
        () => selectedTemplate ? getTemplateRequiredFields(selectedTemplate.elements_json) : [],
        [selectedTemplate]
    )

    const validProducts = useMemo(() => {
        if (!selectedTemplate || requiredFields.length === 0) return products
        return products.filter(p => getTemplateValidationIssues(p, requiredFields).length === 0)
    }, [products, selectedTemplate, requiredFields])

    const selectedProducts = useMemo(
        () => validProducts.filter(p => selectedIds.includes(p.id)),
        [validProducts, selectedIds]
    )

    const createOfEntry = useCallback((productId: string): OfPrintEntry => {
        ofEntryIdRef.current += 1
        return {
            id: `${productId}:${ofEntryIdRef.current}`,
            ofNumber: '',
            copies: normalizePrintCopyCount(copies),
        }
    }, [copies])

    const addOfEntry = useCallback((productId: string) => {
        setOfEntries(prev => ({
            ...prev,
            [productId]: [...(prev[productId] ?? []), createOfEntry(productId)],
        }))
    }, [createOfEntry])

    const updateOfEntry = useCallback((
        productId: string,
        entryId: string,
        patch: Partial<Pick<OfPrintEntry, 'ofNumber' | 'copies'>>
    ) => {
        setOfEntries(prev => ({
            ...prev,
            [productId]: (prev[productId] ?? []).map(entry =>
                entry.id === entryId ? { ...entry, ...patch } : entry
            ),
        }))
    }, [])

    const removeOfEntry = useCallback((productId: string, entryId: string) => {
        setOfEntries(prev => {
            const entries = prev[productId] ?? []
            if (entries.length <= 1) return prev

            return {
                ...prev,
                [productId]: entries.filter(entry => entry.id !== entryId),
            }
        })
    }, [])

    const invalidOfProducts = useMemo(
        () => templateRequiresOfNumber
            ? selectedProducts.filter(product => {
                const entries = ofEntries[product.id] ?? []
                return entries.length === 0 ||
                    entries.some(entry =>
                        !isValidOfNumber(entry.ofNumber) ||
                        !Number.isInteger(entry.copies) ||
                        entry.copies < MIN_PRINT_COPIES ||
                        entry.copies > MAX_PRINT_COPIES
                    ) ||
                    hasDuplicateOfNumbers(entries)
            })
            : [],
        [ofEntries, selectedProducts, templateRequiresOfNumber]
    )

    const warnings = useMemo(() =>
        selectedProducts.map(p => ({
            productCode: p.code,
            productName: p.final_name_es || '',
            issues: getTemplateValidationIssues(p, requiredFields),
        })),
        [selectedProducts, requiredFields]
    )

    const hasWarnings = warnings.some(w => w.issues.length > 0)

    const allowedFormats = useMemo(() => {
        if (!selectedTemplate?.export_formats) return ['pdf', 'jpg']
        return selectedTemplate.export_formats.split(',').map((f: string) => f.trim().toLowerCase())
    }, [selectedTemplate])

    useEffect(() => {
        if (allowedFormats.length > 0 && !allowedFormats.includes(printFormat)) {
            setPrintFormat(allowedFormats[0] as PrintFormat)
        }
    }, [allowedFormats, printFormat])

    const [hasSearched, setHasSearched] = useState(false)

    const filteredOutCount = products.length - validProducts.length
    const canPrintWithAgent = agentOnline === true && printerDetected
    const canPrintWithWebUsb = webUsbSupported && webUsbConnection !== null
    const localAgentPrintIssueMessage = !usesLocalAgent
        ? null
        : agentOnline === null
        ? 'Verificando agente local'
        : agentOnline === false
        ? 'Instala o inicia el agente local'
        : !printerDetected
        ? 'Conecta la impresora USB'
        : !agentSupportsJobMetadata
        ? `Actualiza el agente local a la version ${PRINT_AGENT_VERSION}`
        : null
    const canPrintSelected = !requiresAgent || (
        thermalLayout?.ok === true &&
        (
            (usesLocalAgent && canPrintWithAgent && agentSupportsJobMetadata) ||
            (usesWebUsb && canPrintWithWebUsb)
        )
    )

    useEffect(() => {
        setSelectedIds([])
        setProducts([])
        setHasSearched(false)
        setShowOfEntryDialog(false)
        setOfEntries({})
    }, [selectedTemplateId])

    const handleSearch = useCallback(async () => {
        setLoading(true)
        setHasSearched(true)
        try {
            const result = await getFilteredProducts(textFilter || null, 1, 500, selectedTemplateId)
            setProducts(result.products as unknown as GenerateProduct[])
            setSelectedIds([])
        } catch (err: unknown) {
            toast.error('Error al cargar productos: ' + ((err as Error)?.message || 'Error desconocido'))
        } finally {
            setLoading(false)
        }
    }, [selectedTemplateId, textFilter])

    const handlePrintProduct = async (product: GenerateProduct, runtimeOverrides: PrintRuntimeOverrides = {}): Promise<boolean> => {
        if (!selectedTemplate) return false
        const printCopies = normalizePrintCopyCount(runtimeOverrides.copies ?? copies)
        const usesExternalRows = selectedTemplateUsesExternalRows || product.is_external === true

        const elements: Array<Record<string, unknown> & DocumentQrTemplateElement> = (() => {
            try { return JSON.parse(selectedTemplate.elements_json || '[]') }
            catch { return [] }
        })()

        const isUuid = (v: unknown): v is string =>
            typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

        const assetIds = elements
            .filter((el) =>
                (el.type === 'image' || el.type === 'dynamic_image') &&
                typeof el.content === 'string' &&
                isUuid(el.content)
            )
            .map((el) => el.content as string)

        const assetMap = await resolvePrintAssetsAction(assetIds)
        let updatedProduct: GenerateProduct & Record<string, unknown>

        if (usesExternalRows) {
            updatedProduct = {
                ...product,
                ...buildPrintRuntimeValues({ ofNumber: runtimeOverrides.ofNumber }),
            }
        } else {
            const engineResult = evaluateProductRules(product as unknown as Parameters<typeof evaluateProductRules>[0], rules as unknown as Parameters<typeof evaluateProductRules>[1])
            const finalNameEs = engineResult.finalNameEs || product.final_name_es || ''

            const { translateProductToEnglish } = await import('@/lib/engine/translator')
            const productType = (product.product_type || 'MUEBLE').toUpperCase()
            const translationResult = await translateProductToEnglish(product as unknown as ProductPayload, productType, engineResult.activeVariableIds)
            const finalNameEn = translationResult.translatedName || product.final_name_en || ''

            const zoneEn = await resolveZoneHomeEnForPrintAction(product.zone_home as string | null | undefined)
            updatedProduct = {
                ...product,
                final_name_es: finalNameEs,
                final_name_en: finalNameEn,
                zone_home_en: zoneEn || undefined,
                ...buildPrintRuntimeValues({ ofNumber: runtimeOverrides.ofNumber }),
            }
        }

        const labelBoxProducts = expandLabelBoxProducts(updatedProduct)
        const hasLabelBoxSet = labelBoxProducts.some(labelBoxProduct => labelBoxProduct._labelBoxTotal !== null)
        const widthPx = Math.round((selectedTemplate.width_mm || 200) * PIXELS_PER_MM)
        const heightPx = Math.round((selectedTemplate.height_mm || 100) * PIXELS_PER_MM)

        if (requiresAgent) {
            if (!thermalLayout?.ok) {
                throw new Error(thermalLayout?.message || 'La plantilla no tiene una salida 3nStar valida')
            }
            if (usesLocalAgent && !agentSupportsJobMetadata) {
                throw new Error(`Actualiza el agente local a la version ${PRINT_AGENT_VERSION} para imprimir con tamanos de etiqueta.`)
            }
            if (usesWebUsb && !webUsbConnection) {
                throw new Error('Conecta la impresora por WebUSB antes de imprimir.')
            }

            const preparedJobs: Array<{ blob: Blob; outputName: string }> = []

            for (const labelBoxProduct of labelBoxProducts) {
                const productWithDocumentQr = usesExternalRows
                    ? labelBoxProduct
                    : await attachResolvedDocumentQrUrls(labelBoxProduct as GenerateProduct, elements)
                const hydrated = await hydrateTemplateElements(elements, productWithDocumentQr, assetMap)
                const outputName = appendLabelBoxSuffix(product.code || 'etiqueta', labelBoxProduct)
                const imageResponse = await fetch('/api/print', {
                    method: 'POST',
                    signal: getTimeoutSignal(PRINT_RENDER_TIMEOUT_MS),
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateId: selectedTemplate.id,
                        productId: product.id,
                        isExternalSource: usesExternalRows,
                        format: 'jpg',
                        elements: hydrated,
                        width: widthPx,
                        height: heightPx,
                        templateFontFamily: selectedTemplate.template_font_family,
                        copies: 1,
                    }),
                })
                .catch((err: unknown) => {
                    throw new Error(getPrintRequestError(err, `La generacion de imagen para ${product.code} tardo demasiado.`))
                })

                if (!imageResponse.ok) {
                    const payload = await imageResponse.json().catch(() => null)
                    throw new Error(payload?.error || `Error al generar imagen para ${product.code}`)
                }

                const blob = await imageResponse.blob()
                if (!blob || blob.size <= 0) {
                    throw new Error(`Imagen vacia para ${product.code}`)
                }

                preparedJobs.push({ blob, outputName })
            }

            const sendPreparedJob = async (
                job: { blob: Blob; outputName: string },
                printCopies: number
            ) => {
                const colorMode = getSavedPrintColorMode()

                if (usesWebUsb) {
                    if (!webUsbConnection) {
                        throw new Error('Conecta la impresora por WebUSB antes de imprimir.')
                    }

                    const tspl = await convertImageBlobToTspl(job.blob, {
                        copies: printCopies,
                        colorMode,
                        mediaWidthMm: thermalLayout.mediaWidthMm,
                        mediaLengthMm: thermalLayout.mediaLengthMm,
                        mediaGapMm: thermalLayout.mediaGapMm,
                        rotation: thermalLayout.rotation,
                    })
                    await sendWebUsbPrintJob(webUsbConnection, tspl.bytes)
                    return
                }

                const formData = new FormData()
                formData.append('file', new File([job.blob], `${job.outputName}.jpg`, { type: 'image/jpeg' }))
                formData.append('copies', String(printCopies))
                formData.append('colorMode', colorMode)
                formData.append('job', JSON.stringify({
                    printTarget: PRINT_TARGET_3NSTAR,
                    designWidthMm: selectedTemplate.width_mm,
                    designHeightMm: selectedTemplate.height_mm,
                    mediaWidthMm: thermalLayout.mediaWidthMm,
                    mediaLengthMm: thermalLayout.mediaLengthMm,
                    mediaGapMm: thermalLayout.mediaGapMm,
                }))

                const agentResponse = await fetch(`${normalizedAgentUrl}/print`, {
                    method: 'POST',
                    signal: getTimeoutSignal(PRINT_AGENT_TIMEOUT_MS),
                    body: formData,
                })
                .catch((err: unknown) => {
                    throw new Error(getPrintRequestError(err, 'El agente local no respondio a tiempo. Revisa si la impresora quedo ocupada, apagada o con error.'))
                })

                if (!agentResponse.ok) {
                    const payload = await agentResponse.json().catch(() => null)
                    throw new Error(payload?.error || 'Error al enviar a la impresora local')
                }
            }

            for (const preparedJob of preparedJobs) {
                await sendPreparedJob(preparedJob, printCopies)
            }

            return true
        }

        const gameCount = hasLabelBoxSet ? printCopies : 1
        const requestCopies = hasLabelBoxSet ? 1 : printCopies

        for (let setIndex = 0; setIndex < gameCount; setIndex += 1) {
            for (const labelBoxProduct of labelBoxProducts) {
                const productWithDocumentQr = usesExternalRows
                    ? labelBoxProduct
                    : await attachResolvedDocumentQrUrls(labelBoxProduct as GenerateProduct, elements)
                const hydrated = await hydrateTemplateElements(elements, productWithDocumentQr, assetMap)
                const outputName = appendLabelBoxSuffix(product.code || 'etiqueta', labelBoxProduct)

                const response = await fetch('/api/print', {
                    method: 'POST',
                    signal: getTimeoutSignal(PRINT_RENDER_TIMEOUT_MS),
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateId: selectedTemplate.id,
                        productId: product.id,
                        isExternalSource: usesExternalRows,
                        format: printFormat,
                        elements: hydrated,
                        width: widthPx,
                        height: heightPx,
                        templateFontFamily: selectedTemplate.template_font_family,
                        copies: requestCopies,
                    }),
                })
                .catch((err: unknown) => {
                    throw new Error(getPrintRequestError(err, `La generacion del documento para ${product.code} tardo demasiado.`))
                })

                if (!response.ok) {
                    const payload = await response.json().catch(() => null)
                    throw new Error(payload?.error || `Error al generar documento para ${product.code}`)
                }

                const blob = await response.blob()
                if (!blob || blob.size <= 0) {
                    throw new Error(`Documento vacío para ${product.code}`)
                }

                const url = URL.createObjectURL(blob)
                const printWindow = window.open(url, '_blank')
                if (printWindow) {
                    printWindow.addEventListener('load', () => {
                        printWindow.print()
                    })
                } else {
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `${outputName}.${printFormat}`
                    document.body.appendChild(link)
                    link.click()
                    link.remove()
                }
                window.setTimeout(() => URL.revokeObjectURL(url), 5000)
            }
        }

        return true
    }

    const runPrintQueue = async (jobs?: PrintJob[]) => {
        const queue = jobs ?? selectedProducts.map((product): PrintJob => ({
            id: product.id,
            product,
            copies: normalizePrintCopyCount(copies),
        }))

        if (!selectedTemplate || queue.length === 0) return

        setIsPrinting(true)
        setShowPrintDialog(true)

        const items: PrintItem[] = queue.map(job => ({ ...job, status: 'pending' }))
        setPrintItems(items)

        let done = 0
        let errors = 0
        let sentCopies = 0

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'printing' } : p))

            try {
                await handlePrintProduct(item.product, { ofNumber: item.ofNumber, copies: item.copies })
                setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p))
                done++
                sentCopies += item.copies
            } catch (err: unknown) {
                setPrintItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: (err as Error)?.message } : p))
                errors++
            }
        }

        setIsPrinting(false)
        const baseMsg = `${done} registro(s), ${sentCopies} impresion(es) enviada(s)`
        toast.success(errors > 0 ? `${baseMsg}, ${errors} error(es)` : baseMsg)
    }

    const startPrinting = async () => {
        if (!selectedTemplate || selectedProducts.length === 0) return

        if (templateRequiresOfNumber) {
            setOfEntries(selectedProducts.reduce<Record<string, OfPrintEntry[]>>((next, product) => {
                next[product.id] = [createOfEntry(product.id)]
                return next
            }, {}))
            setShowOfEntryDialog(true)
            return
        }

        await runPrintQueue()
    }

    const startPrintingWithOfEntries = async () => {
        if (!selectedTemplate || selectedProducts.length === 0) return

        if (invalidOfProducts.length > 0) {
            toast.error('Cada registro debe tener OF de 4 digitos, sin repetir, y copias validas.')
            return
        }

        const jobs = selectedProducts.flatMap((product): PrintJob[] =>
            (ofEntries[product.id] ?? []).map(entry => ({
                id: entry.id,
                product,
                ofNumber: entry.ofNumber,
                copies: entry.copies,
            }))
        )

        setShowOfEntryDialog(false)
        setOfEntries({})
        await runPrintQueue(jobs)
    }

    const statusIcon = (status: PrintStatus) => {
        if (status === 'pending') return <Clock className="w-4 h-4 text-slate-300 shrink-0" />
        if (status === 'printing') return <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
        if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Template picker at the top */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700">Plantilla:</span>
                    <TemplatePicker
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        onSelect={setSelectedTemplateId}
                    />
                </div>
                {selectedTemplate && (
                    <span className="text-xs text-slate-400">
                        {selectedTemplate.width_mm}&times;{selectedTemplate.height_mm}mm
                        {requiresAgent && thermalLayout?.ok
                            ? ` - 3nStar ${thermalLayout.mediaWidthMm}x${thermalLayout.mediaLengthMm}mm - ${thermalLayout.message}`
                            : ` - ${selectedTemplate.orientation}`}
                    </span>
                )}
            </div>

            {!selectedTemplate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                    No hay plantillas activas. Crea una desde <Link href="/templates" className="underline">Plantillas</Link>.
                </div>
            )}

            {/* Single text search */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-lg">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <Input
                            type="text"
                            placeholder="Buscar por código, nombre, color..."
                            value={textFilter}
                            onChange={(e) => setTextFilter(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                            className="pl-9 pr-8 h-10 w-full"
                        />
                        {textFilter && (
                            <button
                                onClick={() => setTextFilter('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <Button onClick={handleSearch} disabled={loading} className="shrink-0">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                        Buscar
                    </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    {selectedTemplateUsesExternalRows
                        ? 'Busca en los campos disponibles de la base de datos asociada'
                        : 'Busca en codigo, nombre, color, referencia, medida comercial'}
                </p>
            </div>

            {/* Printer settings */}
            {selectedTemplate && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">Formato:</span>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                {allowedFormats.map((fmt) => (
                                    <button
                                        key={fmt}
                                        onClick={() => setPrintFormat(fmt as PrintFormat)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                            printFormat === fmt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {fmt.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500">Copias:</span>
                            <Input
                                type="number"
                                min={1}
                                max={999}
                                value={copies}
                                onChange={(e) => setCopies(parsePrintCopyCount(e.target.value))}
                                className="w-20 h-9 text-center"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPrinterConfig(!showPrinterConfig)}
                            className="text-slate-500 ml-auto"
                        >
                            <Settings2 className="w-4 h-4 mr-1" />
                            Conexi&oacute;n
                            {showPrinterConfig ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>
                    </div>

                    {showPrinterConfig && (
                        <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Agente de impresi&oacute;n
                                    </label>
                                    <div className="flex flex-wrap bg-slate-100 p-0.5 rounded-lg w-fit">
                                        <button
                                            type="button"
                                            onClick={() => setPrinterConfig(prev => ({ ...prev, transport: 'local_agent' }))}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                                selectedPrintTransport === 'local_agent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            USB directo con agente local
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPrinterConfig(prev => ({ ...prev, transport: 'webusb' }))}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                                selectedPrintTransport === 'webusb' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            Web USB
                                        </button>
                                    </div>
                                </div>

                                {selectedPrintTransport === 'local_agent' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        URL del agente
                                    </label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={printerConfig.agentUrl}
                                            onChange={(e) => setPrinterConfig(prev => ({ ...prev, agentUrl: e.target.value }))}
                                            onBlur={() => setPrinterConfig(prev => ({ ...prev, agentUrl: normalizeAgentBaseUrl(prev.agentUrl) }))}
                                            placeholder="http://127.0.0.1:3344"
                                            className="text-sm font-mono flex-1"
                                        />
                                        <Button variant="outline" size="sm" onClick={checkAgent}>
                                            Probar
                                        </Button>
                                    </div>
                                </div>
                                )}
                            </div>

                            {selectedPrintTransport === 'local_agent' && (
                            /* Agent status */
                            <div className={`rounded-xl px-4 py-3 text-sm border ${
                                agentOnline === true && (!requiresAgent || agentSupportsJobMetadata)
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : agentOnline === false
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                                    {agentOnline === true ? (
                                        requiresAgent && !agentSupportsJobMetadata ? (
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                    <span><strong>Actualiza el agente local</strong></span>
                                                </div>
                                                <p className="text-xs text-amber-600 mt-1">
                                                    Esta plantilla necesita metadata de tama&ntilde;o de etiqueta. Instala el agente {PRINT_AGENT_VERSION} para evitar impresiones con formato incorrecto.
                                                </p>
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <a
                                                        href={PRINT_AGENT_DOWNLOAD_URL}
                                                        download
                                                        className="inline-flex h-8 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-700 shadow-xs transition-colors hover:bg-amber-100"
                                                    >
                                                        <Download className="w-3.5 h-3.5 mr-1" />
                                                        Descargar actualizaci&oacute;n
                                                    </a>
                                                    <a
                                                        href={PRINT_AGENT_PORTABLE_URL}
                                                        download
                                                        className="inline-flex h-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                                    >
                                                        ZIP portable
                                                    </a>
                                                    <Button variant="ghost" size="sm" onClick={checkAgent} className="h-8 text-amber-700 hover:bg-amber-100">
                                                        Probar de nuevo
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : printerDetected ? (
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                                    <span>Impresora lista</span>
                                                    {agentPrinters.length > 0 && (
                                                        <span className="text-xs text-green-600">
                                                            ({agentPrinters.join(', ')})
                                                        </span>
                                                    )}
                                                </div>
                                                {agentCheckIssue && (
                                                    <p className="text-xs text-green-600 mt-1">
                                                        Ultima comprobacion lenta o intermitente. Se mantiene la conexion porque el agente respondio recientemente.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                    <span><strong>Conectar impresora</strong></span>
                                                </div>
                                                <p className="text-xs text-amber-600 mt-1">
                                                    El agente est&aacute; corriendo pero no detecta la impresora USB.
                                                    Verifica que la 3nStar (4BARCODE 4B-2054TG) est&eacute; conectada y encendida.
                                                </p>
                                            </div>
                                        )
                                    ) : agentOnline === false ? (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                <span><strong>Agente no instalado o no iniciado</strong></span>
                                            </div>
                                            <p className="text-xs text-amber-600 mt-1">
                                                Esta PC necesita el agente local para enviar etiquetas a la impresora USB.
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <a
                                                    href={PRINT_AGENT_DOWNLOAD_URL}
                                                    download
                                                    className="inline-flex h-8 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-700 shadow-xs transition-colors hover:bg-amber-100"
                                                >
                                                    <Download className="w-3.5 h-3.5 mr-1" />
                                                    Descargar agente de impresi&oacute;n
                                                </a>
                                                <a
                                                    href={PRINT_AGENT_PORTABLE_URL}
                                                    download
                                                    className="inline-flex h-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                                >
                                                    ZIP portable
                                                </a>
                                                <Button variant="ghost" size="sm" onClick={checkAgent} className="h-8 text-amber-700 hover:bg-amber-100">
                                                    Probar de nuevo
                                                </Button>
                                            </div>
                                            <ol className="text-xs text-amber-600 mt-3 ml-4 list-decimal space-y-1">
                                                <li>Descarga e instala el agente en esta PC.</li>
                                                <li>Conecta y enciende la impresora 3nStar/4BARCODE.</li>
                                                <li>Vuelve a esta pantalla y presiona <strong>Probar</strong>.</li>
                                            </ol>
                                            <p className="text-xs text-amber-600 mt-2">
                                                Si el instalador es bloqueado, descarga el ZIP portable, extrae la carpeta y ejecuta <code className="bg-amber-100 px-1 rounded">install-service.cmd</code>.
                                            </p>
                                        </div>
                                    ) : (
                                        <span>Verificando conexi&oacute;n...</span>
                                    )}
                            </div>
                            )}

                            {selectedPrintTransport === 'webusb' && (
                                <div className={`rounded-xl px-4 py-3 text-sm border ${
                                    webUsbConnection
                                        ? 'bg-green-50 border-green-200 text-green-700'
                                        : webUsbSupported
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-slate-50 border-slate-200 text-slate-500'
                                }`}>
                                    {webUsbConnection ? (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                                <span>WebUSB conectado</span>
                                                <span className="text-xs text-green-600">({webUsbConnection.deviceName})</span>
                                            </div>
                                            <p className="text-xs text-green-600 mt-1">
                                                La etiqueta se enviara directo por USB desde Chrome/Edge, sin usar el agente local.
                                            </p>
                                        </div>
                                    ) : webUsbSupported ? (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                                <span><strong>Conectar impresora por WebUSB</strong></span>
                                            </div>
                                            <p className="text-xs text-amber-600 mt-1">
                                                Presiona conectar y selecciona la 4BARCODE 4B-2054TG cuando Chrome/Edge muestre el permiso USB.
                                            </p>
                                            {webUsbIssue && (
                                                <p className="text-xs text-amber-700 mt-2">{webUsbIssue}</p>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={connectWebUsbPrinter}
                                                disabled={webUsbConnecting}
                                                className="mt-3 h-8 border-amber-300 text-amber-700 hover:bg-amber-100"
                                            >
                                                {webUsbConnecting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1" />}
                                                Conectar impresora USB
                                            </Button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                                <span><strong>WebUSB no soportado</strong></span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Usa Chrome o Edge actualizado en HTTPS, o cambia a USB directo con agente local.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Product table — only after search */}
            {!hasSearched ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <Search className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-lg font-medium">Selecciona filtros y presiona <strong>Buscar</strong></p>
                    <p className="text-sm">para ver los {recordLabelPlural} disponibles</p>
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : validProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <X className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-lg font-medium">Sin resultados</p>
                    <p className="text-sm">{products.length > 0 ? `${products.length} ${recordLabel}(s) incompleto(s) para esta plantilla` : 'Prueba con otros filtros o termino de busqueda'}</p>
                </div>
            ) : (
                <>
                {filteredOutCount > 0 && (
                    <p className="text-xs text-amber-600 -mt-3">
                        {filteredOutCount} {recordLabel}(s) oculto(s) por no cumplir con la plantilla
                    </p>
                )}
                <div className={selectedTemplateUsesExternalRows
                    ? 'overflow-x-auto [&_table]:min-w-full'
                    : 'overflow-x-auto [&_table]:w-full [&_table]:table-fixed [&_th:nth-child(1)]:w-10 [&_td:nth-child(1)]:w-10 [&_th:nth-child(2)]:w-36 [&_td:nth-child(2)]:w-36 [&_td:nth-child(2)]:whitespace-normal [&_td:nth-child(2)]:break-all [&_td:nth-child(2)]:overflow-hidden [&_th:nth-child(3)]:w-auto [&_td:nth-child(3)]:whitespace-normal [&_td:nth-child(3)]:break-words [&_td:nth-child(3)]:min-w-0 [&_th:nth-child(4)]:w-32 [&_td:nth-child(4)]:w-32 [&_td:nth-child(4)]:break-words'}>
                <GenerateProductTable
                    products={validProducts}
                    onSelectionChange={setSelectedIds}
                    selectedIds={selectedIds}
                    isExternalSource={selectedTemplateUsesExternalRows}
                    hideActions
                />
                </div>
                </>
            )}

            {/* Sticky footer with print button */}
            {selectedIds.length > 0 && selectedTemplate && (
                <div className="sticky bottom-4 z-20">
                    <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl shadow-xl px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {selectedIds.length}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">
                                    {selectedIds.length} {selectedIds.length > 1 ? recordLabelPlural : recordLabel} seleccionado{selectedIds.length > 1 ? 's' : ''}
                                    {' \u00b7 '}
                                    {copies} copia{copies > 1 ? 's' : ''} c/u
                                    {' \u00b7 '}
                                    {requiresAgent ? (usesWebUsb ? 'WEB USB' : '3NSTAR') : printFormat.toUpperCase()}
                                </p>
                                {hasWarnings ? (
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <XCircle className="w-3 h-3" />
                                        {warnings.filter(w => w.issues.length > 0).length} con datos incompletos
                                    </p>
                                ) : requiresAgent && thermalLayout?.ok !== true ? (
                                    <p className="text-xs text-amber-600 mt-0.5">{thermalLayout?.message || 'Configura la salida 3nStar'}</p>
                                ) : localAgentPrintIssueMessage ? (
                                    <p className="text-xs text-amber-600 mt-0.5">{localAgentPrintIssueMessage}</p>
                                ) : usesWebUsb && !webUsbSupported ? (
                                    <p className="text-xs text-amber-600 mt-0.5">WebUSB requiere Chrome o Edge compatible</p>
                                ) : usesWebUsb && !webUsbConnection ? (
                                    <p className="text-xs text-amber-600 mt-0.5">Conecta la impresora por WebUSB</p>
                                ) : (
                                    <p className="text-xs text-green-600 mt-0.5">Listo para imprimir</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Limpiar
                            </Button>
                            <Button
                                onClick={startPrinting}
                                disabled={
                                    isPrinting ||
                                    selectedProducts.length === 0 ||
                                    !canPrintSelected
                                }
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                title={
                                    requiresAgent && thermalLayout?.ok !== true
                                        ? thermalLayout?.message
                                        : localAgentPrintIssueMessage
                                        ? localAgentPrintIssueMessage
                                        : usesWebUsb && !webUsbSupported
                                        ? 'WebUSB requiere Chrome o Edge compatible'
                                        : usesWebUsb && !webUsbConnection
                                        ? 'Conecta la impresora por WebUSB antes de imprimir'
                                        : undefined
                                }
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                Imprimir ({selectedIds.length})
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* OF entry dialog */}
            <Dialog open={showOfEntryDialog} onOpenChange={(open) => {
                if (isPrinting) return
                setShowOfEntryDialog(open)
                if (!open) setOfEntries({})
            }}>
                <DialogContent className="max-w-3xl rounded-2xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <FileText className="w-5 h-5 text-indigo-500" />
                            Orden de fabricacion (OF)
                        </DialogTitle>
                        <DialogDescription>
                            Ingresa OF de 4 digitos y copias por cada producto seleccionado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-100 border-y border-slate-100">
                        {selectedProducts.map((product) => {
                            const entries = ofEntries[product.id] ?? []

                            return (
                                <div key={product.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(300px,390px)] gap-3 px-1 py-3 sm:items-start">
                                    <div className="min-w-0">
                                        <p className="font-mono text-sm font-semibold text-slate-800 truncate">
                                            {product.code}
                                        </p>
                                        {product.final_name_es && (
                                            <p className="text-xs text-slate-500 truncate">{product.final_name_es}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-[minmax(0,1fr)_36px_84px_36px] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            <span>OF</span>
                                            <span aria-hidden="true" />
                                            <span>Copias</span>
                                            <span aria-hidden="true" />
                                        </div>
                                        {entries.map((entry, entryIndex) => {
                                            const invalidOf = !isValidOfNumber(entry.ofNumber)
                                            const duplicateOf = isDuplicateOfNumber(entries, entry.ofNumber)
                                            const hasOfIssue = invalidOf || duplicateOf

                                            return (
                                                <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_36px_84px_36px] gap-2 items-start">
                                                    <div>
                                                        <Input
                                                            value={entry.ofNumber}
                                                            inputMode="numeric"
                                                            maxLength={4}
                                                            placeholder="1234"
                                                            onChange={(event) => updateOfEntry(product.id, entry.id, {
                                                                ofNumber: normalizeOfNumberInput(event.target.value),
                                                            })}
                                                            className={`h-9 font-mono text-center ${hasOfIssue ? 'border-rose-300 focus-visible:ring-rose-200' : ''}`}
                                                            aria-label={`OF ${product.code} ${entryIndex + 1}`}
                                                        />
                                                        {hasOfIssue && (
                                                            <p className="mt-1 text-[11px] text-rose-600">
                                                                {duplicateOf ? 'OF repetida' : '4 digitos requeridos'}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => addOfEntry(product.id)}
                                                        className="h-9 w-9"
                                                        aria-label={`Agregar OF ${product.code}`}
                                                        title="Agregar OF"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        min={MIN_PRINT_COPIES}
                                                        max={MAX_PRINT_COPIES}
                                                        value={entry.copies}
                                                        onChange={(event) => updateOfEntry(product.id, entry.id, {
                                                            copies: parsePrintCopyCount(event.target.value),
                                                        })}
                                                        className="h-9 text-center"
                                                        aria-label={`Copias ${product.code} ${entryIndex + 1}`}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeOfEntry(product.id, entry.id)}
                                                        disabled={entries.length <= 1}
                                                        className="h-9 w-9 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                                                        aria-label={`Quitar OF ${product.code} ${entryIndex + 1}`}
                                                        title="Quitar OF"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <DialogFooter className="shrink-0 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setShowOfEntryDialog(false)
                                setOfEntries({})
                            }}
                            disabled={isPrinting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={startPrintingWithOfEntries}
                            disabled={isPrinting || selectedProducts.length === 0 || invalidOfProducts.length > 0}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            Continuar e imprimir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Print progress dialog */}
            <Dialog open={showPrintDialog} onOpenChange={(open) => { if (!isPrinting) setShowPrintDialog(open) }}>
                <DialogContent className="max-w-lg rounded-2xl max-h-[80vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Printer className="w-5 h-5 text-indigo-500" />
                            Enviando a impresi&oacute;n
                            {isPrinting && <Loader2 className="w-4 h-4 animate-spin text-indigo-500 ml-1" />}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-50">
                        {printItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <Printer className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm">Preparando documentos...</p>
                            </div>
                        ) : (
                            printItems.map((item) => (
                                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${
                                    item.status === 'printing' ? 'bg-indigo-50/50' :
                                    item.status === 'done' ? 'bg-green-50/30' :
                                    item.status === 'error' ? 'bg-red-50/30' : ''
                                }`}>
                                    {statusIcon(item.status)}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-mono text-sm font-semibold text-slate-800 truncate">
                                            {item.product.code}
                                        </p>
                                        {item.product.final_name_es && (
                                            <p className="text-xs text-slate-400 truncate">{item.product.final_name_es}</p>
                                        )}
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {item.ofNumber ? `OF ${item.ofNumber} - ` : ''}{item.copies} impresion{item.copies > 1 ? 'es' : ''}
                                        </p>
                                        {item.error && (
                                            <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                                        )}
                                    </div>
                                    <Badge variant={
                                        item.status === 'done' ? 'default' :
                                        item.status === 'error' ? 'destructive' :
                                        item.status === 'printing' ? 'secondary' : 'outline'
                                    } className="text-[10px]">
                                        {item.status === 'done' ? 'Enviado' :
                                         item.status === 'error' ? 'Error' :
                                         item.status === 'printing' ? 'Imprimiendo...' : 'Pendiente'}
                                    </Badge>
                                </div>
                            ))
                        )}
                    </div>
                    {!isPrinting && (
                        <div className="flex justify-end pt-3 border-t border-slate-100">
                            <Button onClick={() => setShowPrintDialog(false)} variant="outline">
                                Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
