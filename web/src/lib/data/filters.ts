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
        `SELECT familia_code, MAX(family_name) as family_name
         FROM (
             SELECT
                 p.familia_code,
                 COALESCE(
                     f_exact.name,
                     f_prefix.name
                 ) as family_name
             FROM public.cabinet_products p
             LEFT JOIN public.familias f_exact
                 ON f_exact.code = p.familia_code
             LEFT JOIN public.familias f_prefix
                 ON f_prefix.code = SUBSTRING(p.familia_code FROM 2)
                 AND p.familia_code ~ '^[VCP].+'
                 AND f_exact.code IS NULL
             WHERE p.familia_code IS NOT NULL AND p.status = 'ACTIVO'
         ) sub
         GROUP BY familia_code
         ORDER BY familia_code ASC`
    ) || []

    return records.map((fam: any) => ({
        value: fam.familia_code,
        label: fam.family_name
            ? `${fam.familia_code} - ${fam.family_name}`
            : fam.familia_code,
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
        `SELECT 
            ref_code, 
            commercial_measure, 
            MAX(designation) as designation,
            MAX(cabinet_name) as cabinet_name
         FROM public.cabinet_products
         WHERE status = 'ACTIVO'
           AND ref_code IS NOT NULL
           AND familia_code IN (${fFilter})
         GROUP BY ref_code, commercial_measure
         ORDER BY ref_code, commercial_measure`
    ) || []

    return records.map((rec: any) => {
        // Formato solicitado: Número de referencia, Designación, nombre, medida comercial
        const parts = [
            rec.ref_code,
            rec.designation,
            rec.cabinet_name,
            rec.commercial_measure
        ].filter(Boolean) // Eliminamos nulos o vacíos

        return {
            value: `${rec.ref_code}|||${rec.commercial_measure || ''}`,
            label: parts.join(' · ')
        }
    })
}
