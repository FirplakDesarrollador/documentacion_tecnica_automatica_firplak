'use server'

import { dbQuery } from '@/lib/supabase'
import { markNamingStaleForColor, processNamingJobsInline } from '@/lib/engine/namingQueue'
import { revalidatePath } from 'next/cache'

/** Fetch all colors */
export async function getColorsAction() {
  const rows = await dbQuery(
    `SELECT code_4dig, name_color_sap FROM public.colors ORDER BY code_4dig ASC`
  )
  return rows || []
}

/** Update a color name or upsert */
export async function upsertColorAction(data: { code_4dig: string; name_color_sap: string; isNew?: boolean }) {
  const { code_4dig, name_color_sap, isNew } = data
  if (!code_4dig || !name_color_sap) {
    throw new Error('El código y el nombre SAP del color son obligatorios')
  }

  // standardizing inputs
  const code = code_4dig.trim().toUpperCase()
  const name = name_color_sap.trim().toUpperCase()

  if (isNew) {
    const existing = await dbQuery(
      `SELECT code_4dig FROM public.colors WHERE code_4dig = $1`,
      [code]
    )
    if (existing && existing.length > 0) {
      throw new Error(`El código de color "${code}" ya existe en la base de datos`)
    }

    const result = await dbQuery(
      `INSERT INTO public.colors (code_4dig, name_color_sap)
       VALUES ($1, $2)
       RETURNING *`,
      [code, name]
    )
    await markNamingStaleForColor(code, null, 'color_upsert')
    await processNamingJobsInline()
    revalidatePath('/rules/colors')
    revalidatePath('/configuration/colors')
    return result[0]
  } else {
    const result = await dbQuery(
      `UPDATE public.colors
       SET name_color_sap = $1
       WHERE code_4dig = $2
       RETURNING *`,
      [name, code]
    )
    await markNamingStaleForColor(code, null, 'color_update')
    await processNamingJobsInline()
    revalidatePath('/rules/colors')
    revalidatePath('/configuration/colors')
    return result[0]
  }
}

/** Delete a color (checks for associated SKUs first) */
export async function deleteColorAction(code_4dig: string) {
  if (!code_4dig) throw new Error('Código es obligatorio para eliminar')

  const skus = await dbQuery(
    `SELECT id, sku_complete FROM public.product_skus WHERE color_code = $1`,
    [code_4dig]
  )

  if (skus && skus.length > 0) {
    return {
      success: false,
      hasSkus: true,
      skuCount: skus.length,
      skuCodes: skus.map((s: { sku_complete: string }) => s.sku_complete),
      message: `Este color está siendo usado por ${skus.length} SKU(s).`
    }
  }

  await dbQuery(`DELETE FROM public.colors WHERE code_4dig = $1`, [code_4dig])
  revalidatePath('/rules/colors')
  revalidatePath('/configuration/colors')
  return { success: true }
}

/** Force delete a color and all SKUs that use it */
export async function forceDeleteColorAction(code_4dig: string) {
  if (!code_4dig) throw new Error('Código es obligatorio para eliminar')
  await dbQuery(`DELETE FROM public.product_skus WHERE color_code = $1`, [code_4dig])
  await dbQuery(`DELETE FROM public.colors WHERE code_4dig = $1`, [code_4dig])
  revalidatePath('/rules/colors')
  revalidatePath('/configuration/colors')
  return { success: true }
}
