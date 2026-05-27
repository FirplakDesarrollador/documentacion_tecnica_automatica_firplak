'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createProductAction, updateProductAction, getUniquePropertiesAction, parseProductCodeAction, translateAction, checkProductExistsAction, getDiagnosticInfoAction, getClientsAction, checkFamilyExistsAction, checkVersionExistsAction, upsertFamilyAction, saveGlossaryTermsAction, upsertColorAction } from './actions'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getColorByNameAction, getRulesAction } from '@/app/rules/actions'
import { evaluateProductRules } from '@/lib/engine/ruleEvaluator'
import { ArrowLeft, FileBadge2, AlertTriangle, Sparkles, Building2, Image as ImageIcon, Save, Box, ShieldCheck, History, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Product } from '@prisma/client'
import { UploadAssetButton } from '@/components/assets/UploadAssetButton'
import { ConfirmOverwriteModal } from '@/components/products/ConfirmOverwriteModal'
import { IsometricAssociationDialog } from '@/components/assets/IsometricAssociationDialog'
import { PostSaveExportModal } from '@/components/products/PostSaveExportModal'
import { MultiColorCreationModal } from '@/components/products/MultiColorCreationModal'
import { cn } from '@/lib/utils'

interface ProductFormProps {
    initialData?: any
    backHref?: string
    readOnly?: boolean
}

