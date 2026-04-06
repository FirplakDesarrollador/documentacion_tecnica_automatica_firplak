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

    return enriched;
}
