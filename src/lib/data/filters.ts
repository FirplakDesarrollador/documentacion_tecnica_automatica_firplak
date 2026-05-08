/**
 * filters.ts — Módulo "madre" centralizado para la carga de filtros de familias y referencias.
 *
 * ⚠️ Este es el ÚNICO lugar donde se define la lógica SQL para resolver nombre de familias.
 *    Para cambiar cómo se construyen los filtros de familia, referencia o medida en TODA
 *    la aplicación, edita ESTE archivo. No copies la lógica en otros módulos.
 *
 * CORRECCIÓN PRINCIPAL (Bug COC01):
 *   La anterior consulta asumía que TODO código que empieza con C, V o P era un código
 *   con prefijo (ej: VBAN05 -> BAN05). Esto era incorrecto para COC01 (Cocina) que
 *   empieza con C pero su código COMPLETO es COC01.
 *   La nueva lógica prioriza la coincidencia exacta y solo intenta la versión sin prefijo
 *   si falla la coincidencia exacta.
 */

import { dbQuery } from '@/lib/supabase'

export interface FamilyFilterOption {
    value: string
    label: string
}

export interface ReferenceFilterOption {
    value: string  // formato: "ref_code|||commercial_measure"
    label: string
    meta?: {
        designation?: string
        product_name?: string
        commercial_measure?: string
        accessory_text?: string
    }
}

/**
 * Obtiene todas las familias únicas presentes en el catálogo activo de productos,
 * junto a su nombre descriptivo de la tabla `familias`.
 *
 * Resolución de nombres:
 * 1. Intenta encontrar el código de familia EXACTO en la tabla `familias`.
 * 2. Si no encuentra coincidencia exacta y el código empieza con V, C o P,
 *    intenta con la versión sin ese primer carácter (ej: VBAN05 -> BAN05).
 * Esto garantiza que COC01 se resuelva como "MUEBLES DE COCINA" correctamente.
 */
export async function getFamilyFilters(): Promise<FamilyFilterOption[]> {
    const records = await dbQuery(
        `SELECT family_code, MAX(family_name) as family_name
         FROM (
             SELECT
                 p.family_code,
                 COALESCE(
                     f_exact.family_name,
                     f_prefix.family_name
                 ) as family_name
             FROM public.product_references p
             LEFT JOIN public.families f_exact
                 ON f_exact.family_code = p.family_code
             LEFT JOIN public.families f_prefix
                 ON f_prefix.family_code = SUBSTRING(p.family_code FROM 2)
                 AND p.family_code ~ '^[VCP].+'
                 AND f_exact.family_code IS NULL
             WHERE p.family_code IS NOT NULL
         ) sub
         GROUP BY family_code
         ORDER BY family_code ASC`
    ) || []

    return records.map((fam: any) => ({
        value: fam.family_code,
        label: fam.family_name
            ? `${fam.family_code} - ${fam.family_name}`
            : fam.family_code,
    }))
}

/**
 * Obtiene los registros de referencia (ref_code + commercial_measure)
 * disponibles para los códigos de familia indicados.
 * Retorna un array vacío si no se pasan familias.
 */
export async function getReferenceFilters(
    familiaCodes: string[]
): Promise<ReferenceFilterOption[]> {
    if (familiaCodes.length === 0) return []

    const fFilter = familiaCodes
        .map(v => `'${v.replace(/'/g, "''")}'`)
        .join(',')

    const records = await dbQuery(
        // One option per (reference_code, commercial_measure) to avoid duplicate `value`s (React key collisions).
        `SELECT
            r.reference_code,
            r.commercial_measure,
            MAX(r.designation) as designation,
            MAX(r.product_name) as product_name,
            MAX(r.ref_attrs->>'accessory_text') as accessory_text
         FROM public.product_references r
         WHERE r.family_code IN (${fFilter})
         GROUP BY r.reference_code, r.commercial_measure
         ORDER BY r.reference_code, r.commercial_measure`
    ) || []

    return records.map((rec: any) => {
        const parts = [
            rec.reference_code || 'NA',
            rec.designation || 'NA',
            rec.commercial_measure || 'NA',
            rec.product_name || 'NA',
            rec.accessory_text || 'NA',
        ]

        return {
            value: `${rec.reference_code}|||${rec.commercial_measure || ''}`,
            // Use a stable ASCII separator to avoid mojibake and simplify downstream parsing.
            label: parts.join(' | '),
            meta: {
                designation: rec.designation || undefined,
                product_name: rec.product_name || undefined,
                commercial_measure: rec.commercial_measure || undefined,
                accessory_text: rec.accessory_text || undefined,
            }
        }
    })
}
