/**
 * Minimal built-in fallback map for zone translations.
 * This is NOT the source of truth – the glossary is.
 * It only exists as an emergency safety net in case the translation engine
 * cannot run (e.g. during SSR or offline exports).
 * New zones should ALWAYS be added to the Supabase glossary table with category='ZONE'.
 */
const ZONE_FALLBACK_MAP: Record<string, string> = {
    'COCINA': 'kitchen',
    'BAÑO': 'bathroom',
    'ROPAS': 'laundry',
}

/**
 * Enriches product data with dynamic labels for document generation.
 * Specifically calculates technical descriptions in Spanish and English.
 *
 * IMPORTANT: For zone_home translation, callers that have access to the
 * translation engine result should inject `zone_home_en` into the product
 * object BEFORE calling this function. That value takes highest priority.
 * The ZONE_FALLBACK_MAP is a last-resort safety net only.
 */
export function enrichProductData(product: any) {
    if (!product) return product;

    const isAssembled = !!product.assembled_flag;

    const zoneEs = (product.zone_home || 'baño').toLowerCase();

    // Priority 1: dynamically injected by the caller (from translation engine)
    // Priority 2: built-in fallback map (emergency safety net)
    // Priority 3: show the Spanish name capitalized so it's visibly wrong, not silently wrong
    const rawZoneKey = (product.zone_home || '').toUpperCase().trim();
    const zoneEn = product.zone_home_en
        || ZONE_FALLBACK_MAP[rawZoneKey]
        || (product.zone_home
            ? product.zone_home.charAt(0).toUpperCase() + product.zone_home.slice(1).toLowerCase()
            : 'Bathroom');

    const actionEs = isAssembled ? 'instalar' : 'armar';
    const sigla = isAssembled ? 'RTI' : 'RTA';
    const actionEn = isAssembled ? 'install' : 'assemble';

    // Conversiones a sistema imperial (pulgadas y libras)
    const cm_to_in = 2.54;
    const kg_to_lb = 2.20462;

    const width_in = product.width_cm ? (product.width_cm / cm_to_in).toFixed(1) : '';
    const depth_in = product.depth_cm ? (product.depth_cm / cm_to_in).toFixed(1) : '';
    const height_in = product.height_cm ? (product.height_cm / cm_to_in).toFixed(1) : '';
    const weight_lb = product.weight_kg ? (product.weight_kg * kg_to_lb).toFixed(1) : '';

    return {
        ...product,
        sku_base: product.sku_base || '', 
        width_in,
        depth_in,
        height_in,
        weight_lb,
        technical_description_es: `Zona: ${zoneEs} / listo para ${actionEs} (${sigla})`,
        technical_description_en: `Zone: ${zoneEn.toLowerCase()} / Ready-to-${actionEn} (${sigla})`,
        zone_home_en: zoneEn.toLowerCase()
    };
}


/**
 * Extends product enrichment with conditional icon resolution.
 * Derives whether each dynamic icon applies to this product and resolves its URL.
 * Business logic lives here, not inside the template.
 *
 * @param product  - Raw product data (or already base-enriched)
 * @param assetMap - Map of asset name/key → absolute file_path URL (from resolveAssetsAction)
 */
export function enrichProductDataWithIcons(product: any, assetMap: Record<string, string>) {
    const enriched = enrichProductData(product);

    // --- RH Icon ---
    // Source column: product.rh
    // Condition: show when rh === 'RH'; hide when 'NA' or empty
    const rhValue = (product.rh || '').toString().toUpperCase().trim();
    const isRH = rhValue === 'RH';
    enriched.icon_rh_url = isRH
        ? (assetMap['Icono RH Fijo'] || assetMap['sys_icon_rh'] || null)
        : null;

    // --- Canto (Edge) Icon ---
    // Source column: product.canto_puertas
    const cantoValue = (product.canto_puertas || '').toString().toUpperCase().trim();
    // Limpiar valor para comparación flexible (quitar espacios internos)
    const normalizedCanto = cantoValue.replace(/\s+/g, '');
    let isCanto = false;
    let captionEs = '';
    let captionEn = '';

    if (normalizedCanto === 'CANTO0.45MM') {
        isCanto = true;
        captionEs = 'Canto 0.45 mm';
        captionEn = 'Edge of 0.45 mm';
    } else if (normalizedCanto === 'CANTO1.5MM') {
        isCanto = true;
        captionEs = 'Canto 1.5 mm';
        captionEn = 'Edge of 1.5 mm';
    } else if (normalizedCanto === 'CANTO2MM') {
        isCanto = true;
        captionEs = 'Canto 2 mm';
        captionEn = 'Edge of 2 mm';
    }

    enriched.icon_canto_url = isCanto
        ? (assetMap['Icono Canto'] || assetMap['sys_icon_canto'] || null)
        : null;
    enriched.icon_canto_caption_es = isCanto ? captionEs : '';
    enriched.icon_canto_caption_en = isCanto ? captionEn : '';

    // --- Bisagras (Hinges) Icon ---
    // Source column: product.bisagras
    const bisagrasValue = (product.bisagras || '').toString().toUpperCase().trim();
    let isBisagras = false;
    let bisagrasEs = '';
    let bisagrasEn = '';

    if (bisagrasValue === 'BISAGRAS CIERRE LENTO') {
        isBisagras = true;
        bisagrasEs = 'Bisagras cierre lento';
        bisagrasEn = 'Slow closing hinges';
    } else if (bisagrasValue === 'BISAGRAS') {
        isBisagras = true;
        bisagrasEs = 'Bisagras';
        bisagrasEn = 'Hinges';
    }

    enriched.icon_bisagras_url = isBisagras
        ? (assetMap['Icono Cierre Lento'] || assetMap['sys_icon_cierre_lento'] || null)
        : null;
    enriched.icon_bisagras_caption_es = isBisagras ? bisagrasEs : '';
    enriched.icon_bisagras_caption_en = isBisagras ? bisagrasEn : '';

    // --- Riel (Slides) Icon ---
    // Source column: product.accessory_text
    const accText = (product.accessory_text || '').toString().toUpperCase().trim();
    let isRiel = false;
    let rielEs = '';
    let rielEn = '';

    if (accText === 'R OCULTO + RFE CIERRE LENTO') {
        isRiel = true;
        rielEs = 'Riel oculto + riel full extension cierre lento';
        rielEn = 'Concealed + full extension soft close slide';
    } else if (accText === 'R OCULTO CIERRE LENTO') {
        isRiel = true;
        rielEs = 'Riel oculto cierre lento';
        rielEn = 'Concealed soft close slide';
    } else if (accText.includes('RFE CIERRE LENTO')) {
        isRiel = true;
        rielEs = 'Riel full extension cierre lento';
        rielEn = 'Full extension soft close slide';
    } else if (accText.includes('RFE') && !accText.includes('CIERRE LENTO')) {
        isRiel = true;
        rielEs = 'Riel full extension';
        rielEn = 'Full extension slide';
    }

    // You could also expose rail_mode explicitly if requested, but this directly sets the rendering values needed.
    enriched.rail_mode = isRiel ? accText : 'NA';
    enriched.icon_riel_url = isRiel
        ? (assetMap['Icono Extensión Total'] || assetMap['sys_icon_extension_total'] || null)
        : null;
    enriched.icon_riel_caption_es = isRiel ? rielEs : '';
    enriched.icon_riel_caption_en = isRiel ? rielEn : '';

    return enriched;
}
