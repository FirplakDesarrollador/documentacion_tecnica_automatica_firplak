import { dbQuery } from '@/lib/supabase'
<<<<<<< HEAD
import { composeProductBySku } from './product_composer'
=======
>>>>>>> origin/Oswaldo_cambios

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
<<<<<<< HEAD
    isometric_from_different_version?: boolean
=======
    allowed_lines?: string[]
    isometric_asset_id?: string | null
    final_name_es?: string | null
>>>>>>> origin/Oswaldo_cambios
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

<<<<<<< HEAD
        // --- NEW PRODUCT FALLBACK ---
        // If not found in the new schema, we fallback to hierarchical lookup and family rules.
=======
>>>>>>> origin/Oswaldo_cambios
        let lookupFamilia = result.familia_code
        if (lookupFamilia.toUpperCase().startsWith('V')) {
            lookupFamilia = lookupFamilia.substring(1)
        }

        try {
            const rows = await dbQuery(
<<<<<<< HEAD
                `SELECT family_code, product_type, use_destination, zone_home, assembled_default, rh_default, allowed_lines FROM public.families WHERE family_code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
=======
                `SELECT code, product_type, use_destination, zone_home, assembled_default, rh_default, allowed_lines FROM public.familias WHERE code = '${lookupFamilia.replace(/'/g, "''")}' LIMIT 1`
>>>>>>> origin/Oswaldo_cambios
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
<<<<<<< HEAD
            console.error('codeParser: error querying family fallback', e)
=======
            console.error('codeParser: error querying familia', e)
>>>>>>> origin/Oswaldo_cambios
        }

        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh = 'RH'
        }

        // --- Detección de Versión desde Diccionario ---
        if (result.version_code) {
            try {
<<<<<<< HEAD
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
=======
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

        // ─── BÚSQUEDA JERÁRQUICA DE HISTORIAL (SMART LOOKUP V2) ───
        try {
            // Intentar primero por SKU BASE (Misma Familia-Ref-Version)
            let historicalProduct = null;
            const skuBaseRows = await dbQuery(`
                SELECT * FROM public.cabinet_products 
                WHERE sku_base = '${result.sku_base.replace(/'/g, "''")}'
                AND width_cm IS NOT NULL
                ORDER BY created_at DESC LIMIT 1
            `);

            if (skuBaseRows && skuBaseRows.length > 0) {
                historicalProduct = skuBaseRows[0];
            } else {
                // Fallback: Por Familia + Referencia (Mismo mueble, distinta versión)
                const famRefRows = await dbQuery(`
                    SELECT * FROM public.cabinet_products 
                    WHERE familia_code = '${result.familia_code.replace(/'/g, "''")}'
                    AND ref_code = '${result.ref_code.replace(/'/g, "''")}'
                    AND width_cm IS NOT NULL
                    ORDER BY created_at DESC LIMIT 1
                `);
                if (famRefRows && famRefRows.length > 0) {
                    historicalProduct = famRefRows[0];
                }
            }

            if (historicalProduct) {
                const h = historicalProduct;
                result.cabinet_name = h.cabinet_name || result.cabinet_name;
                result.line = h.line || result.line;
                result.designation = h.designation || result.designation;
                result.commercial_measure = h.commercial_measure || result.commercial_measure;
                result.width_cm = h.width_cm ? parseFloat(h.width_cm) : result.width_cm;
                result.depth_cm = h.depth_cm ? parseFloat(h.depth_cm) : result.depth_cm;
                result.height_cm = h.height_cm ? parseFloat(h.height_cm) : result.height_cm;
                result.weight_kg = h.weight_kg ? parseFloat(h.weight_kg) : result.weight_kg;
                result.product_type = h.product_type || result.product_type;
                result.use_destination = h.use_destination || result.use_destination;
                result.zone_home = h.zone_home || result.zone_home;
                result.accessory_text = h.accessory_text || result.accessory_text;
                result.bisagras = h.bisagras || result.bisagras;
                result.carb2 = h.carb2 || result.carb2;
                result.special_label = h.special_label || result.special_label;
                result.canto_puertas = h.canto_puertas || result.canto_puertas;
                result.barcode_text = h.barcode_text || result.barcode_text;
                result.isometric_path = h.isometric_path || result.isometric_path;
                result.isometric_asset_id = h.isometric_asset_id || result.isometric_asset_id;
                result.rh = h.rh || result.rh;
                result.assembled_flag = h.assembled_flag ?? result.assembled_flag;
            }
        } catch (e) {
            console.error('codeParser: error in hierarchical lookup', e);
>>>>>>> origin/Oswaldo_cambios
        }

        // --- Recuperación automática de nombre de color si no se tiene ---
        if (result.color_code) {
            try {
                const colorRows = await dbQuery(`SELECT name_color_sap FROM public.colors WHERE code_4dig = '${result.color_code.replace(/'/g, "''")}' LIMIT 1`);
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
<<<<<<< HEAD
        // Soporta: 150X55, 150 X 55, 150.5X55, 150,5X55
        const measureMatch = descUpper.match(/\b(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)\b/);
        if (measureMatch) {
            result.commercial_measure = `${measureMatch[1]}X${measureMatch[2]}`.replace(',', '.');
        }

        // Detección Genérica de Designación (INF/SUP/ELEV)
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
=======
        const measureMatch = descUpper.match(/\b(\d+X\d+)\b/);
        if (measureMatch) {
            result.commercial_measure = measureMatch[1];
>>>>>>> origin/Oswaldo_cambios
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
<<<<<<< HEAD
                foundAccessories.push(cantoText);
            }
        }

=======
            }
        }

        // Detección de Accesorios
        let foundAccessories = []
        if (cantoText) foundAccessories.push(cantoText)

>>>>>>> origin/Oswaldo_cambios
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
        if (descUpper.includes('FRENTES 18MM')) {
<<<<<<< HEAD
            result.special_label = (result.special_label && result.special_label !== 'NA') 
                ? `${result.special_label} FRENTES 18MM` 
                : 'FRENTES 18MM';
=======
            result.special_label = 'FRENTES 18MM';
>>>>>>> origin/Oswaldo_cambios
        }
    }

    return result
}
