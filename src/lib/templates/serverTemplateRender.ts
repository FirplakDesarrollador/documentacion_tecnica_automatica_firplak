import { hydrateTemplateElements } from '@/lib/export/exportUtils'
import { resolvePublicDocumentForProduct } from '@/lib/productDocuments'
import { supabaseServer } from '@/lib/supabase'
import {
    attachDocumentQrUrls,
    collectRelatedDocumentQrSlots,
} from './documentQrFields'
import {
    buildPrintRuntimeValues,
    isValidOfNumber,
    PRINT_RUNTIME_VARIABLE_KEYS,
    type TemplateRenderRuntimeValues,
} from './printRuntimeVariables'

export type ServerTemplateElement = Record<string, unknown> & {
    id?: unknown
    type?: unknown
    content?: unknown
    dataField?: unknown
}

type ServerTemplateRenderInput = {
    elementsJson: string | null | undefined
    context: Record<string, unknown>
    runtimeValues?: TemplateRenderRuntimeValues
    includePrintRuntime?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SYSTEM_ASSET_NAMES = [
    'Logo Firplak general',
    'Icono RH Fijo',
    'Icono Canto',
    'Icono Canto 1.5mm',
    'Icono CARB2',
    'Icono Cierre Lento',
    'Icono Extensión Total',
]

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asElement(value: unknown): ServerTemplateElement | null {
    return isRecord(value) ? value as ServerTemplateElement : null
}

export function parsePersistedTemplateElements(elementsJson: string | null | undefined): ServerTemplateElement[] {
    if (!elementsJson) return []

    try {
        const parsed = JSON.parse(elementsJson) as unknown
        return Array.isArray(parsed)
            ? parsed.map(asElement).filter((element): element is ServerTemplateElement => Boolean(element))
            : []
    } catch {
        return []
    }
}

function textValue(value: unknown, maxLength = 500): string | null {
    if (value === null || value === undefined) return null
    const normalized = String(value).trim()
    return normalized && normalized.length <= maxLength ? normalized : null
}

function getRuntimeContext(
    runtimeValues: TemplateRenderRuntimeValues | undefined,
    includePrintRuntime: boolean,
) {
    const ofNumber = textValue(runtimeValues?.ofNumber, 20)
    const partesTexto = textValue(runtimeValues?.partesTexto, 200)

    if (ofNumber && !isValidOfNumber(ofNumber)) {
        throw new Error('La OF debe tener exactamente 4 dígitos')
    }

    return {
        ...(includePrintRuntime ? buildPrintRuntimeValues({ ofNumber }) : {}),
        ...(partesTexto ? { [PRINT_RUNTIME_VARIABLE_KEYS.partesTexto]: partesTexto } : {}),
    }
}

function addAssetId(assetIds: Set<string>, value: unknown) {
    const id = textValue(value, 100)
    if (id && UUID_RE.test(id)) assetIds.add(id)
}

function collectAssetIds(elements: ServerTemplateElement[], context: Record<string, unknown>) {
    const assetIds = new Set<string>()
    for (const element of elements) {
        const type = textValue(element.type, 80)
        if (type === 'image' || type === 'dynamic_image') {
            addAssetId(assetIds, element.content)
        }
    }

    addAssetId(assetIds, context.private_label_logo_id)
    addAssetId(assetIds, context.isometric_asset_id)
    return [...assetIds]
}

function addSystemAssetAliases(map: Record<string, string>, name: string, filePath: string) {
    map[name] = filePath
    if (name === 'Logo Firplak general') map.logo_empresa = filePath
    if (name === 'Icono RH Fijo') map.sys_icon_rh = filePath
    if (name === 'Icono Canto') map.sys_icon_canto = filePath
    if (name === 'Icono Canto 1.5mm') map.sys_icon_edge_1_5mm = filePath
    if (name === 'Icono CARB2') map.sys_icon_carb2 = filePath
    if (name === 'Icono Cierre Lento') map.sys_icon_soft_close = filePath
    if (name === 'Icono Extensión Total') map.sys_icon_full_extension = filePath
}

async function resolveServerAssetMap(assetIds: string[]) {
    const map: Record<string, string> = {}
    const { data: systemAssets, error: systemError } = await supabaseServer
        .from('assets')
        .select('name, file_path')
        .in('name', SYSTEM_ASSET_NAMES)

    if (systemError) {
        console.error('No fue posible cargar los recursos del sistema para el render:', systemError)
    }

    for (const asset of (systemAssets ?? []) as Array<{ name: string | null; file_path: string | null }>) {
        if (!asset.name) continue
        addSystemAssetAliases(map, asset.name, asset.file_path || '')
    }

    if (assetIds.length === 0) return map

    const { data: customAssets, error: customError } = await supabaseServer
        .from('assets')
        .select('id, file_path')
        .in('id', assetIds)

    if (customError) {
        console.error('No fue posible cargar los recursos de la plantilla para el render:', customError)
    }

    for (const asset of (customAssets ?? []) as Array<{ id: string; file_path: string | null }>) {
        map[asset.id] = asset.file_path || ''
    }

    return map
}

async function attachRelatedDocumentQrUrls(
    context: Record<string, unknown>,
    elements: ServerTemplateElement[],
) {
    const slots = collectRelatedDocumentQrSlots(elements.map((element) => ({
        type: textValue(element.type, 80) || undefined,
        documentQrMode: textValue(element.documentQrMode, 80),
        documentSlot: textValue(element.documentSlot, 120),
        publicSlug: textValue(element.publicSlug, 500),
    })))
    if (slots.length === 0) return context

    try {
        const resolvedUrls = await Promise.all(slots.map(async (slot) => {
            const document = await resolvePublicDocumentForProduct(context, slot)
            return [slot, document?.publicUrl || null] as const
        }))
        return attachDocumentQrUrls(context, Object.fromEntries(resolvedUrls))
    } catch {
        // A document QR is optional: a document lookup failure hides it without blocking the export.
        return context
    }
}

export async function hydrateCoreTemplateForServerRender(input: ServerTemplateRenderInput) {
    const templateElements = parsePersistedTemplateElements(input.elementsJson)
    if (templateElements.length === 0) {
        throw new Error('La plantilla no contiene elementos válidos para renderizar')
    }

    const runtimeContext = getRuntimeContext(
        input.runtimeValues,
        input.includePrintRuntime === true,
    )
    const context = await attachRelatedDocumentQrUrls(
        { ...input.context, ...runtimeContext },
        templateElements,
    )
    const assetMap = await resolveServerAssetMap(collectAssetIds(templateElements, context))

    return hydrateTemplateElements(templateElements, context, assetMap)
}

export function findRequiredBarcodeErrors(elements: ServerTemplateElement[]) {
    return elements
        .filter((element) => element.type === 'barcode' && element.required === true && Boolean(element.barcodeError))
        .map((element) => ({
            dataField: textValue(element.dataField, 120),
            message: textValue(element.barcodeError, 500) || 'Código de barras inválido',
        }))
}
