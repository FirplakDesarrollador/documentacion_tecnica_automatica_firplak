import { dbQuery } from '@/lib/supabase'

export interface ParsedCodeResult {
    familia_code: string | null
    ref_code: string | null
    version_code: string | null
    color_code: string | null
    rh_flag: boolean
    product_type: string | null
    use_destination: string | null
    zone_home: string | null
    assembled_flag: boolean
    sku_base: string | null
    accessory_text: string | null
    furniture_name: string | null
    line: string | null
    designation: string | null
    isometric_path: string | null
    width_cm: number | null
    depth_cm: number | null
    height_cm: number | null
    weight_kg: number | null
    commercial_measure: string | null
    edge_2mm_flag: boolean
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
        rh_flag: Boolean(manualRhFlag),
        product_type: null,
        use_destination: null,
        zone_home: null,
        assembled_flag: false,
        sku_base: null,
        accessory_text: null,
        furniture_name: null,
        line: null,
        designation: null,
        isometric_path: null,
        width_cm: null,
        depth_cm: null,
        height_cm: null,
        weight_kg: null,
        commercial_measure: null,
        edge_2mm_flag: false
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
                `SELECT code, product_type, use_destination, zone_home, assembled_default, rh_default FROM public.familias WHERE code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
            )
            if (rows && rows.length > 0) {
                const familia = rows[0]
                result.product_type = familia.product_type
                result.use_destination = familia.use_destination
                result.zone_home = familia.zone_home
                result.assembled_flag = familia.assembled_default
                if (familia.rh_default) result.rh_flag = true
            }
        } catch (e) {
            console.error('codeParser: error querying familia', e)
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh_flag = true
        }
    } else {
        result.familia_code = code
    }

    if (sapDescription) {
        const descUpper = sapDescription.toUpperCase();
        
        if (descUpper.includes('RH')) {
            result.rh_flag = true
        }

        // Detección de Medida Comercial
        const measureMatch = descUpper.match(/\b(\d+X\d+)\b/);
        if (measureMatch) {
            result.commercial_measure = measureMatch[1];
        }

        // Detección de Cantos Especiales (e.g. 1.5MM vs 2MM)
        const cantoMatch = descUpper.match(/CANTO\s*(\d*\.?\d+)MM/);
        let cantoText = '';
        if (cantoMatch) {
            const mm = parseFloat(cantoMatch[1]);
            if (mm === 2) {
                result.edge_2mm_flag = true;
            } else {
                cantoText = `CANTO ${mm}MM`;
            }
        }

        // Detección de Accesorios (Específico CIERRE LENTO OCULTO)
        let foundAccessories = []
        if (cantoText) foundAccessories.push(cantoText)
        
        if (descUpper.includes('CIERRE LENTO OCULTO')) {
            foundAccessories.push('CIERRE LENTO OCULTO');
        } else if (descUpper.includes('CIERRE LENTO')) {
            foundAccessories.push('CIERRE LENTO');
        }

        // --- Lógicas Especiales de Muebles ---
        // 1. GODAI
        if (descUpper.includes('GODAI')) {
            if (descUpper.includes('ENTREPA')) {
                result.designation = 'SOPORTE Y ESTRUCTURA CON ENTREPAÑO';
            } else if (descUpper.includes('SOPORTE Y ESTRUCTURA')) {
                result.designation = 'SOPORTE Y ESTRUCTURA';
            } else if (descUpper.includes('SOPORTE')) {
                result.designation = 'SOPORTE';
            } else if (descUpper.includes('CUBO-CAJON') || descUpper.includes('CUBO CAJON')) {
                result.designation = 'CUBO-CAJON';
            } else if (descUpper.includes('CUBO')) {
                result.designation = 'CUBO';
            }
        }

        // 2. VALDEZ y BÁSICOS
        if (descUpper.includes('VALDEZ') || descUpper.includes('BASICO') || descUpper.includes('BÁSICO')) {
            if (descUpper.includes('PISO')) {
                result.designation = 'A PISO';
            } else {
                result.designation = 'ELEVADO';
            }
            
            // 3. Manijas para BÁSICOS
            if (descUpper.includes('BASICO') || descUpper.includes('BÁSICO')) {
                if (descUpper.includes('SIN MANIJA')) {
                    foundAccessories.push('SIN MANIJAS');
                } else {
                    foundAccessories.push('CON MANIJAS');
                }
            }
        }
        // -------------------------------------

        if (foundAccessories.length > 0) {
            result.accessory_text = foundAccessories.join(' ');
        }

        // Smart Lookup de Dimensiones y Textos Históricos
        if (result.ref_code && result.commercial_measure) {
            try {
                const dimRows = await dbQuery(`
                    SELECT width_cm, depth_cm, height_cm, weight_kg, furniture_name, line, designation, isometric_path, isometric_asset_id 
                    FROM public.products 
                    WHERE ref_code = '${result.ref_code}' AND commercial_measure = '${result.commercial_measure}'
                    AND width_cm IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                `);
                console.log('--- DEBUG DIMROWS ---', JSON.stringify(dimRows));
                if (dimRows && dimRows.length > 0) {
                    const dims = dimRows[0];
                    if (dims.width_cm !== null) result.width_cm = parseFloat(dims.width_cm);
                    if (dims.depth_cm !== null) result.depth_cm = parseFloat(dims.depth_cm);
                    if (dims.height_cm !== null) result.height_cm = parseFloat(dims.height_cm);
                    if (dims.weight_kg !== null) result.weight_kg = parseFloat(dims.weight_kg);
                    if (dims.furniture_name) result.furniture_name = dims.furniture_name;
                    if (dims.line) result.line = dims.line;
                    if (dims.designation) result.designation = dims.designation;
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
    }

    return result
}
