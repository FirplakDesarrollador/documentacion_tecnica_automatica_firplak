import { dbQuery } from '@/lib/supabase'
import { composeProductBySku } from './product_composer'
import { buildEffectiveProductContext } from './effectiveProduct'

export interface ParsedCodeResult {
    familia_code: string | null
    ref_code: string | null
    version_code: string | null
    color_code: string | null
    rh: string | null
    product_type: string | null
    use_destination: string | null
    zone_home: string | null
    assembled_flag: boolean
    sku_base: string | null
    accessory_text: string | null
    product_name: string | null
    line: string | null
    designation: string | null
    isometric_path: string | null
    width_cm: number | null
    depth_cm: number | null
    height_cm: number | null
    weight_kg: number | null
    commercial_measure: string | null
    canto_puertas: string | null
    armado_con_lvm: string | null
    carb2: string | null
    private_label_client_name: string | null
    special_label: string | null
    bisagras: string | null
    door_color_text: string | null
    barcode_text: string | null
    status: string | null
    color_name?: string | null
    isometric_from_different_version?: boolean
    allowed_lines?: string[]
    isometric_asset_id?: string | null
    final_name_es?: string | null
    version_label?: string | null

    inheritance_sources: Record<string, string>
    warnings: string[]
    _version_overrides: Record<string, string>
}

function findBestMatch(text: string, options: string[]) {
    if (!text || !options || options.length === 0) return null;
    const upperText = text.toUpperCase();

    const sortedOptions = options
        .filter(o => !!o && o !== 'NA')
        .sort((a, b) => b.length - a.length);

    for (const opt of sortedOptions) {
        if (upperText.includes(opt.toUpperCase())) {
            return opt;
        }
    }
    return null;
}

const REFERENCE_LEVEL_FIELDS = new Set([
    'product_name', 'line', 'designation', 'commercial_measure',
    'special_label', 'width_cm', 'depth_cm', 'height_cm', 'weight_kg',
    'bisagras', 'carb2', 'canto_puertas', 'accessory_text', 'rh',
    'assembled_flag', 'armado_con_lvm', 'private_label_client_name',
    'color_name', 'stacking_max', 'zone_home', 'use_destination', 'product_type',
    'door_color_text',
]);