export function ProductForm({ initialData, backHref, readOnly = false }: ProductFormProps) {
    const isEdit = !!initialData
    const router = useRouter()
    const [dupeAlertModal, setDupeAlertModal] = useState<{
        id: string
        matchType: 'code' | 'sap_description' | 'both' | 'unknown'
        code?: string | null
        sap_description?: string | null
    } | null>(null)
    const [isConfirmingSave, setIsConfirmingSave] = useState(false)
    const [savedProduct, setSavedProduct] = useState<any>(null)
    const [showExportModal, setShowExportModal] = useState(false)
    const [showMultiColorModal, setShowMultiColorModal] = useState(false)
    const [allCreatedProducts, setAllCreatedProducts] = useState<any[]>([])
    const [customValues, setCustomValues] = useState({ line: '', designation: '', product_type: '', use_destination: '', zone_home: '', bisagras: '', carb2: '', rh: '', special_label: '', canto_puertas: '' })
    const [clients, setClients] = useState<{id: string, name: string, logo_asset_id?: string}[]>([])
    const initialPrivateName = (initialData?.private_label_client_name && String(initialData.private_label_client_name).trim() !== '' && String(initialData.private_label_client_name).toUpperCase() !== 'NA')
        ? String(initialData.private_label_client_name).trim()
        : ''
    const [overridePrivateLabel, setOverridePrivateLabel] = useState(false)
    const [versionPrivateLabelName, setVersionPrivateLabelName] = useState(initialPrivateName)
    const [privateLabelData, setPrivateLabelData] = useState({
        client_key: initialPrivateName || '',
        client_name: '',
        logo_id: initialData?.private_label_logo_id || ''
    })
    const [missingZoneTranslation, setMissingZoneTranslation] = useState<string | null>(null)
    const [zoneTranslation, setZoneTranslation] = useState('')
    const [missingGlossaryTerms, setMissingGlossaryTerms] = useState<string[]>([])
    const [glossaryDefinitions, setGlossaryDefinitions] = useState<Record<string, string>>({})
    const [resolvedTypeMissing, setResolvedTypeMissing] = useState<{key: string, value: string} | null>(null)
    const [hasBarcode, setHasBarcode] = useState(!!initialData?.barcode_text)
    const [fieldSources, setFieldSources] = useState<Record<string, string>>({})
    const [warnings, setWarnings] = useState<string[]>([])
    
    const [formData, setFormData] = useState({
        code: initialData?.code || '',
        sap_description: initialData?.sap_description || '',
        product_type: initialData?.product_type || '',
        product_name: initialData?.product_name || '',
        color_code: initialData?.color_code || '',
        color_name: initialData?.color_name || '',
        rh: initialData?.rh || 'NA',
        assembled_flag: initialData?.assembled_flag || false,
        canto_puertas: initialData?.canto_puertas || '',
        line: initialData?.line || '',
        use_destination: initialData?.use_destination || '',
        commercial_measure: initialData?.commercial_measure || '',
        accessory_text: initialData?.accessory_text || '',
        designation: initialData?.designation || '',
        width_cm: initialData?.width_cm ? String(initialData.width_cm) : '',
        depth_cm: initialData?.depth_cm ? String(initialData.depth_cm) : '',
        height_cm: initialData?.height_cm ? String(initialData.height_cm) : '',
        weight_kg: initialData?.weight_kg ? String(initialData.weight_kg) : '',
        stacking_max: initialData?.stacking_max ? String(initialData.stacking_max) : '',
        final_name_es: initialData?.final_name_es || '',
        final_name_en: initialData?.final_name_en || '',
        familia_code: initialData?.familia_code || '',
        ref_code: initialData?.ref_code || '',
        version_code: initialData?.version_code || '',
        zone_home: initialData?.zone_home || '',
        isometric_path: initialData?.isometric_path || '',
        isometric_asset_id: initialData?.isometric_asset_id || '',
        isometric_from_different_version: false,
        bisagras: initialData?.bisagras || 'NA',
        carb2: initialData?.carb2 || 'NA',
        special_label: initialData?.special_label || 'NA',
        status: initialData?.status || 'ACTIVO',
        barcode_text: initialData?.barcode_text || '',
        armado_con_lvm: initialData?.armado_con_lvm || '',
        door_color_text: initialData?.door_color_text || 'NA',
        version_label: initialData?.version_label || 'NA'
    })

    const [datalistOptions, setDatalistOptions] = useState({ 
        lines: [] as string[], 
        designations: [] as string[], 
        productTypes: [] as string[], 
        useDestinations: [] as string[], 
        productNames: [] as string[], 
        commercialMeasures: [] as string[], 
        accessoryTexts: [] as string[], 
        colors: [] as {code: string, name: string}[], 
        bisagras: [] as string[], 
        carb2: [] as string[], 
        specialLabels: [] as string[], 
        zoneHomes: [] as string[],
        rh: [] as string[],
        cantoPuertas: [] as string[],
        doorColorTexts: [] as string[],
        versionLabels: [] as string[]
    })

    const [isAnalyzed, setIsAnalyzed] = useState(isEdit)
    const [analysisSource, setAnalysisSource] = useState<'parser' | 'sku_match' | 'version_match' | 'reference_match' | 'composed' | null>(null)
    const [isNewFamily, setIsNewFamily] = useState(false)
    const [allowedLines, setAllowedLines] = useState<string[]>([])
    const [rules, setRules] = useState<any[]>([])
    const [familyData, setFamilyData] = useState({
        name: '',
        zone_home: '',
        line: '', // Deprecated
        allowed_lines: [] as string[],
        product_type: '',
        use_destination: '',
        rh_default: false,
        assembled_default: false,
        manufacturing_process: ''
    })
    const [familySaved, setFamilySaved] = useState(false)
    const [isNewColor, setIsNewColor] = useState(false)
    const [colorData, setColorData] = useState({ name: '' })
    const [colorSaved, setColorSaved] = useState(false)

    const [isNewVersion, setIsNewVersion] = useState(false)
    const [versionSaved, setVersionSaved] = useState(false)
    const [versionData, setVersionData] = useState({
        version_code: '',
        version_description: '',
        product_types: [] as string[],
        automatic_version_rules: {} as Record<string, string>
    })

    const OVERRIDE_FIELDS: { key: string; label: string; group: string; type: 'text' | 'number' | 'select'; options?: string[] }[] = [
        { key: 'rh', label: 'Material RH', group: 'Material', type: 'select', options: ['NA', 'RH'] },
        { key: 'bisagras', label: 'Bisagras', group: 'Material', type: 'text' },
        { key: 'carb2', label: 'CARB2', group: 'Material', type: 'text' },
        { key: 'canto_puertas', label: 'Canto Puertas', group: 'Material', type: 'text' },
        { key: 'accessory_text', label: 'Accesorios', group: 'Material', type: 'text' },
        { key: 'door_color_text', label: 'Color Puerta', group: 'Material', type: 'text' },
        { key: 'armado_con_lvm', label: 'Armado con LVM', group: 'Material', type: 'text' },
        { key: 'pur', label: 'PUR', group: 'Material', type: 'text' },
        { key: 'special_label', label: 'Etiqueta Especial', group: 'Etiquetas', type: 'text' },
        { key: 'version_label', label: 'Etiqueta de Versi\u00f3n', group: 'Etiquetas', type: 'text' },
        { key: 'private_label_client_name', label: 'Cliente / Marca Propia', group: 'Marca Propia', type: 'text' },
        { key: 'width_cm', label: 'Ancho (cm)', group: 'Dimensiones', type: 'number' },
        { key: 'depth_cm', label: 'Fondo (cm)', group: 'Dimensiones', type: 'number' },
        { key: 'height_cm', label: 'Alto (cm)', group: 'Dimensiones', type: 'number' },
        { key: 'weight_kg', label: 'Peso (kg)', group: 'Dimensiones', type: 'number' },
    ]

    const OVERRIDE_GROUPS = Array.from(new Set(OVERRIDE_FIELDS.map(f => f.group)))

    // Cargar reglas y opciones una vez
    useEffect(() => {
        getRulesAction().then(r => {
            if (Array.isArray(r)) setRules(r);
        });

        getUniquePropertiesAction().then(res => {
            setDatalistOptions(res as any);
        });

        getClientsAction().then(c => {
            setClients(c);
        })
    }, [isEdit, initialData])
    
    // Reset familySaved state if data changes
    useEffect(() => {
        setFamilySaved(false);
    }, [familyData.name, familyData.zone_home, familyData.line, familyData.product_type, familyData.use_destination]);

    useEffect(() => {
        setColorSaved(false);
    }, [colorData.name]);

    const handleCheckDupe = async (onSuccess: () => void) => {
        if (isEdit) {
            onSuccess(); // No checking dupes in edit mode
            return;
        }
        if (!formData.code && !formData.sap_description) {
            if (!isAnalyzed) setIsAnalyzed(true)
            return
        }
        const exist = await checkProductExistsAction(formData.code, formData.sap_description)
        if (exist) {
            setDupeAlertModal(exist)
        } else {
            onSuccess()
        }
    }

    // ── Validación Estricta de Formato SKU ──
    const validateSkuFormat = (code: string): string | null => {
        if (!code || !code.trim()) return 'El código es obligatorio.';
        const parts = code.trim().split('-');
        if (parts.length < 4) {
            const missing = parts.length === 3 ? 'el código de color' 
                : parts.length === 2 ? 'la versión y el color' 
                : 'la referencia, versión y color';
            return `Código incompleto. Falta ${missing}.`;
        }
        const [fam, ref, ver, col] = parts;
        if (fam.length !== 6 || !/^[VCP][A-Z0-9]{5}$/i.test(fam)) {
            return `Familia "${fam}" inválida. Debe tener 6 caracteres y empezar con V, C o P.`;
        }
        if (ref.length !== 4 || !/^[A-Z0-9]{4}$/i.test(ref)) {
            return `Referencia "${ref}" inválida. Debe tener exactamente 4 caracteres alfanuméricos.`;
        }
        if (ver.length !== 3 || !/^[A-Z0-9]{3}$/i.test(ver)) {
            return `Versión "${ver}" inválida. Debe tener exactamente 3 caracteres alfanuméricos.`;
        }
        if (col.length !== 4 || !/^\d{4}$/.test(col)) {
            return `Color "${col}" inválido. Debe tener exactamente 4 dígitos numéricos.`;
        }
        return null;
    }

    const handleAutoProcess = async () => {
        handleCheckDupe(async () => {
            const formatError = validateSkuFormat(formData.code);
            if (formatError) {
                toast.error("Código inválido", { description: formatError + ' Formato requerido: FAM-REF-VER-COL' });
                return;
            }
                const parsed = await parseProductCodeAction(formData.code, formData.sap_description, formData.rh === 'RH')
                
                let colorName = formData.color_name
                if (parsed.color_code && parsed.color_code !== formData.color_code) {
                    const foundColor = await getColorByNameAction(parsed.color_code)
                    if (foundColor) colorName = foundColor
                }

                // Aplicar líneas permitidas si vienen del parser (familia existente)
                if (parsed.allowed_lines && parsed.allowed_lines.length > 0) {
                    setAllowedLines(parsed.allowed_lines)
                    // Si solo hay una línea permitida y el producto no tiene una, la pre-seleccionamos
                    if (parsed.allowed_lines.length === 1 && !formData.line) {
                        setFormData(p => ({ ...p, line: parsed.allowed_lines![0] }))
                    }
                } else {
                    setAllowedLines([])
                }

                setFormData(prev => ({
                    ...prev,
                    familia_code: parsed.familia_code || prev.familia_code || '',
                    ref_code: parsed.ref_code || prev.ref_code || '',
                    version_code: parsed.version_code || prev.version_code || '',
                    color_code: parsed.color_code || prev.color_code || '',
                    color_name: colorName || parsed.color_name || prev.color_name || '',
                    product_name: parsed.product_name || prev.product_name || '',
                    line: parsed.line || prev.line || '',
                    designation: parsed.designation || prev.designation || '',
                    commercial_measure: parsed.commercial_measure || prev.commercial_measure || '',
                    accessory_text: parsed.accessory_text || prev.accessory_text || '',
                    width_cm: parsed.width_cm !== null ? String(parsed.width_cm) : prev.width_cm,
                    depth_cm: parsed.depth_cm !== null ? String(parsed.depth_cm) : prev.depth_cm,
                    height_cm: parsed.height_cm !== null ? String(parsed.height_cm) : prev.height_cm,
                    weight_kg: parsed.weight_kg !== null ? String(parsed.weight_kg) : prev.weight_kg,
                    use_destination: parsed.use_destination || prev.use_destination || '',
                    zone_home: parsed.zone_home || prev.zone_home || '',
                    product_type: parsed.product_type || prev.product_type || '',
                    rh: parsed.rh || prev.rh || 'NA',
                    bisagras: parsed.bisagras || prev.bisagras || 'NA',
                    carb2: parsed.carb2 || prev.carb2 || 'NA',
                    canto_puertas: parsed.canto_puertas || prev.canto_puertas || '',
                    special_label: parsed.special_label || prev.special_label || 'NA',
                    barcode_text: parsed.barcode_text || prev.barcode_text || '',
                    isometric_path: (parsed.isometric_path && parsed.isometric_path !== 'null') ? parsed.isometric_path : prev.isometric_path,
                    isometric_asset_id: parsed.isometric_asset_id || prev.isometric_asset_id || '',
                    isometric_from_different_version: !!parsed.isometric_from_different_version,
                    status: parsed.status || prev.status || 'ACTIVO',
                    armado_con_lvm: parsed.armado_con_lvm || prev.armado_con_lvm || '',
                    assembled_flag: (parsed.assembled_flag !== undefined) ? parsed.assembled_flag : prev.assembled_flag,
                    version_label: parsed.version_label || prev.version_label || 'NA',
                    door_color_text: parsed.door_color_text || prev.door_color_text || 'NA'
                }))

                // Marca propia calculada por versión (si existe en global_version_rules)
                const parsedPrivate = parsed.private_label_client_name && String(parsed.private_label_client_name).trim().toUpperCase() !== 'NA'
                    ? String(parsed.private_label_client_name).trim()
                    : ''
                setVersionPrivateLabelName(parsedPrivate)
                if (!overridePrivateLabel) {
                    setPrivateLabelData(p => ({
                        ...p,
                        client_key: parsedPrivate || '',
                        client_name: ''
                    }))
                }

                if (parsed.barcode_text) setHasBarcode(true)
                if (!isAnalyzed) setIsAnalyzed(true)
                setAnalysisSource((parsed as any)._source || 'parser')
                setFieldSources(parsed.inheritance_sources || {})
                if (parsed.warnings && parsed.warnings.length > 0) {
                    setWarnings(parsed.warnings)
                    parsed.warnings.forEach((w: string) => toast.warning(w))
                } else {
                    setWarnings([])
                }

                // Verificación de Familia
                const familyExists = await checkFamilyExistsAction(formData.code)
                if (!familyExists) {
                    setIsNewFamily(true)
                    const guessedType = parsed.product_type || 'MUEBLE'
                    const guessedZone = parsed.zone_home || 'ZONA'
                    
                    const newFamilyData = {
                        name: parsed.familia_code || '',
                        zone_home: guessedZone,
                        line: parsed.line || '', // Deprecated
                        allowed_lines: parsed.line ? [parsed.line] : [],
                        product_type: guessedType,
                        use_destination: parsed.use_destination || '',
                        rh_default: parsed.rh === 'RH',
                        assembled_default: !!parsed.assembled_flag,
                        manufacturing_process: 'FABRICADO'
                    }
                    setFamilyData(newFamilyData)
                    
                    // Sincronizar inmediatamente con formData para que las reglas de nombres funcionen
                    setFormData(prev => ({
                        ...prev,
                        product_type: guessedType,
                        zone_home: guessedZone,
                        line: parsed.line || prev.line,
                        use_destination: parsed.use_destination || prev.use_destination
                    }))
                } else {
                    setIsNewFamily(false)
                }

                // Verificación de Color
                if (parsed.color_code) {
                    const pCode = parsed.color_code.padStart(4, '0')
                    const colorExists = datalistOptions.colors.some(c => (c.code || '').padStart(4, '0') === pCode) || !!parsed.color_name
                    
                    if (!colorExists) {
                        setIsNewColor(true)
                        setColorData({ name: parsed.color_name || '' })
                    } else {
                        setIsNewColor(false)
                    }
                }

                // Verificación de Versión
                if (parsed.version_code) {
                    const versionExists = await checkVersionExistsAction(parsed.version_code)
                    if (!versionExists) {
                        setIsNewVersion(true)
                        const guessedTypes = formData.product_type ? [formData.product_type] : (parsed.product_type ? [parsed.product_type] : [])
                        const prefillRules: Record<string, string> = {}
                        if (parsed.rh && parsed.rh !== 'NA') prefillRules.rh = parsed.rh
                        if (parsed.version_label && parsed.version_label !== 'NA') prefillRules.version_label = parsed.version_label
                        if (parsed.private_label_client_name) prefillRules.private_label_client_name = parsed.private_label_client_name
                        setVersionData({
                            version_code: parsed.version_code || '',
                            version_description: '',
                            product_types: guessedTypes,
                            automatic_version_rules: prefillRules
                        })
                    } else {
                        setIsNewVersion(false)
                    }
                }

                // Verificación de Glosario Adaptativo
                const trans = await translateAction(parsed.final_name_es || '', { ...formData, ...parsed })
                
                const missing = trans.missingTerms || []
                const rtMissing = missing.find(m => m.startsWith('RESOLVED_TYPE_MISSING:'))
                const otherMissing = missing.filter(m => !m.startsWith('RESOLVED_TYPE_MISSING:'))

                if (rtMissing) {
                    const key = rtMissing.replace('RESOLVED_TYPE_MISSING:', '')
                    setResolvedTypeMissing({ key, value: '' })
                } else {
                    setResolvedTypeMissing(null)
                }

                setMissingGlossaryTerms(otherMissing)
                
                // Initialize glossaryDefinitions for missing terms
                const newDefs: Record<string, string> = { ...glossaryDefinitions }
                otherMissing.forEach(term => {
                    if (!newDefs[term]) newDefs[term] = ''
                })
                setGlossaryDefinitions(newDefs)

                if (!parsed.product_name && !parsed.width_cm) {
                    toast.warning("Completar campo de nombre.", {
                        description: "No se encontraron hermanos históricos para este código."
                    })
                } else {
                    toast.success("Datos completados automáticamente.")
                }
        })
    }

    const renderCreatableSelect = (
        name: string, 
        options: string[], 
        placeholder: string, 
        state: any = formData, 
        setState: any = setFormData,
        customState: any = customValues,
        setCustomState: any = setCustomValues
    ) => {
        const isCustom = state[name] === '__NEW__'
        if (isCustom) {
            return (
                <div className="flex gap-2">
                    <Input 
                        autoFocus
                        value={customState[name] || ''} 
                        onChange={e => setCustomState((c: any) => ({...c, [name]: e.target.value}))}
                        disabled={readOnly}
                        onBlur={() => {
                            if (customState[name]) {
                                setState((prev: any) => ({...prev, [name]: customState[name]}))
                            } else {
                                setState((prev: any) => ({...prev, [name]: ''}))
                            }
                        }}
                        placeholder={`Escribe nueva ${placeholder.toLowerCase()}`}
                    />
                    <Button variant="ghost" onClick={() => setState((p: any) => ({...p, [name]: ''}))} disabled={readOnly}>X</Button>
                </div>
            )
        }

        const currentValue = String(state[name]);
        
        // Filtrar opciones si es el campo de 'line' y hay líneas permitidas definidas por la familia
        let finalOptions = options
        if (name === 'line' && allowedLines.length > 0) {
            finalOptions = options.filter(opt => allowedLines.includes(opt))
            // Si la lista filtrada queda vacía por alguna inconsistencia, mostrar todas pero advertir
            if (finalOptions.length === 0) finalOptions = options
        }

        return (
            <select 
                className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${name === 'line' && allowedLines.length > 0 ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : ''}`}
                value={finalOptions.includes(currentValue) ? currentValue : (currentValue ? currentValue : '')}
                disabled={readOnly}
                onChange={(e) => {
                    setState((prev: any) => ({ ...prev, [name]: e.target.value }))
                    if (e.target.value !== '__NEW__') {
                        setCustomState((c: any) => ({...c, [name]: ''}))
                    }
                }}
            >
                <option value="" disabled>Seleccionar {placeholder.toLowerCase()}...</option>
                {!readOnly && <option value="__NEW__" className="font-bold text-blue-600 bg-blue-50">➕ Agregar nueva...</option>}
                {currentValue && !options.includes(currentValue) && currentValue !== '__NEW__' && (
                    <option value={currentValue}>{currentValue}</option>
                )}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        )
    }

    const SOURCE_LABELS: Record<string, string> = {
        family: 'Familia',
        version_rule: 'Versión',
        version_code: 'Versión',
        historic_sku: 'SKU',
        historic_version: 'Versión',
        historic_reference: 'Referencia',
    }

    const renderFormField = (name: string, options: string[], placeholder: string) => {
        const source = fieldSources[name]
        const isLocked = source && source !== 'sap_desc'

        if (isLocked) {
            const currentValue = String(formData[name as keyof typeof formData] || '')
            return (
                <div className="relative">
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-slate-100 px-3 py-2 text-sm text-slate-500 cursor-not-allowed opacity-75"
                        value={currentValue}
                        disabled
                    >
                        {currentValue && !options.includes(currentValue) && (
                            <option value={currentValue}>{currentValue}</option>
                        )}
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded-sm uppercase">
                        {SOURCE_LABELS[source] || source}
                    </span>
                </div>
            )
        }

        return renderCreatableSelect(name, options, placeholder)
    }

    const isFieldLocked = (field: string): boolean => {
        const source = fieldSources[field]
        return !!source && source !== 'sap_desc'
    }

    const lockedInputClass = (field: string): string => {
        return isFieldLocked(field) ? 'bg-slate-100 text-slate-500 cursor-not-allowed opacity-75' : ''
    }

    // Generación de Nombres en Tiempo Real
    useEffect(() => {
        const ccode = formData.color_code;
        if (ccode && ccode !== '__NEW__') {
            const found = datalistOptions.colors?.find(c => c.code === ccode);
            if (found && found.name !== formData.color_name) {
                setFormData(p => ({ ...p, color_name: found.name }));
            }
        }
    }, [formData.color_code, datalistOptions.colors])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.product_name && rules.length > 0) {
                handleGenerateNames();
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [
        formData.product_name, formData.color_code, formData.line, 
        formData.designation, formData.commercial_measure, formData.accessory_text,
        formData.rh, formData.assembled_flag, formData.canto_puertas,
        formData.carb2, formData.bisagras, formData.special_label, formData.door_color_text,
        formData.product_type, formData.zone_home, formData.use_destination,
        formData.version_label
    ]);

    const handleGenerateNames = async (force: boolean = false) => {
        if (rules.length > 0) {
            const evalResult = evaluateProductRules(formData as any as Product, rules)
            const finalEs = evalResult.finalNameEs

            if (finalEs !== formData.final_name_es || force) {
                const { translatedName, isValid, missingTerms } = await translateAction(finalEs, formData, force)
                
                const missing = missingTerms || []
                const rtMissing = missing.find(m => m.startsWith('RESOLVED_TYPE_MISSING:'))
                const otherMissing = missing.filter(m => !m.startsWith('RESOLVED_TYPE_MISSING:'))

                if (rtMissing) {
                    const key = rtMissing.replace('RESOLVED_TYPE_MISSING:', '')
                    setResolvedTypeMissing(prev => prev?.key === key ? prev : { key, value: '' })
                } else {
                    setResolvedTypeMissing(null)
                }

                setMissingGlossaryTerms(otherMissing)
                
                if (!isValid && missing.length > 0 && !force) {
                    toast.error(`Traducción técnica pendiente.`)
                }

                setFormData(prev => ({
                    ...prev,
                    final_name_es: finalEs,
                    final_name_en: translatedName
                }))
            }
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleTeachSystem = async () => {
        const termsToSave: any[] = []
        
        // Glossary terms
        Object.entries(glossaryDefinitions).forEach(([es, en]) => {
            if (en) {
                termsToSave.push({ term_es: es, term_en: en, category: 'TECHNICAL_TERM', priority: 10 })
            }
        })
        
        // Resolved Type
        if (resolvedTypeMissing && resolvedTypeMissing.value) {
            termsToSave.push({ 
                term_es: resolvedTypeMissing.key, 
                term_en: resolvedTypeMissing.value, 
                category: 'RESOLVED_TYPE', 
                priority: 20 
            })
        }
        
        if (termsToSave.length === 0) {
            toast.error("Por favor define al menos una traducción antes de guardar.")
            return
        }
        
        try {
            const res = await saveGlossaryTermsAction(termsToSave)
            if (res.success) {
                toast.success("Sistema actualizado. Regenerando bilingüe...")
                
                // Limpiamos estados locales inmediatamente para ocultar el cuadro azul
                setMissingGlossaryTerms([])
                setResolvedTypeMissing(null)
                setGlossaryDefinitions({})
                
                // Forzamos regeneración inmediata invalidando caché
                await handleGenerateNames(true)
            } else {
                toast.error(res.message)
            }
        } catch (e: any) {
            toast.error("Error al aprender términos: " + e.message)
        }
    }

    const onActualSubmit = async () => {
        try {
            const effectivePrivateName = (() => {
                const versionName = String(versionPrivateLabelName || '').trim()
                if (versionName && !overridePrivateLabel) return versionName

                const key = String(privateLabelData.client_key || '').trim()
                if (key === '__NEW__') return String(privateLabelData.client_name || '').trim()
                if (key.toUpperCase() === 'NA') return ''
                return key
            })()

            const payload = { 
                ...formData, 
                _newFamily: isNewFamily ? familyData : undefined,
                _newColor: isNewColor ? colorData : undefined,
                _newVersion: isNewVersion ? versionData : undefined,
                private_label_client_name: effectivePrivateName || null,
                private_label_logo_id: privateLabelData.logo_id
            };

            const newGlossaryTerms = []
            
            // Add missing glossary terms
            Object.entries(glossaryDefinitions).forEach(([es, en]) => {
                if (en) {
                    newGlossaryTerms.push({ es, en, category: 'TECHNICAL_TERM' })
                }
            })

            // Add missing resolved type
            if (resolvedTypeMissing && resolvedTypeMissing.value) {
                newGlossaryTerms.push({ 
                    es: resolvedTypeMissing.key, 
                    en: resolvedTypeMissing.value, 
                    category: 'RESOLVED_TYPE' 
                })
            }

            const payloadWithGlossary = {
                ...payload,
                _newGlossaryTerms: newGlossaryTerms.length > 0 ? newGlossaryTerms : undefined
            };

            if (isEdit) {
                const res = await updateProductAction(initialData.id, payloadWithGlossary);
                toast.success("Producto actualizado correctamente");
                router.push('/products');
            } else {
                const res = await createProductAction(payloadWithGlossary);
                if (res) {
                    setSavedProduct(res);
                    setShowMultiColorModal(true);
                    toast.success("Producto guardado correctamente");
                } else {
                    toast.error("Error al guardar: No se pudo crear el registro.");
                }
            }
        } catch (err: any) {
            if (err.message.includes('NEXT_REDIRECT')) return; 
            toast.error("Error al guardar: " + err.message);
        }
    }

    const handleSaveClick = (e: React.FormEvent) => {
        e.preventDefault()
        
        // Validaciones Obligatorias V6.1
        const saveFormatError = validateSkuFormat(formData.code);
        if (saveFormatError) {
            toast.error("Código inválido", { description: saveFormatError })
            return
        }
        // SAP description es obligatoria SOLO si NO es herencia por sku_base
        const isInheritedColor = analysisSource === 'version_match' || analysisSource === 'sku_match';
        if (!formData.sap_description && !isInheritedColor) {
            toast.error("Descripción SAP obligatoria", { description: "Para un producto nuevo sin herencia, la descripción SAP es requerida." })
            return
        }
        if (!formData.product_name) {
            toast.error("Nombre del producto (product_name) obligatorio")
            return
        }
        if (!formData.product_type) {
            toast.error("Tipo de producto obligatorio")
            return
        }
        if (!formData.commercial_measure) {
            toast.error("Medida comercial obligatoria")
            return
        }
        if (!formData.color_code || formData.color_code === '__NEW__') {
            toast.error("Color inválido o faltante")
            return
        }

        // ── Validación de Comas Decimales (Fase 2C.1) ──
        const numericFields = [
            { key: 'commercial_measure', label: 'Medida Comercial' },
            { key: 'width_cm', label: 'Ancho (cm)' },
            { key: 'depth_cm', label: 'Fondo (cm)' },
            { key: 'height_cm', label: 'Alto (cm)' },
            { key: 'weight_kg', label: 'Peso (kg)' }
        ];

        for (const field of numericFields) {
            const val = String(formData[field.key as keyof typeof formData] || '').toUpperCase();
            // Bloquea comas (,) y patrones que parezcan separadores de miles con punto (ej. 1.200.54)
            // Se permite el punto solo como decimal. Si un mismo bloque numérico tiene más de un punto, es inválido.
            const hasComma = val.includes(',');
            const parts = val.split('X').map(p => p.trim());
            const hasMultipleDotsInNumber = parts.some(p => (p.match(/\./g) || []).length > 1);

            if (hasComma || hasMultipleDotsInNumber) {
                toast.error(`Formato inválido en ${field.label}`, {
                    description: "No se permiten comas (,) para definir decimales. Usa punto decimal (.) y no incluyas separadores de miles. Ejemplo válido: 44.5X43.5."
                });
                return;
            }
        }
        
        if (isNewFamily) {
            if (!familyData.name) {
                toast.error("Nombre de la nueva familia obligatorio")
                return
            }
            if (!familyData.zone_home) {
                toast.error("Zona de la nueva familia obligatoria")
                return
            }
            if (!familyData.product_type) {
                toast.error("Tipo de producto de la nueva familia obligatorio")
                return
            }
            if (!familyData.manufacturing_process) {
                toast.error("Proceso de manufactura de la nueva familia obligatorio")
                return
            }
        }

        if (isNewColor) {
            if (!colorData.name) {
                toast.error("Nombre del nuevo color obligatorio")
                return
            }
        }

        if (isNewVersion && !versionSaved) {
            toast.error("Configuración de versión pendiente", {
                description: "Debes aplicar la nueva versión antes de guardar el producto."
            })
            return
        }

        // Validación de Isométrico Obligatorio
        if (!formData.isometric_path || formData.isometric_path === '') {
            toast.error("El isométrico es obligatorio", {
                description: "Debes subir un archivo SVG o que el sistema lo vincule automáticamente antes de guardar."
            })
            return
        }

        if (readOnly) {
            toast.error("Acción no permitida", {
                description: "Por ahora esta función está deshabilitada. La edición avanzada será migrada en una fase posterior. Modo consulta."
            })
            return
        }
    if (isEdit) {
        setIsConfirmingSave(true);
    } else {
        onActualSubmit();
    }
}

    const dupeAlertTitle = dupeAlertModal?.matchType === 'sap_description'
        ? 'DescripciÃ³n SAP ya existe en CatÃ¡logo'
        : dupeAlertModal?.matchType === 'both'
            ? 'SKU y descripciÃ³n ya existen en CatÃ¡logo'
            : 'SKU ya existe en CatÃ¡logo'

    const dupeAlertMessage = dupeAlertModal?.matchType === 'sap_description'
        ? (
            <>
                La descripciÃ³n SAP <span className="font-bold text-slate-900">{formData.sap_description}</span> ya se encuentra registrada en el sistema, asociada a otro cÃ³digo.
            </>
        )
        : dupeAlertModal?.matchType === 'both'
            ? (
                <>
                    El cÃ³digo <span className="font-mono font-bold text-slate-900">{formData.code}</span> y la descripciÃ³n SAP <span className="font-bold text-slate-900">{formData.sap_description}</span> ya se encuentran registrados en el sistema.
                </>
            )
            : (
                <>
                    El cÃ³digo <span className="font-mono font-bold text-slate-900">{formData.code}</span> ya se encuentra registrado en el sistema.
                </>
            )

    return (
        <div className="flex flex-col gap-8 w-full pb-20">
            <MultiColorCreationModal isOpen={showMultiColorModal} originalProduct={savedProduct} availableColors={datalistOptions.colors} onComplete={(products) => { setAllCreatedProducts(products); setShowMultiColorModal(false); setShowExportModal(true); }} onSkip={() => { setAllCreatedProducts([savedProduct]); setShowMultiColorModal(false); setShowExportModal(true); }} />
            <PostSaveExportModal isOpen={showExportModal} product={allCreatedProducts.length > 0 ? allCreatedProducts : savedProduct} onClose={() => router.push(backHref || '/products')} />
            {dupeAlertModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-rose-600 font-bold uppercase">
                                <AlertTriangle className="w-6 h-6"/>
                                {dupeAlertTitle}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <p className="text-slate-600">{dupeAlertMessage}</p>
                                <p className="text-sm text-slate-500 italic">
                                    En modo creación no se permite sobrescribir SKUs existentes. La edición avanzada por capas se migrará en una fase posterior.
                                </p>
                            </div>
                            <div className="flex justify-end gap-3 mt-8">
                                <Button variant="outline" onClick={() => setDupeAlertModal(null)}>Cerrar</Button>
                                <Button 
                                    className="bg-slate-700 hover:bg-slate-800 text-white" 
                                    onClick={() => router.push(`/products/${dupeAlertModal.id}`)}
                                >
                                    Ver producto existente
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <ConfirmOverwriteModal 
                isOpen={isConfirmingSave}
                onClose={() => setIsConfirmingSave(false)}
                onConfirm={onActualSubmit}
                initialData={initialData}
                currentData={formData}
            />
            
            {readOnly && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg flex items-center gap-3 mb-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                    <AlertCircle className="h-5 w-5 text-blue-500" />
                    <div>
                        <p className="text-sm font-bold text-blue-800 font-outfit uppercase">Modo Consulta</p>
                        <p className="text-[11px] text-blue-700 font-medium">La edición avanzada será migrada en una fase posterior. El guardado está deshabilitado temporalmente.</p>
                    </div>
                </div>
            )}
            <div className="flex items-center gap-4">
                {backHref && (
                    <Link
                        href={backHref}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200 shadow-sm hover:shadow-md bg-white/50"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Link>
                )}
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-outfit uppercase leading-tight">
                        {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
                    </h1>
                    <p className="text-slate-500 mt-1">
                        {isEdit ? 'Actualizando información maestra del catálogo.' : 'Agrega un producto nuevo manualmente a la base maestra.'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
                <div className="flex flex-col gap-6">
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                            <CardTitle className="text-lg font-bold">Detalles Principales</CardTitle>
                            <CardDescription>Ingresa el código y la descripción para autocompletar el resto de campos.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="code" className="font-semibold text-slate-700">Código de Producto (FAM-REF-VER-COL) *</Label>
                                <Input
                                    id="code" name="code" required
                                    placeholder="VBAN12-0032-000-0368"
                                    className="h-12 text-lg font-mono border-slate-300 focus:ring-blue-500"
                                    value={formData.code} onChange={handleChange}
                                    readOnly={isEdit || readOnly}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="sap_description" className="font-semibold text-slate-700">Descripción cruda SAP</Label>
                                <Input
                                    id="sap_description" name="sap_description"
                                    placeholder="MUEBLE VITELI LVM 79X48..."
                                    className="h-12 border-slate-300"
                                    value={formData.sap_description} onChange={handleChange}
                                    disabled={readOnly}
                                />
                            </div>

                            {/* Marca Propia Section (sin flag; derivado por nombre) */}
                            <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-indigo-600" />
                                        <div>
                                            <p className="text-sm font-bold text-indigo-900">Marca propia</p>
                                            <p className="text-[10px] text-indigo-700/70">Se activa si hay un cliente (por versión o por override).</p>
                                        </div>
                                    </div>
                                    {versionPrivateLabelName ? (
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="overridePrivateLabel" className="text-[11px] font-semibold text-indigo-800">Override</Label>
                                            <Checkbox
                                                id="overridePrivateLabel"
                                                checked={overridePrivateLabel}
                                                onCheckedChange={(c) => setOverridePrivateLabel(!!c)}
                                                disabled={readOnly}
                                                className="h-6 w-6 border-indigo-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {versionPrivateLabelName && !overridePrivateLabel && (
                                    <div className="text-xs text-indigo-900 bg-white/70 border border-indigo-100 rounded-md px-3 py-2">
                                        Detectado por versión: <span className="font-bold">{versionPrivateLabelName}</span>
                                    </div>
                                )}

                                {(!versionPrivateLabelName || overridePrivateLabel) && (
                                    <div className="grid gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-indigo-700 uppercase">Cliente / Marca</Label>
                                            <select 
                                                className="flex h-10 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                                                value={privateLabelData.client_key}
                                                disabled={readOnly}
                                                onChange={(e) => setPrivateLabelData(p => ({ ...p, client_key: e.target.value, client_name: e.target.value === '__NEW__' ? '' : p.client_name }))}
                                            >
                                                <option value="">(Vacío / No aplica)</option>
                                                {clients.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                ))}
                                                {!readOnly && <option value="__NEW__" className="font-bold text-indigo-600 bg-indigo-50">➕ Agregar nueva marca...</option>}
                                            </select>
                                        </div>

                                        {privateLabelData.client_key === '__NEW__' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-indigo-100 shadow-sm animate-in zoom-in-95 duration-200">
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase">Nombre de la Marca</Label>
                                                    <Input 
                                                        placeholder="Ej: SODIMAC"
                                                        value={privateLabelData.client_name}
                                                        onChange={(e) => setPrivateLabelData(p => ({ ...p, client_name: e.target.value }))}
                                                        className="border-indigo-100"
                                                        disabled={readOnly}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase">Logo de Cliente</Label>
                                                    <div className="flex items-center gap-2">
                                                        {!readOnly && (
                                                            <UploadAssetButton 
                                                                onUploadComplete={(asset) => setPrivateLabelData(p => ({ ...p, logo_id: asset.id }))}
                                                                variant="outline"
                                                                className="flex-1 border-indigo-100 text-indigo-700 hover:bg-indigo-50"
                                                                label="Subir Logo"
                                                                type="logo"
                                                            />
                                                        )}
                                                        {readOnly && privateLabelData.logo_id && (
                                                            <div className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 font-medium italic">
                                                                Logo vinculado
                                                            </div>
                                                        )}
                                                        {privateLabelData.logo_id && (
                                                            <div className="w-10 h-10 bg-green-50 border border-green-200 rounded flex items-center justify-center">
                                                                <ImageIcon className="w-5 h-5 text-green-600" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 flex justify-end gap-3">
                                <Button 
                                    type="button" 
                                    onClick={handleAutoProcess}
                                    disabled={readOnly}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Generar Automáticamente
                                </Button>
                            </div>
                            {analysisSource && (
                                <div className={`mt-4 p-3 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300 ${
                                    analysisSource === 'sku_match' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
                                    analysisSource === 'version_match' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                    analysisSource === 'reference_match' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                                    'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>
                                    <div className="mt-0.5">
                                        {analysisSource === 'sku_match' ? <AlertCircle className="w-4 h-4"/> : <History className="w-4 h-4"/>}
                                    </div>
                                    <div className="flex-1 text-xs">
                                        <p className="font-bold uppercase tracking-wider mb-0.5">
                                            {analysisSource === 'sku_match' ? 'Coincidencia Exacta' : 
                                             analysisSource === 'version_match' ? 'Herencia de Versión' :
                                             analysisSource === 'reference_match' ? 'Herencia de Referencia' :
                                             'Procesado por Reglas'}
                                        </p>
                                        <p className="">
                                            {analysisSource === 'sku_match' ? 'Los datos coinciden con un SKU existente. No se puede duplicar.' : 
                                             analysisSource === 'version_match' ? 'Datos heredados automáticamente de otros colores de este mismo mueble (SKU Base).' :
                                             analysisSource === 'reference_match' ? 'Datos heredados de otras versiones de este mismo mueble (Referencia).' :
                                             'Datos extraídos del código SAP y reglas de negocio.'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {isAnalyzed && isNewFamily && (
                        <Card className={`${familySaved ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} border-2 shadow-lg animate-in fade-in zoom-in-95 duration-200 transition-colors`}>
                            <CardHeader className={`pb-3 border-b ${familySaved ? 'border-emerald-100' : 'border-amber-100'}`}>
                                <CardTitle className={`text-xl font-bold ${familySaved ? 'text-emerald-900' : 'text-amber-900'} flex items-center gap-2`}>
                                    <AlertTriangle className={`w-5 h-5 ${familySaved ? 'text-emerald-600' : 'text-amber-600'}`}/>
                                    {familySaved ? 'Configuración de Familia Guardada' : 'Configuración de Nueva Familia'} ({formData.familia_code})
                                </CardTitle>
                                <CardDescription className={`${familySaved ? 'text-emerald-800/80' : 'text-amber-800/80'} font-medium`}>
                                    {familySaved ? 'Los datos de la familia han sido persistidos en el sistema.' : 'Esta familia no existe en el sistema. Debes definir sus propiedades base para continuar.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Nombre / Descripción Familia</Label>
                                        <Input 
                                            placeholder="Ej: VANITY MINIMALISTA"
                                            value={familyData.name}
                                            onChange={(e) => {
                                                setFamilyData(p => ({ ...p, name: e.target.value }))
                                                setFamilySaved(false)
                                            }}
                                            className={`${familySaved ? 'border-emerald-200' : 'border-amber-200'} bg-white h-11 focus:ring-blue-500`}
                                            disabled={readOnly}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Proceso de Manufactura</Label>
                                        <select 
                                            value={familyData.manufacturing_process || ''}
                                            onChange={(e) => {
                                                setFamilyData(p => ({ ...p, manufacturing_process: e.target.value }))
                                                setFamilySaved(false)
                                            }}
                                            disabled={readOnly}
                                            className="w-full h-11 px-3 bg-white border border-amber-200 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none text-sm font-medium disabled:opacity-50"
                                        >
                                            <option value="" disabled>SELECCIONAR...</option>
                                            <option value="MÁRMOL SINTÉTICO">MÁRMOL SINTÉTICO</option>
                                            <option value="FIBRA DE VIDRIO">FIBRA DE VIDRIO</option>
                                            <option value="MUEBLES NACIONAL">MUEBLES NACIONAL</option>
                                            <option value="MUEBLES EXTERIOR">MUEBLES EXTERIOR</option>
                                            <option value="QUARTZSTONE">QUARTZSTONE</option>
                                            <option value="RTM">RTM</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Tipo de Producto</Label>
                                        {renderCreatableSelect('product_type', datalistOptions.productTypes || [], 'TIPO PRODUCTO', familyData, (fn: any) => {
                                            const updated = typeof fn === 'function' ? fn(familyData) : fn
                                            setFamilyData(updated)
                                            setFamilySaved(false)
                                        })}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Zona (Ambiente)</Label>
                                        {renderCreatableSelect('zone_home', datalistOptions.zoneHomes || [], 'ZONA', familyData, (fn: any) => {
                                            const updated = typeof fn === 'function' ? fn(familyData) : fn
                                            setFamilyData(updated)
                                            setFamilySaved(false)
                                        })}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Uso / Destino</Label>
                                        {renderCreatableSelect('use_destination', datalistOptions.useDestinations || [], 'DESTINO', familyData, (fn: any) => {
                                            const updated = typeof fn === 'function' ? fn(familyData) : fn
                                            setFamilyData(updated)
                                            setFamilySaved(false)
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${familySaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Línea Comercial Autorizada</Label>
                                        {renderCreatableSelect('line', datalistOptions.lines || [], 'LÍNEA', familyData, (fn: any) => {
                                            const updated = typeof fn === 'function' ? fn(familyData) : fn
                                            setFamilyData(updated)
                                            setFamilySaved(false)
                                        })}
                                    </div>
                                    <div className="space-y-4 pt-6">
                                        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-200/50">
                                            <Checkbox 
                                                id="rh_default"
                                                checked={familyData.rh_default}
                                                onCheckedChange={(v) => {
                                                    setFamilyData(p => ({ ...p, rh_default: !!v }))
                                                    setFamilySaved(false)
                                                }}
                                                disabled={readOnly}
                                            />
                                            <Label htmlFor="rh_default" className="text-sm font-bold text-slate-700 cursor-pointer">Material RH por defecto</Label>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-200/50">
                                            <Checkbox 
                                                id="assembled_default"
                                                checked={familyData.assembled_default}
                                                onCheckedChange={(v) => {
                                                    setFamilyData(p => ({ ...p, assembled_default: !!v }))
                                                    setFamilySaved(false)
                                                }}
                                                disabled={readOnly}
                                            />
                                            <Label htmlFor="assembled_default" className="text-sm font-bold text-slate-700 cursor-pointer">Armado por defecto</Label>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white/40 p-4 rounded-xl border border-dashed border-slate-300">
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                                        <ShieldCheck className="w-3 h-3 inline mr-1 mb-0.5" />
                                        ESTOS VALORES SE HEREDARÁN AUTOMÁTICAMENTE A LOS PRODUCTOS DE ESTA FAMILIA. LAS EXCEPCIONES EN EL CÓDIGO (COMO "MRH") TENDRÁN PRIORIDAD.
                                    </p>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    {!readOnly && (
                                        <Button 
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    if (!familyData.name || !familyData.zone_home || !familyData.product_type || !familyData.manufacturing_process) {
                                                        toast.error("Por favor completa los campos obligatorios de la familia (Nombre, Zona, Tipo, Manufactura).")
                                                        return
                                                    }

                                                    // Propagar datos al producto
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        zone_home: familyData.zone_home || prev.zone_home,
                                                        line: familyData.line || prev.line,
                                                        product_type: familyData.product_type || prev.product_type,
                                                        rh: familyData.rh_default ? 'RH' : prev.rh,
                                                        assembled_flag: familyData.assembled_default || prev.assembled_flag
                                                    }))
                                                    
                                                    setFamilySaved(true)
                                                    toast.success("Datos de familia aplicados al producto. Se guardarán definitivamente al finalizar.")
                                                } catch (error: any) {
                                                    toast.error("Error al aplicar familia: " + error.message)
                                                }
                                            }}
                                            className={`${familySaved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white font-bold px-8 shadow-md transition-all h-12 rounded-xl`}
                                        >
                                            {familySaved ? 'SOBREESCRIBIR DATOS, APLICAR Y CONTINUAR' : 'APLICAR DATOS AL PRODUCTO Y CONTINUAR'}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {isAnalyzed && isNewColor && (
                        <Card className={`${colorSaved ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'} border-2 shadow-lg animate-in fade-in zoom-in-95 duration-200 transition-colors`}>
                            <CardHeader className={`pb-3 border-b ${colorSaved ? 'border-emerald-100' : 'border-indigo-100'}`}>
                                <CardTitle className={`text-xl font-bold ${colorSaved ? 'text-emerald-900' : 'text-indigo-900'} flex items-center gap-2`}>
                                    <Sparkles className={`w-5 h-5 ${colorSaved ? 'text-emerald-600' : 'text-indigo-600'}`}/>
                                    {colorSaved ? 'Configuración de Color Guardada' : 'Nuevo Color Identificado'} ({formData.color_code})
                                </CardTitle>
                                <CardDescription className={`${colorSaved ? 'text-emerald-800/80' : 'text-indigo-800/80'} font-medium`}>
                                    {colorSaved ? 'Los datos del color han sido preparados para el guardado.' : 'Este código de color no existe en el catálogo. Por favor define su nombre.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-1 gap-6">
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${colorSaved ? 'text-emerald-800' : 'text-indigo-800'} uppercase tracking-wider`}>Nombre del Color (SAP)</Label>
                                        <Input 
                                            placeholder="Ej: NARDO, ROBLE, GRIS PLOMO"
                                            value={colorData.name}
                                            onChange={(e) => {
                                                setColorData(p => ({ ...p, name: e.target.value.toUpperCase() }))
                                                setColorSaved(false)
                                            }}
                                            className={`${colorSaved ? 'border-emerald-200' : 'border-indigo-200'} bg-white h-11 focus:ring-blue-500 font-bold uppercase`}
                                            disabled={readOnly}
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    {!readOnly && (
                                        <Button 
                                            type="button"
                                            onClick={() => {
                                                if (!colorData.name) {
                                                    toast.error("Por favor completa el nombre del color.")
                                                    return
                                                }
                                                setFormData(prev => ({ ...prev, color_name: colorData.name }))
                                                setColorSaved(true)
                                                toast.success("Color aplicado al producto.")
                                            }}
                                            className={`${colorSaved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold px-8 shadow-md transition-all h-12 rounded-xl`}
                                        >
                                            {colorSaved ? 'ACTUALIZAR Y CONTINUAR' : 'APLICAR COLOR Y CONTINUAR'}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {isAnalyzed && isNewVersion && (
                        <Card className={`${versionSaved ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} border-2 shadow-lg animate-in fade-in zoom-in-95 duration-200 transition-colors`}>
                            <CardHeader className={`pb-3 border-b ${versionSaved ? 'border-emerald-100' : 'border-amber-100'}`}>
                                <CardTitle className={`text-xl font-bold ${versionSaved ? 'text-emerald-900' : 'text-amber-900'} flex items-center gap-2`}>
                                    <AlertTriangle className={`w-5 h-5 ${versionSaved ? 'text-emerald-600' : 'text-amber-600'}`}/>
                                    {versionSaved ? 'Configuraci\u00f3n de Versi\u00f3n Guardada' : `Nueva Versi\u00f3n (${versionData.version_code})`}
                                </CardTitle>
                                <CardDescription className={`${versionSaved ? 'text-emerald-800/80' : 'text-amber-800/80'} font-medium`}>
                                    {versionSaved ? 'El c\u00f3digo de versi\u00f3n ha sido registrado en el diccionario global.' : 'Este c\u00f3digo de versi\u00f3n no existe en el diccionario. Debes registrarlo para poder crear el producto.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${versionSaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>{'Código de Versión *'}</Label>
                                        <Input
                                            placeholder="Ej: 001, A02, Z99"
                                            value={versionData.version_code}
                                            onChange={(e) => {
                                                const raw = e.target.value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 3)
                                                setVersionData(p => ({ ...p, version_code: raw }))
                                                setVersionSaved(false)
                                            }}
                                            maxLength={3}
                                            className={`${versionSaved ? 'border-emerald-200' : 'border-amber-200'} bg-white h-11 font-bold font-mono text-lg tracking-widest text-center focus:ring-blue-500`}
                                            disabled={readOnly || versionSaved}
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className={`text-xs font-extrabold ${versionSaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>{'Descripción de Versión *'}</Label>
                                        <Input
                                            placeholder="Ej: CHILEMAT, CROMO 2 LUCES, MRH"
                                            value={versionData.version_description}
                                            onChange={(e) => {
                                                setVersionData(p => ({ ...p, version_description: e.target.value.toUpperCase() }))
                                                setVersionSaved(false)
                                            }}
                                            className={`${versionSaved ? 'border-emerald-200' : 'border-amber-200'} bg-white h-11 focus:ring-blue-500`}
                                            disabled={readOnly}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label className={`text-xs font-extrabold ${versionSaved ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>Tipos de Producto Asociados</Label>
                                    <div className="flex flex-wrap gap-3 p-3 bg-white/60 rounded-xl border border-slate-200/50">
                                        {datalistOptions.productTypes.length === 0 ? (
                                            <span className="text-xs text-slate-400 italic">Cargando tipos...</span>
                                        ) : (
                                            datalistOptions.productTypes.map(pt => (
                                                <label key={pt} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={versionData.product_types.includes(pt)}
                                                        onChange={() => {
                                                            setVersionData(p => ({
                                                                ...p,
                                                                product_types: p.product_types.includes(pt)
                                                                    ? p.product_types.filter(t => t !== pt)
                                                                    : [...p.product_types, pt]
                                                            }))
                                                            setVersionSaved(false)
                                                        }}
                                                        disabled={readOnly || versionSaved}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs font-medium text-slate-700">{pt}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="border rounded-xl p-4 bg-white/40 border-slate-200 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-extrabold text-indigo-800 uppercase tracking-wider">{'Reglas de Automatización (Override por Versión)'}</Label>
                                        <select
                                            className="text-xs h-8 px-2 border border-indigo-200 rounded-md bg-white text-indigo-700 font-medium"
                                            value=""
                                            disabled={readOnly || versionSaved}
                                            onChange={(e) => {
                                                const key = e.target.value
                                                if (!key) return
                                                if (versionData.automatic_version_rules[key] !== undefined) return
                                                const field = OVERRIDE_FIELDS.find(f => f.key === key)
                                                let defaultVal = ''
                                                if (field?.type === 'select' && field.options) defaultVal = field.options[0]
                                                setVersionData(p => ({
                                                    ...p,
                                                    automatic_version_rules: { ...p.automatic_version_rules, [key]: defaultVal }
                                                }))
                                            }}
                                        >
                                            <option value="">+ Agregar Override</option>
                                            {OVERRIDE_GROUPS.map(group => (
                                                <optgroup key={group} label={group}>
                                                    {OVERRIDE_FIELDS
                                                        .filter(f => f.group === group)
                                                        .filter(f => versionData.automatic_version_rules[f.key] === undefined)
                                                        .map(f => (
                                                            <option key={f.key} value={f.key}>{f.label}</option>
                                                        ))
                                                    }
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    {Object.keys(versionData.automatic_version_rules).length === 0 && (
                                        <p className="text-[11px] text-slate-400 italic text-center py-2">
                                            Sin overrides. Usa el selector de arriba para agregar reglas.
                                        </p>
                                    )}
                                    <div className="space-y-3">
                                        {Object.entries(versionData.automatic_version_rules).map(([key, value]) => {
                                            const field = OVERRIDE_FIELDS.find(f => f.key === key)
                                            if (!field) return null
                                            return (
                                                <div key={key} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-200">
                                                    <Label className="text-xs font-bold text-slate-600 w-40 shrink-0">{field.label}</Label>
                                                    {field.type === 'select' && field.options ? (
                                                        <select
                                                            className="flex-1 h-9 px-2 border border-indigo-200 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                            value={String(value)}
                                                            disabled={readOnly || versionSaved}
                                                            onChange={(e) => setVersionData(p => ({
                                                                ...p,
                                                                automatic_version_rules: { ...p.automatic_version_rules, [key]: e.target.value }
                                                            }))}
                                                        >
                                                            {field.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type={field.type}
                                                            className="flex-1 h-9 px-3 border border-indigo-200 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                            value={String(value)}
                                                            disabled={readOnly || versionSaved}
                                                            onChange={(e) => setVersionData(p => ({
                                                                ...p,
                                                                automatic_version_rules: { ...p.automatic_version_rules, [key]: e.target.value }
                                                            }))}
                                                        />
                                                    )}
                                                    {!versionSaved && (
                                                        <button
                                                            type="button"
                                                            className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                                                            onClick={() => {
                                                                const { [key]: _, ...rest } = versionData.automatic_version_rules
                                                                setVersionData(p => ({ ...p, automatic_version_rules: rest }))
                                                            }}
                                                        >{'×'}</button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    {!readOnly && (
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                const vc = versionData.version_code
                                                if (!vc || !/^[A-Z0-9]{3}$/.test(vc)) {
                                                    toast.error("C\u00f3digo de versi\u00f3n inv\u00e1lido", {
                                                        description: "Debe tener exactamente 3 caracteres alfanum\u00e9ricos (A-Z, 0-9), sin tildes ni caracteres especiales."
                                                    })
                                                    return
                                                }
                                                if (!versionData.version_description.trim()) {
                                                    toast.error("Por favor completa la descripci\u00f3n de la versi\u00f3n.")
                                                    return
                                                }
                                                setVersionSaved(true)
                                                toast.success("Versi\u00f3n registrada. Se guardar\u00e1 definitivamente al crear el producto.")
                                            }}
                                            className={`${versionSaved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white font-bold px-8 shadow-md transition-all h-12 rounded-xl`}
                                        >
                                            {versionSaved ? 'ACTUALIZAR Y CONTINUAR' : 'APLICAR VERSI\u00d3N Y CONTINUAR'}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {isAnalyzed && (
                        <>
                            <Card className="border-slate-200 shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                                    <CardTitle className="text-lg font-bold">Validación de propiedades</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Tipo de Producto</Label>
                                            {renderFormField('product_type', datalistOptions.productTypes, 'TIPO DE PRODUCTO')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Nombre del Producto</Label>
                                            {renderFormField('product_name', datalistOptions.productNames || [], 'NOMBRE DEL PRODUCTO')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Código Color (4 dígitos)</Label>
                                            <div className="flex gap-2">
                                                <div className="w-28 text-sm">{renderCreatableSelect('color_code', (datalistOptions.colors || []).map(c=>c.code), 'CÓDIGO COLOR')}</div>
                                                <Input name="color_name" value={formData.color_name} onChange={handleChange} className="flex-1 bg-slate-50" readOnly />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Línea</Label>
                                            {renderFormField('line', datalistOptions.lines, 'LÍNEA')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Destino de Uso</Label>
                                            {renderFormField('use_destination', datalistOptions.useDestinations, 'DESTINO DE USO')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Designación</Label>
                                            {renderFormField('designation', datalistOptions.designations, 'DESIGNACIÓN')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Medida Comercial</Label>
                                            {renderFormField('commercial_measure', datalistOptions.commercialMeasures || [], 'MEDIDA COMERCIAL')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Canto Puertas</Label>
                                            {renderFormField('canto_puertas', datalistOptions.cantoPuertas || [], 'CANTO PUERTAS')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Material / RH</Label>
                                            {renderFormField('rh', datalistOptions.rh || [], 'MATERIAL / RH')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Accesorios / Rieles</Label>
                                            {renderFormField('accessory_text', datalistOptions.accessoryTexts || [], 'ACCESORIO/RIEL')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Bisagras</Label>
                                            {renderFormField('bisagras', datalistOptions.bisagras || [], 'BISAGRAS')}
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">CARB2</Label>
                                            {renderFormField('carb2', datalistOptions.carb2 || [], 'CARB2')}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Zona</Label>
                                            {renderFormField('zone_home', datalistOptions.zoneHomes || [], 'ZONA')}
                                        </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Etiqueta Especial</Label>
                                        {renderFormField('special_label', datalistOptions.specialLabels || [], 'ETIQUETA ESPECIAL')}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Etiqueta de Versión</Label>
                                        {renderFormField('version_label', datalistOptions.versionLabels || [], 'ETIQUETA DE VERSIÓN')}
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Color Puerta</Label>
                                        {renderFormField('door_color_text', datalistOptions.doorColorTexts || [], 'COLOR PUERTA')}
                                    </div>
                                </div>

                                {warnings.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                                        {warnings.map((w, i) => (
                                            <div key={i} className="flex items-start gap-2 text-amber-800 text-xs">
                                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                <span className="font-medium">{w}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                    <div className="pt-4 border-t border-slate-100 mt-2">
                                        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
                                            {/* Technical Flags Group */}
                                            <div className="flex items-center gap-6 p-2 px-4 bg-slate-50 rounded-xl border border-slate-100 w-full lg:w-auto">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id="assembled_flag" 
                                                        checked={formData.assembled_flag} 
                                                        onCheckedChange={(c) => setFormData(p => ({ ...p, assembled_flag: !!c }))} 
                                                        disabled={readOnly || isFieldLocked('assembled_flag')}
                                                    />
                                                    <Label htmlFor="assembled_flag" className={`text-xs font-bold ${isFieldLocked('assembled_flag') ? 'text-slate-400' : 'text-slate-700'} cursor-pointer`}>Es Armado</Label>
                                                </div>

                                                <div className="flex items-center space-x-2 border-l border-slate-200 pl-6">
                                                    <Checkbox 
                                                        id="has_barcode" 
                                                        checked={hasBarcode} 
                                                        onCheckedChange={(c) => setHasBarcode(!!c)} 
                                                        disabled={readOnly}
                                                    />
                                                    <Label htmlFor="has_barcode" className="text-xs font-bold text-slate-700 cursor-pointer">¿Lleva código de barras?</Label>
                                                </div>

                                                {hasBarcode && (
                                                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                                                        <Input 
                                                            id="barcode_text"
                                                            name="barcode_text"
                                                            value={formData.barcode_text}
                                                            onChange={handleChange}
                                                            placeholder="Código..."
                                                            className={`w-32 h-8 text-xs border-indigo-200 focus:ring-indigo-500 bg-white ${lockedInputClass('barcode_text')}`}
                                                            disabled={readOnly || isFieldLocked('barcode_text')}
                                                        />
                                                    </div>
                                                )}

                                                {formData.assembled_flag && (
                                                    <div className="flex items-center gap-2 border-l border-slate-200 pl-6 animate-in slide-in-from-left-2 duration-200">
                                                        <Label htmlFor="armado_con_lvm" className="text-[10px] font-bold text-slate-500 uppercase shrink-0">LVM</Label>
                                                        <Input 
                                                            id="armado_con_lvm"
                                                            name="armado_con_lvm"
                                                            value={formData.armado_con_lvm}
                                                            onChange={handleChange}
                                                            placeholder="Ej: LVM SIKUANI"
                                                            className={`w-32 h-8 text-xs border-blue-200 focus:ring-blue-500 bg-white ${lockedInputClass('armado_con_lvm')}`}
                                                            disabled={readOnly || isFieldLocked('armado_con_lvm')}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Isometric Action Group */}
                                            <div className="w-full lg:w-auto">
                                                 {formData.ref_code && !readOnly && (
                                                     <div className="flex flex-col sm:flex-row items-center gap-3">
                                                         {formData.isometric_path && (
                                                             <div className={cn(
                                                                 "flex items-center gap-2 p-2 px-4 rounded-xl border shadow-sm whitespace-nowrap",
                                                                 formData.isometric_from_different_version 
                                                                     ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse-slow" 
                                                                     : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                             )}>
                                                                 {formData.isometric_from_different_version ? <AlertTriangle className="w-4 h-4 text-amber-500"/> : <FileBadge2 className="w-4 h-4 text-emerald-500"/>}
                                                                 <span className="text-xs font-bold">
                                                                     {formData.isometric_from_different_version 
                                                                         ? `Isométrico Sugerido (Versión distinta)` 
                                                                         : `Isométrico OK`}
                                                                 </span>
                                                             </div>
                                                         )}

                                                         <IsometricAssociationDialog 
                                                             mode={isEdit ? "associate" : "select"}
                                                             initialFamilies={formData.familia_code ? [formData.familia_code] : []}
                                                             initialReferences={formData.ref_code ? [`${formData.ref_code}|||${formData.commercial_measure || ''}`] : []}
                                                             initialMeasures={formData.commercial_measure ? [formData.commercial_measure] : []}
                                                             initialVersions={formData.version_code ? [formData.version_code] : []}
                                                             onAssociationComplete={(asset) => {
                                                                 setFormData(p => ({ 
                                                                     ...p, 
                                                                     isometric_path: asset.file_path || 'exists',
                                                                     isometric_asset_id: asset.id,
                                                                     isometric_from_different_version: false
                                                                 }))
                                                             }}
                                                             trigger={
                                                                 <Button variant="outline" className={cn(
                                                                     "w-full lg:w-auto gap-2 h-10 shadow-sm border-2",
                                                                     !formData.isometric_path ? "border-amber-400 text-amber-700 hover:bg-amber-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                                 )}>
                                                                     {formData.isometric_path ? <ImageIcon className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                                                                     {formData.isometric_path ? 'Cambiar Isométrico' : 'Asociar Isométrico'}
                                                                 </Button>
                                                             }
                                                         />
                                                     </div>
                                                 )}
                                                 {formData.ref_code && readOnly && formData.isometric_path && (
                                                     <div className="flex items-center gap-2 p-2 px-4 rounded-xl border bg-slate-50 text-slate-600 border-slate-200 shadow-sm">
                                                         <ImageIcon className="w-4 h-4 text-slate-400" />
                                                         <span className="text-xs font-bold">Isométrico Vinculado</span>
                                                     </div>
                                                 )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {isAnalyzed && (missingGlossaryTerms.length > 0 || resolvedTypeMissing) && (
                                <Card className="border-blue-200 border-2 bg-blue-50 shadow-lg animate-in fade-in slide-in-from-right-4 duration-300">
                                    <CardHeader className="pb-3 border-b border-blue-100">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-xl font-bold text-blue-900 flex items-center gap-2">
                                                <Sparkles className="w-5 h-5 text-blue-600"/>
                                                Aprendizaje de Glosario Técnico
                                            </CardTitle>
                                            {!readOnly && (
                                                <Button 
                                                    type="button" 
                                                    onClick={handleTeachSystem}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-md gap-2 border-2 border-blue-400 font-bold"
                                                >
                                                    <ShieldCheck className="w-4 h-4"/>
                                                    Enseñarle al sistema
                                                </Button>
                                            )}
                                        </div>
                                        <CardDescription className="text-blue-800/80 font-medium">
                                            Para generar una documentación bilingüe perfecta, por favor define la traducción de los siguientes términos nuevos o combinaciones:
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        {resolvedTypeMissing && (
                                            <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm space-y-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Box className="w-4 h-4 text-blue-600" />
                                                    <Label className="text-xs font-extrabold text-blue-800 uppercase tracking-widest">Tipo de Producto Comercial (Resolved Type)</Label>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Nombre en Español (Concatenado)</p>
                                                        <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-600 font-mono text-xs">
                                                            {resolvedTypeMissing.key}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-blue-600 font-bold uppercase">Nombre Comercial en Inglés</p>
                                                        <Input 
                                                            placeholder="Ej: LAUNDRY BASE CABINET"
                                                            value={resolvedTypeMissing.value}
                                                            onChange={(e) => setResolvedTypeMissing(p => p ? ({ ...p, value: e.target.value.toUpperCase() }) : null)}
                                                            className="border-blue-200 focus:ring-blue-500 h-10 font-bold text-blue-900"
                                                            disabled={readOnly}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {missingGlossaryTerms.length > 0 && (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <FileBadge2 className="w-4 h-4 text-blue-600" />
                                                    <Label className="text-xs font-extrabold text-blue-800 uppercase tracking-widest">Términos y Frases Técnicas</Label>
                                                </div>
                                                <div className="grid gap-3">
                                                    {missingGlossaryTerms.map(term => (
                                                        <div key={term} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-white rounded-lg border border-blue-100 shadow-sm items-center">
                                                            <div className="text-sm font-bold text-slate-700 font-mono">
                                                                {term}
                                                            </div>
                                                            <Input 
                                                                placeholder={`Traducción para "${term.toLowerCase()}"`}
                                                                value={glossaryDefinitions[term] || ''}
                                                                onChange={(e) => setGlossaryDefinitions(prev => ({
                                                                    ...prev,
                                                                    [term]: e.target.value.toUpperCase()
                                                                }))}
                                                                className="border-blue-100 focus:ring-blue-500 h-9 text-sm"
                                                                disabled={readOnly}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            <Card className="border-blue-200 border-2 shadow-md bg-blue-50/30">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div>
                                        <CardTitle className="text-lg font-bold text-blue-900">Nomenclatura Generada</CardTitle>
                                        <CardDescription>Vista previa de cómo aparecerán los nombres en los documentos.</CardDescription>
                                    </div>
                                    {!readOnly && (
                                        <Button type="button" onClick={() => handleGenerateNames()} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm mt-0 text-xs h-8">
                                            Refrescar
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-extrabold text-blue-700 uppercase">Nombre Final (ES)</Label>
                                        <div className="p-3 bg-white border border-blue-200 rounded-lg text-sm font-semibold text-blue-900 shadow-inner min-h-[40px]">
                                            {formData.final_name_es || <span className="text-slate-400 italic font-normal">No se generó nombre...</span>}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs font-extrabold text-blue-700 uppercase">Nombre Final (EN)</Label>
                                        <div className="p-3 bg-white border border-blue-200 rounded-lg text-sm font-semibold text-blue-900 shadow-inner italic min-h-[40px]">
                                            {formData.final_name_en || <span className="text-slate-400 font-normal">No se generó nombre...</span>}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-200 shadow-sm">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                                    <CardTitle className="text-lg font-bold font-outfit">Dimensiones (Autocompletadas)</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Ancho (cm)</Label>
                                            <Input type="number" step="0.1" name="width_cm" value={formData.width_cm} onChange={handleChange} className={`border-orange-200 bg-orange-50/20 ${lockedInputClass('width_cm')}`} disabled={readOnly || isFieldLocked('width_cm')} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Fondo (cm)</Label>
                                            <Input type="number" step="0.1" name="depth_cm" value={formData.depth_cm} onChange={handleChange} className={`border-orange-200 bg-orange-50/20 ${lockedInputClass('depth_cm')}`} disabled={readOnly || isFieldLocked('depth_cm')} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Alto (cm)</Label>
                                            <Input type="number" step="0.1" name="height_cm" value={formData.height_cm} onChange={handleChange} className={`border-orange-200 bg-orange-50/20 ${lockedInputClass('height_cm')}`} disabled={readOnly || isFieldLocked('height_cm')} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Peso Bruto (kg)</Label>
                                            <Input type="number" step="0.1" name="weight_kg" value={formData.weight_kg} onChange={handleChange} className={`border-orange-200 bg-orange-50/20 ${lockedInputClass('weight_kg')}`} disabled={readOnly || isFieldLocked('weight_kg')} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Apilamiento Max</Label>
                                            <Input type="number" name="stacking_max" value={formData.stacking_max} onChange={handleChange} disabled={readOnly || isFieldLocked('stacking_max')} />
                                        </div>
                                    </div>

                                </CardContent>
                            </Card>

                            <div className="flex gap-2 justify-end mt-4">
                                <Link href="/products">
                                    <Button variant="outline" type="button" className="h-11 px-8">Cancelar</Button>
                                </Link>
                                <Button 
                                    onClick={handleSaveClick} 
                                    disabled={readOnly}
                                    className={cn(
                                        "h-11 px-10 font-bold shadow-lg gap-2 text-white",
                                        readOnly ? "bg-slate-300 cursor-not-allowed shadow-none" : (isEdit ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800')
                                    )}
                                >
                                    <Save className="w-4 h-4" />
                                    {isEdit ? (readOnly ? 'Modo Consulta' : 'Sobreescribir producto') : 'Guardar Producto'}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

