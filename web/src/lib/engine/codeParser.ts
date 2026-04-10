import { dbQuery } from '@/lib/supabase'

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

        let lookupFamilia = result.familia_code
        if (lookupFamilia.toUpperCase().startsWith('V')) {
            lookupFamilia = lookupFamilia.substring(1)
        }

        try {
            const rows = await dbQuery(
                `SELECT code, product_type, use_destination, zone_home, assembled_default, rh_default, allowed_lines FROM public.familias WHERE code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
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
            console.error('codeParser: error querying familia', e)
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh = 'RH'
        }

        // --- Detección de Versión desde Diccionario ---
        if (result.version_code) {
            try {
                const verRows = await dbQuery(`SELECT code, description, automatic_rules FROM public.versions WHERE code = '${result.version_code.toUpperCase().replace(/'/g, "''")}' LIMIT 1`);
                if (verRows && verRows.length > 0) {
                    const ver = verRows[0];
                    const rules = ver.automatic_rules || {};
                    
                    if (rules.rh) result.rh = rules.rh;
                    if (rules.client_name) result.private_label_client_name = rules.client_name;
                    
                    // Guardamos la descripción para usarla en accessory_text si sapDescription existe
                    (result as any)._version_description = ver.description;
                }
            } catch (e) {
                console.error('codeParser: error querying version dictionary', e);
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

        // Detección de Medida Comercial
        const measureMatch = descUpper.match(/\b(\d+X\d+)\b/);
        if (measureMatch) {
            result.commercial_measure = measureMatch[1];
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
            }
        }

        // Detección de Accesorios
        let foundAccessories = []
        if (cantoText) foundAccessories.push(cantoText)

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

        // --- Lógicas Especiales de Muebles y Designación ---
        if (descUpper.includes('GODAI')) {
            if (descUpper.includes('ENTREPA')) result.designation = 'SOPORTE Y ESTRUCTURA CON ENTREPAÑO';
            else if (descUpper.includes('SOPORTE Y ESTRUCTURA')) result.designation = 'SOPORTE Y ESTRUCTURA';
            else if (descUpper.includes('SOPORTE')) result.designation = 'SOPORTE';
            else if (descUpper.includes('CUBO-CAJON') || descUpper.includes('CUBO CAJON')) result.designation = 'CUBO-CAJON';
            else if (descUpper.includes('CUBO')) result.designation = 'CUBO';
        }

        if (descUpper.includes('VALDEZ') || descUpper.includes('BASICO') || descUpper.includes('BÁSICO') || descUpper.includes('POLOCK')) {
            if (descUpper.includes('PISO')) result.designation = 'A PISO';
            else if (descUpper.includes('ELEVADO')) result.designation = 'ELEVADO';
            
            if (descUpper.includes('BASICO') || descUpper.includes('BÁSICO')) {
                if (descUpper.includes('SIN MANIJA')) foundAccessories.push('SIN MANIJAS');
                else foundAccessories.push('CON MANIJAS');
            }
        }

        // --- Detección de Nombre de Mueble (Fallback si no hay historial) ---
        if (!result.cabinet_name) {
            const commonNames = ['POLOCK', 'VALDEZ', 'GODAI', 'TIZIANO', 'DA VINCI', 'BASICO', 'BÁSICO'];
            for (const name of commonNames) {
                if (descUpper.includes(name)) {
                    result.cabinet_name = name;
                    break;
                }
            }
        }

        // --- Detección de Destino de Uso por Siglas ---
        if (!result.use_destination) {
            if (descUpper.includes('LVM')) result.use_destination = 'LAVAMANOS';
            else if (descUpper.includes('LVR')) result.use_destination = 'LAVARROPAS';
            else if (descUpper.includes('LVP')) result.use_destination = 'LAVAPLATOS';
            else if (descUpper.includes('COC')) result.use_destination = 'COCINA';
        }

        // --- Detección de Línea ---
        if (!result.line) {
            if (descUpper.includes('LIFE')) result.line = 'LIFE';
            else if (descUpper.includes('ESSENTIAL')) result.line = 'ESSENTIAL';
            else if (descUpper.includes('CLASS')) result.line = 'CLASS';
        }

        if (descUpper.includes('CARB 2') || descUpper.includes('CARB2')) {
            result.carb2 = 'SÍ';
        }

        // -------------------------------------

        if (foundAccessories.length > 0) {
            result.accessory_text = foundAccessories.join(' ');
        }

        // --- Valores por defecto para Muebles ---
        if (result.product_type === 'MUEBLE' || descUpper.includes('MUEBLE')) {
            if (!result.canto_puertas) result.canto_puertas = 'CANTO 2 MM';
        }

        // Smart Lookup de Dimensiones y Textos Históricos
        if (result.ref_code && result.commercial_measure) {
            try {
                const dimRows = await dbQuery(`
                    SELECT width_cm, depth_cm, height_cm, weight_kg, cabinet_name, line, designation, accessory_text, 
                           bisagras, carb2, special_label, zone_home, barcode_text,
                           isometric_path, isometric_asset_id 
                    FROM public.cabinet_products 
                    WHERE ref_code = '${result.ref_code}' AND commercial_measure = '${result.commercial_measure}'
                    AND width_cm IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                `);
                if (dimRows && dimRows.length > 0) {
                    const dims = dimRows[0];
                    if (dims.width_cm !== null) result.width_cm = parseFloat(dims.width_cm);
                    if (dims.depth_cm !== null) result.depth_cm = parseFloat(dims.depth_cm);
                    if (dims.height_cm !== null) result.height_cm = parseFloat(dims.height_cm);
                    if (dims.weight_kg !== null) result.weight_kg = parseFloat(dims.weight_kg);
                    if (dims.cabinet_name) result.cabinet_name = dims.cabinet_name;
                    if (dims.line) result.line = dims.line;
                    if (dims.designation && !result.designation) result.designation = dims.designation;
                    if (dims.bisagras) result.bisagras = dims.bisagras;
                    if (dims.carb2) result.carb2 = dims.carb2;
                    if (dims.special_label) result.special_label = dims.special_label;
                    if (dims.zone_home) result.zone_home = dims.zone_home;
                    if (dims.barcode_text) result.barcode_text = dims.barcode_text;
                    
                    // Fusionar accesorios históricos con los detectados
                    if (dims.accessory_text) {
                        const historicalAcc = String(dims.accessory_text).trim().toUpperCase();
                        const currentAcc = result.accessory_text ? result.accessory_text.toUpperCase() : '';
                        
                        if (currentAcc) {
                            // Si ya hay algo detectado (ej: CANTO 2MM), lo unimos evitando duplicados
                            const parts = currentAcc.split(' ');
                            if (!parts.includes(historicalAcc)) {
                                result.accessory_text = `${currentAcc} ${historicalAcc}`;
                            }
                        } else {
                            result.accessory_text = historicalAcc;
                        }
                    }
                    
                    if (
                        (dims.isometric_path && String(dims.isometric_path).trim() !== '' && String(dims.isometric_path).trim() !== 'null') || 
                        (dims.isometric_asset_id && String(dims.isometric_asset_id).trim() !== '' && String(dims.isometric_asset_id).trim() !== 'null')
                    ) {
                        result.isometric_path = dims.isometric_path || 'exists';
                    }
                }
            } catch (e) {
                console.error('codeParser: error during smart lookup', e);
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

        // --- Detección de Marca Propia (Contenido de la descripción) ---
        // Solo procedemos si no se ha detectado cliente por versión, o si la versión es genérica
        if (result.private_label_client_name === 'NA' || result.private_label_client_name === null) {
            const knownClients = ['CHILEMAT', 'D-ACQUA', 'PROMART', 'FERMETAL', 'SODIMAC CHILE'];
            let matchedClient = '';

            // Prioridad 1: Búsqueda exacta de nombres conocidos en la descripción
            for (const client of knownClients) {
                if (descUpper.includes(client.toUpperCase())) {
                    matchedClient = client;
                    break;
                }
            }

            // Prioridad 2: Alias comunes o variaciones que no están en la lista exacta
            if (!matchedClient) {
                if (descUpper.includes('SODIMAC')) matchedClient = 'SODIMAC CHILE';
                else if (descUpper.includes('DAC ')) matchedClient = 'D-ACQUA';
                else if (descUpper.includes('FMT ')) matchedClient = 'FERMETAL';
            }

            // Prioridad 3: Fallback al método del último guión
            if (!matchedClient) {
                const lastHyphenIndex = sapDescription.lastIndexOf('-');
                if (lastHyphenIndex !== -1 && lastHyphenIndex < sapDescription.length - 1) {
                    const potential = sapDescription.substring(lastHyphenIndex + 1).trim().toUpperCase();
                    if (potential.length > 2) {
                        matchedClient = potential;
                    }
                }
            }

            if (matchedClient) {
                try {
                    const clientRows = await dbQuery(`
                        SELECT name FROM public.clients 
                        WHERE UPPER(name) = '${matchedClient.replace(/'/g, "''")}'
                           OR (name = 'SODIMAC CHILE' AND '${matchedClient.replace(/'/g, "''")}' LIKE 'SODIMAC%')
                           OR (name = 'D-ACQUA' AND '${matchedClient.replace(/'/g, "''")}' = 'ACQUA')
                           OR (name = 'D-ACQUA' AND '${matchedClient.replace(/'/g, "''")}' = 'DAC')
                        LIMIT 1
                    `);
                    if (clientRows && clientRows.length > 0) {
                        result.private_label_client_name = clientRows[0].name;
                    }
                } catch (e) {
                    console.error('codeParser: error checking client name', e);
                }
            }
        }

        // --- Detección de Etiquetas Especiales ---
        if (descUpper.includes('FRENTES 18MM')) {
            result.special_label = 'FRENTES 18MM';
        }
    }

    return result
}
