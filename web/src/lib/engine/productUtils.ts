/**
 * Enriches product data with dynamic labels for document generation.
 * Specifically calculates technical descriptions in Spanish and English.
 */
export function enrichProductData(product: any) {
    if (!product) return product;

    const zoneStr = (product.zone_home || 'BAÑO').toUpperCase();
    const isAssembled = !!product.assembled_flag;

    // Mapping for Spanish Zone
    const zoneEsMap: Record<string, string> = {
        'BAÑO': 'el baño',
        'COCINA': 'la cocina',
        'ROPA': 'la zona de ropas',
        'ZONA DE ROPA': 'la zona de ropas',
        'ZONA DE ROPAS': 'la zona de ropas'
    };

    // Mapping for English Zone
    const zoneEnMap: Record<string, string> = {
        'BAÑO': 'Bathroom',
        'COCINA': 'Kitchen',
        'ROPA': 'Laundry',
        'ZONA DE ROPA': 'Laundry',
        'ZONA DE ROPAS': 'Laundry'
    };

    const zoneEs = zoneEsMap[zoneStr] || 'el baño';
    const zoneEn = zoneEnMap[zoneStr] || 'Bathroom';

    const actionEs = isAssembled ? 'instalar' : 'armar';
    const sigla = isAssembled ? 'RTI' : 'RTA';
    const actionEn = isAssembled ? 'install' : 'assemble';

    return {
        ...product,
        technical_description_es: `Mueble para ${zoneEs} / listo para ${actionEs} (${sigla})`,
        technical_description_en: `${zoneEn} Cabinet / Ready-to-${actionEn} (${sigla})`,
        zone_home_en: zoneEn
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
    let isCanto = false;
    let captionEs = '';
    let captionEn = '';

    if (cantoValue === 'CANTO 0.45 MM') {
        isCanto = true;
        captionEs = 'Canto 0.45 mm';
        captionEn = 'Edge of 0.45 mm';
    } else if (cantoValue === 'CANTO 1.5 MM') {
        isCanto = true;
        captionEs = 'Canto 1.5 mm';
        captionEn = 'Edge of 1.5 mm';
    } else if (cantoValue === 'CANTO 2 MM') {
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
