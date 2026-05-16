import { dbQuery } from '@/lib/supabase'
import { composeProductBySku } from './product_composer'

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
    cabinet_name: string | null
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
    barcode_text: string | null
    status: string | null
    color_name?: string | null
    isometric_from_different_version?: boolean
    allowed_lines?: string[]
    isometric_asset_id?: string | null
    final_name_es?: string | null
}

// Helper for smart matching against a list of options
function findBestMatch(text: string, options: string[]) {
    if (!text || !options || options.length === 0) return null;
    const upperText = text.toUpperCase();
    
    // Filtramos opciones nulas/vacías y ordenamos por longitud descendente
    // para que coincida primero la más específica (ej: 'DOS CONSTRUCTORES' antes que 'CONSTRUCTOR')
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
        rh: manualRhFlag ? 'RH' : 'NA',
        product_type: null,
        use_destination: null,
        zone_home: null,
        assembled_flag: false,
        sku_base: null,
        accessory_text: null,
        cabinet_name: null,
        line: null,
        designation: null,
        isometric_path: null,
        width_cm: null,
        depth_cm: null,
        height_cm: null,
        weight_kg: null,
        commercial_measure: null,
        canto_puertas: null,
        armado_con_lvm: 'NA',
        carb2: 'NA',
        private_label_client_name: 'NA',
        special_label: 'NA',
        bisagras: 'NA',
        barcode_text: null,
        status: 'ACTIVO'
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

        // --- NEW PRODUCT FALLBACK ---
        // If not found in the new schema, we fallback to hierarchical lookup and family rules.
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
            }
        } catch (e) {
            console.error('codeParser: error querying family fallback', e)
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh = 'RH'
        }

        // --- Detección de Versión desde Diccionario ---
        if (result.version_code) {
            try {
                const verRows = await dbQuery(`SELECT version_code, version_description, automatic_version_rules FROM public.global_version_rules WHERE version_code = '${result.version_code.toUpperCase().replace(/'/g, "''")}' LIMIT 1`);
                if (verRows && verRows.length > 0) {
                    const ver = verRows[0];
                    const rules = typeof ver.automatic_version_rules === 'string' ? JSON.parse(ver.automatic_version_rules) : (ver.automatic_version_rules || {});
                    
                    if (rules.rh) result.rh = rules.rh;
                    if (rules.private_label_client_name) result.private_label_client_name = rules.private_label_client_name;
                    
                    // Guardamos la descripción para usarla en accessory_text si sapDescription existe
                    (result as any)._version_description = ver.version_description;
                }
            } catch (e) {
                console.error('codeParser: error querying version dictionary fallback', e);
            }
        }

        // ─── BÚSQUEDA JERÁRQUICA DE HISTORIAL (SMART LOOKUP V6.1) ───
        try {
            let foundData: any = null;
            let source = 'parser';

            // 1. Intentar por SKU COMPLETO (Exacto)
            const skuCompleteRows = await dbQuery(`
                SELECT s.*, v.sku_base, v.version_attrs, v.final_base_name_es, v.final_base_name_en,
                       r.family_code, r.reference_code, r.product_name, r.designation, r.line, 
                       r.commercial_measure, r.special_label, r.width_cm, r.depth_cm, r.height_cm, 
                       r.weight_kg, r.stacking_max, r.isometric_path, r.isometric_asset_id, r.ref_attrs,
                       f.product_type, f.zone_home, f.use_destination, f.assembled_default, f.rh_default
                FROM public.product_skus s
                JOIN public.product_versions v ON s.version_id = v.id
                JOIN public.product_references r ON v.reference_id = r.id
                JOIN public.families f ON r.family_code = f.family_code
                WHERE s.sku_complete = '${code.replace(/'/g, "''")}'
                LIMIT 1
            `);

            if (skuCompleteRows && skuCompleteRows.length > 0) {
                foundData = skuCompleteRows[0];
                source = 'sku_match';
            } else {
                // 2. Intentar por SKU BASE (Misma Familia-Ref-Version)
                const skuBaseRows = await dbQuery(`
                    SELECT v.*, r.family_code, r.reference_code, r.product_name, r.designation, r.line, 
                           r.commercial_measure, r.special_label, r.width_cm, r.depth_cm, r.height_cm, 
                           r.weight_kg, r.stacking_max, r.isometric_path, r.isometric_asset_id, r.ref_attrs,
                           f.product_type, f.zone_home, f.use_destination, f.assembled_default, f.rh_default
                    FROM public.product_versions v
                    JOIN public.product_references r ON v.reference_id = r.id
                    JOIN public.families f ON r.family_code = f.family_code
                    WHERE v.sku_base = '${result.sku_base.replace(/'/g, "''")}'
                    LIMIT 1
                `);

                if (skuBaseRows && skuBaseRows.length > 0) {
                    foundData = skuBaseRows[0];
                    source = 'version_match';
                } else {
                    // 3. Intentar por FAMILIA + REFERENCIA (Mismo mueble, distinta versión)
                    const famRefRows = await dbQuery(`
                        SELECT r.*, f.product_type, f.zone_home, f.use_destination, f.assembled_default, f.rh_default
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
                result.cabinet_name = d.product_name || result.cabinet_name;
                result.line = d.line || result.line;
                result.designation = d.designation || result.designation;
                result.commercial_measure = d.commercial_measure || result.commercial_measure;
                result.width_cm = d.width_cm ? parseFloat(d.width_cm) : result.width_cm;
                result.depth_cm = d.depth_cm ? parseFloat(d.depth_cm) : result.depth_cm;
                result.height_cm = d.height_cm ? parseFloat(d.height_cm) : result.height_cm;
                result.weight_kg = d.weight_kg ? parseFloat(d.weight_kg) : result.weight_kg;
                result.product_type = d.product_type || result.product_type;
                result.use_destination = d.use_destination || result.use_destination;
                result.zone_home = d.zone_home || result.zone_home;
                result.isometric_path = d.isometric_path || result.isometric_path;
                result.isometric_asset_id = d.isometric_asset_id || result.isometric_asset_id;
                result.status = d.status || result.status;
                
                // Atributos compuestos
                const refAttrs = typeof d.ref_attrs === 'string' ? JSON.parse(d.ref_attrs) : (d.ref_attrs || {});
                const verAttrs = typeof d.version_attrs === 'string' ? JSON.parse(d.version_attrs) : (d.version_attrs || {});
                
                const combinedAttrs = { ...refAttrs, ...verAttrs };
                
                result.bisagras = combinedAttrs.bisagras || result.bisagras;
                result.carb2 = combinedAttrs.carb2 || result.carb2;
                result.special_label = d.special_label || combinedAttrs.special_label || result.special_label;
                result.canto_puertas = combinedAttrs.canto_puertas || result.canto_puertas;
                result.accessory_text = combinedAttrs.accessory_text || result.accessory_text;
                result.rh = combinedAttrs.rh || (d.rh_default ? 'RH' : result.rh);
                result.assembled_flag = combinedAttrs.assembled_flag !== undefined ? combinedAttrs.assembled_flag : (d.assembled_default ?? result.assembled_flag);

                (result as any)._source = source;
            }
        } catch (e) {
            console.error('codeParser: error in hierarchical lookup V6.1', e);
        }

        // --- Recuperación automática de nombre de color si no se tiene ---
        if (result.color_code) {
            try {
                const paddedColorCode = result.color_code.padStart(4, '0');
                const colorRows = await dbQuery(`SELECT name_color_sap FROM public.colors WHERE code_4dig = '${paddedColorCode.replace(/'/g, "''")}' LIMIT 1`);
                if (colorRows && colorRows.length > 0) {
                    (result as any).color_name = colorRows[0].name_color_sap;
                }
            } catch (e) {
                console.error('codeParser: error querying color name', e);
            }
        }
    } else {
        result.familia_code = code
    }

    if (sapDescription) {
        const descUpper = sapDescription.toUpperCase();
        
        if (descUpper.includes('RH')) {
            result.rh = 'RH'
        }

        if (descUpper.includes('ARMADO')) {
            result.assembled_flag = true;
        }

        // Detección de Medida Comercial (Prioridad sobre historial si detectada)
        // Soporta: 150X55, 150 X 55, 150.5X55, 150,5X55
        const measureMatch = descUpper.match(/\b(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)\b/);
        if (measureMatch) {
            result.commercial_measure = `${measureMatch[1]}X${measureMatch[2]}`.replace(',', '.');
        }

        // --- SMART MATCHING FROM CATALOG (V6.2) ---
        // Si el historial falló o es producto nuevo, buscamos coincidencias con opciones existentes del catálogo maestro
        try {
            const [nameRows, desigRows, lineRows, destRows, zoneRows, colorRows] = await Promise.all([
                dbQuery(`SELECT DISTINCT product_name FROM public.product_references WHERE product_name IS NOT NULL AND product_name != ''`),
                dbQuery(`SELECT DISTINCT designation FROM public.product_references WHERE designation IS NOT NULL AND designation != ''`),
                dbQuery(`SELECT DISTINCT line FROM public.product_references WHERE line IS NOT NULL AND line != ''`),
                dbQuery(`SELECT DISTINCT use_destination FROM public.families WHERE use_destination IS NOT NULL AND use_destination != ''`),
                dbQuery(`SELECT DISTINCT zone_home FROM public.families WHERE zone_home IS NOT NULL AND zone_home != ''`),
                dbQuery(`SELECT DISTINCT name_color_sap FROM public.colors WHERE name_color_sap IS NOT NULL AND name_color_sap != ''`)
            ]);

            if (!result.cabinet_name) {
                const names = nameRows.map((r: any) => r.product_name);
                result.cabinet_name = findBestMatch(descUpper, names);
            }
            if (!result.designation) {
                const desigs = desigRows.map((r: any) => r.designation);
                result.designation = findBestMatch(descUpper, desigs);
            }
            if (!result.line) {
                const lines = lineRows.map((r: any) => r.line);
                result.line = findBestMatch(descUpper, lines);
            }
            if (!result.use_destination) {
                const dests = destRows.map((r: any) => r.use_destination);
                result.use_destination = findBestMatch(descUpper, dests);
            }
            if (!result.zone_home) {
                const zones = zoneRows.map((r: any) => r.zone_home);
                result.zone_home = findBestMatch(descUpper, zones);
            }
            if (!(result as any).color_name) {
                const colorNames = colorRows.map((r: any) => r.name_color_sap);
                const matchedColor = findBestMatch(descUpper, colorNames);
                if (matchedColor) (result as any).color_name = matchedColor;
            }
        } catch (e) {
            console.error('codeParser: smart matching catalog error', e);
        }

        // Detección Genérica de Designación (Fallback si no hay coincidencia exacta ni en catálogo)
        if (!result.designation) {
            if (descUpper.includes(' INF ') || descUpper.includes('INFERIOR')) result.designation = 'INFERIOR';
            else if (descUpper.includes(' SUP ') || descUpper.includes('SUPERIOR')) result.designation = 'SUPERIOR';
            else if (descUpper.includes(' ELEV ') || descUpper.includes('ELEVADO')) result.designation = 'ELEVADO';
        }

        let foundAccessories: string[] = [];

        // Detección de Puertas/Cajones (4P, 2C, 4 PUERTAS, 2 CAJONES, etc.)
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
            result.special_label = technicalSpec;
        }

        // Detección de Cantos Especiales
        const cantoMatch = descUpper.match(/CANTO\s*(\d*\.?\d+)MM/);
        let cantoText = '';
        if (cantoMatch) {
            const mm = parseFloat(cantoMatch[1]);
            if (mm === 2) {
                result.canto_puertas = 'CANTO 2 MM';
            } else {
                cantoText = `CANTO ${mm} MM`;
                foundAccessories.push(cantoText);
            }
        }
        // Agregar descripción de la versión desde el diccionario si existe
        const versionDesc = (result as any)._version_description;
        if (versionDesc && versionDesc !== result.version_code) {
            foundAccessories.push(versionDesc);
        }
        
        if (descUpper.includes('CIERRE LENTO OCULTO')) {
            foundAccessories.push('CIERRE LENTO OCULTO');
        } else if (descUpper.includes('CIERRE LENTO')) {
            foundAccessories.push('CIERRE LENTO');
        }

        // Fallback de Nombre de Mueble para marcas específicas si el smart matching falló
        if (!result.cabinet_name) {
            const hardcodedFallbacks = ['POLOCK', 'VALDEZ', 'GODAI', 'TIZIANO', 'DA VINCI', 'BASICO', 'BÁSICO'];
            for (const name of hardcodedFallbacks) {
                if (descUpper.includes(name)) {
                    result.cabinet_name = name;
                    break;
                }
            }
        }

        // -------------------------------------

        if (foundAccessories.length > 0) {
            // Fusionar accesorios históricos con los detectados
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
        }

        // Kits (Furniture prepared for Washbasin)
        const washbasinMatch = sapDescription.match(/\bC\/\s*(?:LVM\s+)?([A-Z0-9]+(?:\s+[A-Z0-9]+)?)/i);
        if (washbasinMatch && washbasinMatch[1]) {
            const model = washbasinMatch[1].trim().toUpperCase();
            if (model !== 'LVM' && model.length > 2) {
                result.armado_con_lvm = model;
            }
        }

        // Detección de Marca Propia
        if (result.private_label_client_name === 'NA' || result.private_label_client_name === null) {
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
                    if (clientRows && clientRows.length > 0) result.private_label_client_name = clientRows[0].name;
                } catch (e) {}
            }
        }

        // Fallbacks por siglas si falló el smart matching
        if (!result.use_destination) {
            if (descUpper.includes('LVM')) result.use_destination = 'LAVAMANOS';
            else if (descUpper.includes('LVR')) result.use_destination = 'LAVARROPAS';
            else if (descUpper.includes('LVP')) result.use_destination = 'LAVAPLATOS';
            else if (descUpper.includes('COC')) result.use_destination = 'COCINA';
        }

        if (descUpper.includes('CARB 2') || descUpper.includes('CARB2')) {
            result.carb2 = 'SÍ';
        }
        if (descUpper.includes('FRENTES 18MM')) {
            result.special_label = (result.special_label && result.special_label !== 'NA') 
                ? `${result.special_label} FRENTES 18MM` 
                : 'FRENTES 18MM';
        }
    }

    return result
}