export async function parseProductCode(
    code: string,
    sapDescription?: string | null,
    manualRhFlag?: boolean
): Promise<ParsedCodeResult> {
    const result: ParsedCodeResult = {
        familia_code: null,
        ref_code: null,
        version_code: null,
        color_code: null,
        rh: null,
        product_type: null,
        use_destination: null,
        zone_home: null,
        assembled_flag: false,
        sku_base: null,
        accessory_text: null,
        product_name: null,
        line: null,
        designation: null,
        isometric_path: null,
        width_cm: null,
        depth_cm: null,
        height_cm: null,
        weight_kg: null,
        commercial_measure: null,
        canto_puertas: null,
        armado_con_lvm: null,
        carb2: null,
        private_label_client_name: null,
        special_label: null,
        bisagras: null,
        door_color_text: null,
        barcode_text: null,
        status: 'ACTIVO',
        version_label: null,
        inheritance_sources: {},
        warnings: [],
        _version_overrides: {}
    }

    function setInheritance(field: string, value: any, source: string) {
        if (value !== null && value !== undefined && value !== '') {
            if (!result.inheritance_sources[field]) {
                const effectiveSource = source === 'historic_version' && REFERENCE_LEVEL_FIELDS.has(field)
                    ? 'historic_reference'
                    : source;
                result.inheritance_sources[field] = effectiveSource;
            }
        }
    }

    if (manualRhFlag && !result.rh) {
        result.rh = 'RH';
    }

    if (!code) return result

    const parts = code.split('-')
    if (parts.length >= 4) {
        let fam = parts[0]
        if (fam.toUpperCase().startsWith('V')) {
            fam = fam.substring(1)
        }
        result.familia_code = fam

        result.ref_code = parts[1]
        result.version_code = parts[2]
        result.color_code = parts[3]
        result.sku_base = parts.slice(0, 3).join('-')

        let lookupFamilia = result.familia_code
        if (lookupFamilia.toUpperCase().startsWith('V')) {
            lookupFamilia = lookupFamilia.substring(1)
        }

        try {
            const rows = await dbQuery(
                `SELECT family_code, product_type, use_destination, zone_home, assembled_default, rh_default, allowed_lines FROM public.families WHERE family_code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
            )
            if (rows && rows.length > 0) {
                const familia = rows[0]
                result.product_type = familia.product_type
                result.use_destination = familia.use_destination
                result.zone_home = familia.zone_home
                result.assembled_flag = familia.assembled_default
                if (familia.rh_default) result.rh = 'RH'
                result.allowed_lines = familia.allowed_lines || []

                setInheritance('product_type', familia.product_type, 'family');
                setInheritance('use_destination', familia.use_destination, 'family');
                setInheritance('zone_home', familia.zone_home, 'family');
                if (familia.rh_default) setInheritance('rh', 'RH', 'family');
                setInheritance('assembled_flag', familia.assembled_default ? true : null, 'family');
            }
        } catch (e) {
            console.error('codeParser: error querying family fallback', e)
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh = 'RH'
            result._version_overrides.rh = 'RH';
            setInheritance('rh', 'RH', 'version_code');
        }

        // --- Detección de Versión desde Diccionario ---
        if (result.version_code) {
            try {
                const verRows = await dbQuery(`SELECT version_code, version_description, automatic_version_rules FROM public.global_version_rules WHERE version_code = '${result.version_code.toUpperCase().replace(/'/g, "''")}' AND COALESCE(status, 'ACTIVO') <> 'INACTIVO' LIMIT 1`);
                if (verRows && verRows.length > 0) {
                    const ver = verRows[0];
                    const rules = typeof ver.automatic_version_rules === 'string' ? JSON.parse(ver.automatic_version_rules) : (ver.automatic_version_rules || {});

                    const GVR_FIELDS = [
                        'rh', 'bisagras', 'carb2', 'canto_puertas', 'accessory_text',
                        'door_color_text', 'armado_con_lvm', 'pur',
                        'special_label', 'version_label', 'private_label_client_name',
                        'width_cm', 'depth_cm', 'height_cm', 'weight_kg'
                    ];
                    for (const field of GVR_FIELDS) {
                        if (rules[field] !== undefined && rules[field] !== null && rules[field] !== '') {
                            (result as any)[field] = rules[field];
                            result._version_overrides[field] = String(rules[field]);
                            setInheritance(field, rules[field], 'version_rule');
                        }
                    }
                }
            } catch (e) {
                console.error('codeParser: error querying version dictionary fallback', e);
            }
        }

        // --- BÚSQUEDA JERÁRQUICA DE HISTORIAL (SMART LOOKUP V6.1) ---
        try {
            let foundData: any = null;
            let source = 'parser';

            // 1. Intentar por SKU COMPLETO (Exacto)
            const exactProduct = await composeProductBySku(code)
            if (exactProduct) {
                source = 'sku_match';
                result.product_name = exactProduct.product_name || result.product_name
                result.line = exactProduct.line || result.line
                result.designation = exactProduct.designation || result.designation
                result.commercial_measure = exactProduct.commercial_measure || result.commercial_measure
                result.special_label = exactProduct.special_label || result.special_label
                result.width_cm = exactProduct.width_cm ?? result.width_cm
                result.depth_cm = exactProduct.depth_cm ?? result.depth_cm
                result.height_cm = exactProduct.height_cm ?? result.height_cm
                result.weight_kg = exactProduct.weight_kg ?? result.weight_kg
                result.product_type = exactProduct.product_type || result.product_type
                result.use_destination = exactProduct.use_destination || result.use_destination
                result.zone_home = exactProduct.zone_home || result.zone_home
                result.isometric_path = exactProduct.isometric_path || result.isometric_path
                result.isometric_asset_id = exactProduct.isometric_asset_id || result.isometric_asset_id
                result.status = exactProduct.status || result.status
                result.version_label = exactProduct.version_label || result.version_label
                result.bisagras = exactProduct.bisagras || result.bisagras
                result.carb2 = exactProduct.carb2 || result.carb2
                result.canto_puertas = exactProduct.canto_puertas || result.canto_puertas
                result.accessory_text = exactProduct.accessory_text || result.accessory_text
                result.rh = exactProduct.rh || result.rh
                result.assembled_flag = exactProduct.assembled_flag
                result.armado_con_lvm = exactProduct.armado_con_lvm || result.armado_con_lvm
                result.private_label_client_name = exactProduct.private_label_client_name || result.private_label_client_name
                ;(result as any).color_name = exactProduct.color_name || (result as any).color_name

                setInheritance('product_name', result.product_name, 'historic_sku');
                setInheritance('line', result.line, 'historic_sku');
                setInheritance('designation', result.designation, 'historic_sku');
                setInheritance('commercial_measure', result.commercial_measure, 'historic_sku');
                setInheritance('special_label', result.special_label, 'historic_sku');
                setInheritance('width_cm', result.width_cm, 'historic_sku');
                setInheritance('depth_cm', result.depth_cm, 'historic_sku');
                setInheritance('height_cm', result.height_cm, 'historic_sku');
                setInheritance('weight_kg', result.weight_kg, 'historic_sku');
                setInheritance('product_type', result.product_type, 'historic_sku');
                setInheritance('use_destination', result.use_destination, 'historic_sku');
                setInheritance('zone_home', result.zone_home, 'historic_sku');
                setInheritance('bisagras', result.bisagras, 'historic_sku');
                setInheritance('carb2', result.carb2, 'historic_sku');
                setInheritance('canto_puertas', result.canto_puertas, 'historic_sku');
                setInheritance('accessory_text', result.accessory_text, 'historic_sku');
                setInheritance('rh', result.rh, 'historic_sku');
                setInheritance('armado_con_lvm', result.armado_con_lvm, 'historic_sku');
                setInheritance('private_label_client_name', result.private_label_client_name, 'historic_sku');
                setInheritance('version_label', result.version_label, 'historic_sku');
            } else {
                // 2. Intentar por SKU BASE (Misma Familia-Ref-Version)
                const skuBaseRows = await dbQuery(`
                    SELECT v.*, r.family_code, r.reference_code, r.product_name, r.designation, r.line,
                           r.commercial_measure, r.special_label, r.width_cm, r.depth_cm, r.height_cm,
                           r.weight_kg, r.stacking_max, r.isometric_path, r.isometric_asset_id, r.ref_attrs,
                           f.product_type, f.zone_home, f.use_destination, f.assembled_default, f.rh_default,
                           r.status AS ref_status,
                           v.status AS version_status,
                           'ACTIVO'::text AS family_status,
                           gvr.status AS global_version_rule_status,
                           gvr.automatic_version_rules
                    FROM public.product_versions v
                    JOIN public.product_references r ON v.reference_id = r.id
                    JOIN public.families f ON r.family_code = f.family_code
                    LEFT JOIN public.global_version_rules gvr ON v.version_code = gvr.version_code
                    WHERE v.sku_base = '${result.sku_base.replace(/'/g, "''")}'
                    LIMIT 1
                `);

                if (skuBaseRows && skuBaseRows.length > 0) {
                    foundData = skuBaseRows[0];
                    source = 'version_match';
                } else {
                    // 3. Intentar por FAMILIA + REFERENCIA (Mismo mueble, distinta versión)
                    const famRefRows = await dbQuery(`
                        SELECT r.*, f.product_type, f.zone_home, f.use_destination, f.assembled_default, f.rh_default,
                               r.status AS ref_status,
                               'ACTIVO'::text AS family_status
                        FROM public.product_references r
                        JOIN public.families f ON r.family_code = f.family_code
                        WHERE r.family_code = '${result.familia_code.replace(/'/g, "''")}'
                          AND r.reference_code = '${result.ref_code.replace(/'/g, "''")}'
                        LIMIT 1
                    `);
                    if (famRefRows && famRefRows.length > 0) {
                        foundData = famRefRows[0];
                        source = 'reference_match';
                        if (foundData.isometric_path) {
                            result.isometric_from_different_version = true;
                        }
                    }
                }
            }

            if (foundData) {
                const d = foundData;
                const effectiveContext = buildEffectiveProductContext(d, { includeSkuOverrides: source === 'sku_match' });
                const effectiveAttrs = effectiveContext.effective_attrs;
                const historicSource = source === 'sku_match' ? 'historic_sku' : source === 'version_match' ? 'historic_version' : 'historic_reference';

                // ── Direct row fields (reference-level) ──
                if (d.product_name) { result.product_name = d.product_name; setInheritance('product_name', d.product_name, 'historic_reference'); }
                if (d.line) { result.line = d.line; setInheritance('line', d.line, 'historic_reference'); }
                if (d.designation) { result.designation = d.designation; setInheritance('designation', d.designation, 'historic_reference'); }
                if (d.commercial_measure) { result.commercial_measure = d.commercial_measure; setInheritance('commercial_measure', d.commercial_measure, 'historic_reference'); }
                if (d.product_type) { result.product_type = d.product_type; setInheritance('product_type', d.product_type, source === 'sku_match' ? 'historic_sku' : 'historic_reference'); }
                if (d.use_destination) { result.use_destination = d.use_destination; setInheritance('use_destination', d.use_destination, source === 'sku_match' ? 'historic_sku' : 'historic_reference'); }
                if (d.zone_home) { result.zone_home = d.zone_home; setInheritance('zone_home', d.zone_home, source === 'sku_match' ? 'historic_sku' : 'historic_reference'); }

                // ── Resolved fields (from effectiveContext) ──
                // special_label: resolved may be null if 'NA' (normalizeText strips it);
                // fall back to raw row value so explicit 'NA' from reference is preserved
                result.special_label = effectiveContext.resolved_special_label || d.special_label || result.special_label;
                result.width_cm = effectiveContext.resolved_width_cm ?? result.width_cm;
                result.depth_cm = effectiveContext.resolved_depth_cm ?? result.depth_cm;
                result.height_cm = effectiveContext.resolved_height_cm ?? result.height_cm;
                result.weight_kg = effectiveContext.resolved_weight_kg ?? result.weight_kg;
                result.isometric_path = d.isometric_path || result.isometric_path;
                result.isometric_asset_id = d.isometric_asset_id || result.isometric_asset_id;
                result.status = d.status || result.status;

                // ── effective_attrs fields (precedence: family < ref < gvr < version < sku) ──
                const layers = [
                    { name: 'sku', attrs: effectiveContext.sku_attrs },
                    { name: 'version', attrs: effectiveContext.version_attrs },
                    { name: 'gvr', attrs: effectiveContext.global_version_rules },
                    { name: 'ref', attrs: effectiveContext.ref_attrs },
                ];
                function contributingLayer(field: string): string | null {
                    for (const l of layers) {
                        if (l.attrs[field] !== undefined) return l.name;
                    }
                    const famVal = effectiveContext.family_defaults[field];
                    if (famVal !== undefined && famVal !== false && famVal !== 'NA') return 'family';
                    return null;
                }
                function fieldSource(layer: string): string {
                    if (layer === 'sku') return 'historic_sku';
                    if (layer === 'version') return 'historic_version';
                    if (layer === 'gvr') return 'historic_version';
                    if (layer === 'ref') return 'historic_reference';
                    if (layer === 'family') return 'family';
                    return historicSource;
                }
                function setField(field: string, value: any) {
                    const prev = (result as any)[field];
                    if (value !== null && value !== undefined && value !== '') {
                        (result as any)[field] = value || prev;
                        if (!result.inheritance_sources[field]) {
                            const contributing = contributingLayer(field);
                            if (contributing) {
                                setInheritance(field, (result as any)[field], fieldSource(contributing));
                            }
                        }
                    }
                }

                setField('bisagras', effectiveAttrs.bisagras);
                setField('carb2', effectiveAttrs.carb2);
                setField('canto_puertas', effectiveAttrs.canto_puertas);
                setField('accessory_text', effectiveAttrs.accessory_text);
                setField('rh', effectiveAttrs.rh);
                setField('armado_con_lvm', effectiveAttrs.armado_con_lvm);
                setField('door_color_text', effectiveAttrs.door_color_text);
                // version_label: when data came from a version, the product_versions
                // table owns this column — always lock it so edits don't conflict
                if (source === 'version_match') {
                    const vlVal = effectiveAttrs.version_label || d.version_label || result.version_label;
                    if (vlVal) result.version_label = vlVal;
                    if (!result.inheritance_sources['version_label']) {
                        setInheritance('version_label', result.version_label || 'NA', 'historic_version');
                    }
                } else {
                    const vlSrc = effectiveAttrs.version_label || d.version_label;
                    if (vlSrc) {
                        result.version_label = vlSrc;
                        if (!result.inheritance_sources['version_label']) {
                            setInheritance('version_label', vlSrc, 'historic_version');
                        }
                    }
                }

                // assembled_flag: explicit boolean handling (false is a valid value)
                if (effectiveAttrs.assembled_flag !== undefined) {
                    result.assembled_flag = effectiveAttrs.assembled_flag;
                    const contributing = contributingLayer('assembled_flag');
                    if (contributing) {
                        setInheritance('assembled_flag', result.assembled_flag, fieldSource(contributing));
                    }
                }

                result.private_label_client_name =
                    effectiveContext.resolved_private_label_client_name || result.private_label_client_name;
                ;(result as any).color_name = effectiveContext.resolved_color_name || (result as any).color_name

                ;(result as any)._source = source;

                if (result.special_label) setInheritance('special_label', result.special_label, fieldSource(contributingLayer('special_label') || historicSource));
                if (result.width_cm !== null) setInheritance('width_cm', result.width_cm, fieldSource(contributingLayer('width_cm') || historicSource));
                if (result.depth_cm !== null) setInheritance('depth_cm', result.depth_cm, fieldSource(contributingLayer('depth_cm') || historicSource));
                if (result.height_cm !== null) setInheritance('height_cm', result.height_cm, fieldSource(contributingLayer('height_cm') || historicSource));
                if (result.weight_kg !== null) setInheritance('weight_kg', result.weight_kg, fieldSource(contributingLayer('weight_kg') || historicSource));
                if (result.private_label_client_name) setInheritance('private_label_client_name', result.private_label_client_name, fieldSource(contributingLayer('private_label_client_name') || historicSource));
            }
        } catch (e) {
            console.error('codeParser: error in hierarchical lookup V6.1', e);
        }

        // --- Recuperación automática de nombre de color si no se tiene ---
        if (result.color_code && !(result as any).color_name) {
            try {
                const paddedColorCode = result.color_code.padStart(4, '0');
                const colorRows = await dbQuery(`SELECT name_color_sap FROM public.colors WHERE code_4dig = '${paddedColorCode.replace(/'/g, "''")}' LIMIT 1`);
                if (colorRows && colorRows.length > 0) {
                    (result as any).color_name = colorRows[0].name_color_sap;
                }
        } catch {
            }
        }
    } else {
        result.familia_code = code
    }

    if (sapDescription) {
        const descUpper = sapDescription.toUpperCase();

        const shouldOverride = (field: string): boolean => {
            return !result.inheritance_sources[field];
        }
        
        const setSap = (field: string, value: any) => {
            if (value !== null && value !== undefined && value !== '') {
                result.inheritance_sources[field] = 'sap_desc';
            }
        }

        // rh: solo si no fue definido por herencia
        if (descUpper.includes('RH') && shouldOverride('rh')) {
            result.rh = 'RH';
            setSap('rh', result.rh);
        }

        // assembled_flag: solo si no fue definido por herencia
        if (descUpper.includes('ARMADO') && shouldOverride('assembled_flag') && !result.assembled_flag) {
            result.assembled_flag = true;
            setSap('assembled_flag', result.assembled_flag);
        }

        // Detección de Medida Comercial (solo si no fue definido por herencia)
        if (shouldOverride('commercial_measure')) {
            const measureMatch = descUpper.match(/\b(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)\b/);
            if (measureMatch) {
                result.commercial_measure = `${measureMatch[1]}X${measureMatch[2]}`.replace(',', '.');
                setSap('commercial_measure', result.commercial_measure);
            }
        }

        // --- SMART MATCHING FROM CATALOG (V6.2) ---
        try {
            const [nameRows, desigRows, lineRows, destRows, zoneRows, colorRows] = await Promise.all([
                dbQuery(`SELECT DISTINCT product_name FROM public.product_references WHERE product_name IS NOT NULL AND product_name != ''`),
                dbQuery(`SELECT DISTINCT designation FROM public.product_references WHERE designation IS NOT NULL AND designation != ''`),
                dbQuery(`SELECT DISTINCT line FROM public.product_references WHERE line IS NOT NULL AND line != ''`),
                dbQuery(`SELECT DISTINCT use_destination FROM public.families WHERE use_destination IS NOT NULL AND use_destination != ''`),
                dbQuery(`SELECT DISTINCT zone_home FROM public.families WHERE zone_home IS NOT NULL AND zone_home != ''`),
                dbQuery(`SELECT DISTINCT name_color_sap FROM public.colors WHERE name_color_sap IS NOT NULL AND name_color_sap != ''`)
            ]);

            if (!result.product_name && shouldOverride('product_name')) {
                const names = nameRows.map((r: any) => r.product_name);
                const matched = findBestMatch(descUpper, names);
                if (matched) { result.product_name = matched; setSap('product_name', matched); }
            }
            if (!result.designation && shouldOverride('designation')) {
                const desigs = desigRows.map((r: any) => r.designation);
                const matched = findBestMatch(descUpper, desigs);
                if (matched) { result.designation = matched; setSap('designation', matched); }
            }
            if (!result.line && shouldOverride('line')) {
                const lines = lineRows.map((r: any) => r.line);
                const matched = findBestMatch(descUpper, lines);
                if (matched) { result.line = matched; setSap('line', matched); }
            }
            if (!result.use_destination && shouldOverride('use_destination')) {
                const dests = destRows.map((r: any) => r.use_destination);
                const matched = findBestMatch(descUpper, dests);
                if (matched) { result.use_destination = matched; setSap('use_destination', matched); }
            }
            if (!result.zone_home && shouldOverride('zone_home')) {
                const zones = zoneRows.map((r: any) => r.zone_home);
                const matched = findBestMatch(descUpper, zones);
                if (matched) { result.zone_home = matched; setSap('zone_home', matched); }
            }
            if (!(result as any).color_name && shouldOverride('color_name')) {
                const colorNames = colorRows.map((r: any) => r.name_color_sap);
                const matchedColor = findBestMatch(descUpper, colorNames);
                if (matchedColor) { (result as any).color_name = matchedColor; setSap('color_name', matchedColor); }
            }
        } catch {
        }

        // Detección Genérica de Designación (Fallback)
        if (!result.designation && shouldOverride('designation')) {
            if (descUpper.includes(' INF ') || descUpper.includes('INFERIOR')) { result.designation = 'INFERIOR'; setSap('designation', 'INFERIOR'); }
            else if (descUpper.includes(' SUP ') || descUpper.includes('SUPERIOR')) { result.designation = 'SUPERIOR'; setSap('designation', 'SUPERIOR'); }
            else if (descUpper.includes(' ELEV ') || descUpper.includes('ELEVADO')) { result.designation = 'ELEVADO'; setSap('designation', 'ELEVADO'); }
        }

        const foundAccessories: string[] = [];

        // Detección de Puertas/Cajones (4P, 2C, etc.)
        const doorsMatch = descUpper.match(/\b(\d+)\s*(?:[Pp]|PUERTAS?)\b/);
        const drawersMatch = descUpper.match(/\b(\d+)\s*(?:[Cc]|CAJONES?)\b/);
        let technicalSpec = '';
        if (doorsMatch) {
            technicalSpec += `${doorsMatch[1]}P`;
        }
        if (drawersMatch) {
            technicalSpec += (technicalSpec ? ' ' : '') + `${drawersMatch[1]}C`;
        }
        if (technicalSpec) {
            if (shouldOverride('special_label')) {
                result.special_label = technicalSpec;
                setSap('special_label', technicalSpec);
            } else if (result.special_label && result.special_label !== 'NA' && result.special_label !== technicalSpec) {
                result.warnings.push(`Revisar: ${technicalSpec} de descripción SAP no compatible con ${result.special_label} heredado de ${result.inheritance_sources['special_label'] || 'catálogo'}`);
            }
        }

        // Detección de Cantos Especiales
        const cantoMatch = descUpper.match(/CANTO\s*(\d*\.?\d+)MM/);
        let cantoText = '';
        if (cantoMatch) {
            const mm = parseFloat(cantoMatch[1]);
            if (mm === 2 && shouldOverride('canto_puertas')) {
                result.canto_puertas = 'CANTO 2 MM';
                setSap('canto_puertas', 'CANTO 2 MM');
            } else if (mm !== 2) {
                cantoText = `CANTO ${mm} MM`;
                foundAccessories.push(cantoText);
            }
        }

        // CIERRE LENTO: solo si viene acompañado de FULL EXTENSION
        if (descUpper.includes('CIERRE LENTO OCULTO')) {
            foundAccessories.push('CIERRE LENTO OCULTO');
        } else if (descUpper.includes('FULL EXTENSION') && descUpper.includes('CIERRE LENTO')) {
            foundAccessories.push('RFE CIERRE LENTO');
        }

        // Fallback de Nombre para marcas específicas
        if (!result.product_name && shouldOverride('product_name')) {
            const hardcodedFallbacks = ['POLOCK', 'VALDEZ', 'GODAI', 'TIZIANO', 'DA VINCI', 'BASICO', 'BÁSICO'];
            for (const name of hardcodedFallbacks) {
                if (descUpper.includes(name)) {
                    result.product_name = name;
                    setSap('product_name', name);
                    break;
                }
            }
        }

        // -------------------------------------

        if (foundAccessories.length > 0) {
            const historicalAcc = result.accessory_text ? result.accessory_text.toUpperCase() : '';
            const detectedAcc = foundAccessories.join(' ').toUpperCase();

            if (historicalAcc) {
                const historicalParts = historicalAcc.split(' ');
                const newParts = detectedAcc.split(' ').filter(p => !historicalParts.includes(p));
                if (newParts.length > 0) {
                    result.accessory_text = `${historicalAcc} ${newParts.join(' ')}`;
                }
            } else {
                result.accessory_text = detectedAcc;
            }
            if (result.accessory_text) {
                setSap('accessory_text', result.accessory_text);
            }
        }

        // Kits - solo si assembled_flag es true (herencia)
        if (result.assembled_flag) {
            const washbasinMatch = sapDescription.match(/\bC\/\s*(?:LVM\s+)?([A-Z0-9]+(?:\s+[A-Z0-9]+)?)/i);
            if (washbasinMatch && washbasinMatch[1] && shouldOverride('armado_con_lvm')) {
                const model = washbasinMatch[1].trim().toUpperCase();
                if (model !== 'LVM' && model.length > 2) {
                    result.armado_con_lvm = model;
                    setSap('armado_con_lvm', model);
                }
            }
        }

        // Detección de Marca Propia
        if (!result.private_label_client_name) {
            const knownClients = ['CHILEMAT', 'D-ACQUA', 'PROMART', 'FERMETAL', 'SODIMAC CHILE'];
            let matchedClient = '';
            for (const client of knownClients) {
                if (descUpper.includes(client.toUpperCase())) {
                    matchedClient = client;
                    break;
                }
            }
            if (!matchedClient) {
                if (descUpper.includes('SODIMAC')) matchedClient = 'SODIMAC CHILE';
                else if (descUpper.includes('DAC ')) matchedClient = 'D-ACQUA';
                else if (descUpper.includes('FMT ')) matchedClient = 'FERMETAL';
            }
            if (matchedClient) {
                try {
                    const clientRows = await dbQuery(`SELECT name FROM public.clients WHERE UPPER(name) = '${matchedClient.replace(/'/g, "''")}' OR (name = 'SODIMAC CHILE' AND '${matchedClient.replace(/'/g, "''")}' LIKE 'SODIMAC%') LIMIT 1`);
                    if (clientRows && clientRows.length > 0) { result.private_label_client_name = clientRows[0].name; setSap('private_label_client_name', clientRows[0].name); }
                } catch {}
            }
        }

        // Fallbacks por siglas
        if (!result.use_destination && shouldOverride('use_destination')) {
            if (descUpper.includes('LVM')) { result.use_destination = 'LAVAMANOS'; setSap('use_destination', 'LAVAMANOS'); }
            else if (descUpper.includes('LVR')) { result.use_destination = 'LAVARROPAS'; setSap('use_destination', 'LAVARROPAS'); }
            else if (descUpper.includes('LVP')) { result.use_destination = 'LAVAPLATOS'; setSap('use_destination', 'LAVAPLATOS'); }
            else if (descUpper.includes('COC')) { result.use_destination = 'COCINA'; setSap('use_destination', 'COCINA'); }
        }

        if ((descUpper.includes('CARB 2') || descUpper.includes('CARB2')) && shouldOverride('carb2')) {
            result.carb2 = 'CARB2';
            setSap('carb2', 'CARB2');
        }
        if (descUpper.includes('FRENTES 18MM')) {
            if (shouldOverride('special_label')) {
                result.special_label = (result.special_label && result.special_label !== 'NA')
                    ? `${result.special_label} FRENTES 18MM`
                    : 'FRENTES 18MM';
                setSap('special_label', result.special_label);
            } else if (result.special_label && result.special_label !== 'NA') {
                result.special_label = `${result.special_label} FRENTES 18MM`;
            }
        }
    }

    return result
}
