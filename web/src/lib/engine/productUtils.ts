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
