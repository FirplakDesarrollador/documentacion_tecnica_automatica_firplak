import prisma from '@/lib/prisma'

export interface ParsedCodeResult {
    familia_code: string | null
    ref_code: string | null
    version_code: string | null
    color_code: string | null
    rh_flag: boolean
    product_type: string | null
    use_destination: string | null
    assembled_flag: boolean
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
        rh_flag: Boolean(manualRhFlag), // Si viene del CSV como "SI" o "TRUE", inicializamos en true
        product_type: null,
        use_destination: null,
        assembled_flag: false,
    }

    if (!code) return result

    // 1. Separar el código
    const parts = code.split('-')
    if (parts.length >= 4) {
        result.familia_code = parts[0] // ej: VBAN05
        result.ref_code = parts[1]     // ej: 0001
        result.version_code = parts[2] // ej: 000 o MRH
        result.color_code = parts[3]   // ej: 0387

        // Remover prefijos de ventas (ej: VBAN05 -> BAN05) para cruzar con la BD
        let lookupFamilia = result.familia_code
        if (lookupFamilia.toUpperCase().startsWith('V')) {
            lookupFamilia = lookupFamilia.substring(1)
        }

        // 2. Buscar Familia
        const familia = await prisma.familia.findUnique({
            where: { code: lookupFamilia }
        })

        if (familia) {
            result.product_type = familia.product_type
            result.use_destination = familia.use_destination
            result.assembled_flag = familia.assembled_default
            if (familia.rh_default) {
                result.rh_flag = true
            }
        }

        // 3. Detección versión MRH
        if (result.version_code?.toUpperCase() === 'MRH') {
            result.rh_flag = true
        }
    } else {
        // En caso de códigos que no sigan el estándar 4 partes, guardamos todo en Familia para no perder data.
        result.familia_code = code
    }

    // 4. Evaluar si la palabra RH está en la descripción SAP cruda
    if (sapDescription && sapDescription.toUpperCase().includes('RH')) {
        result.rh_flag = true
    }

    return result
}
