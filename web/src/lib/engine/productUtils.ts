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

    // Future icons follow the same pattern:
    // enriched.icon_soft_close_url = hasSoftClose ? assetMap['Icono Cierre Lento'] : null
    // enriched.icon_edge_2mm_url   = hasEdge2mm   ? assetMap['Icono Canto 2mm']    : null

    return enriched;
}
