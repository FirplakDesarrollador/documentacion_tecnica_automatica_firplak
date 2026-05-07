import * as dotenv from 'dotenv';
import path from 'path';

// Forzar carga de variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { dbQuery, supabaseAdmin } from '../src/lib/supabase';

const TARGET_CODE = 'VCOC01-0200-000-0493';

async function executeDeletion() {
    console.log(`🚀 Iniciando eliminación completa para: ${TARGET_CODE}\n`);

    try {
        // 1. Obtener IDs y Assets antes de borrar nada
        const skus = await dbQuery(`SELECT id, version_id FROM public.product_skus WHERE sku_complete = $1`, [TARGET_CODE]);
        if (skus.length === 0) {
            console.log("❌ No se encontró el SKU en product_skus. Verificando en cabinet_products...");
        } else {
            const { id: skuId, version_id: versionId } = skus[0];
            
            const versions = await dbQuery(`SELECT id, reference_id FROM public.product_versions WHERE id = $1`, [versionId]);
            const referenceId = versions[0]?.reference_id;

            const refs = await dbQuery(`SELECT id, isometric_path, isometric_asset_id FROM public.product_references WHERE id = $1`, [referenceId]);
            const { isometric_path, isometric_asset_id } = refs[0] || {};

            console.log("📝 Registros identificados:");
            console.log(`- SKU ID: ${skuId}`);
            console.log(`- Version ID: ${versionId}`);
            console.log(`- Reference ID: ${referenceId}`);
            console.log(`- Asset ID: ${isometric_asset_id}`);
            console.log(`- Asset Path: ${isometric_path}`);

            // 2. Eliminar del Storage si existe
            if (isometric_path) {
                // El path suele ser: https://.../storage/v1/object/public/assets/assets/filename.svg
                // Necesitamos el path relativo al bucket 'assets'
                const bucket = 'assets';
                const storagePath = isometric_path.split(`${bucket}/`)[1];
                
                if (storagePath) {
                    console.log(`\n🗑️ Eliminando archivo de Storage: ${bucket}/${storagePath}`);
                    const { error: storageError } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
                    if (storageError) {
                        console.error(`⚠️ Error eliminando de Storage: ${storageError.message}`);
                    } else {
                        console.log("✅ Archivo eliminado de Storage con éxito.");
                    }
                }
            }

            // 3. Eliminación en cascada en la DB (Ordenada para evitar conflictos de FK)
            console.log("\nDB Cleaning...");

            // a. Eliminar de product_skus
            await dbQuery(`DELETE FROM public.product_skus WHERE id = $1`, [skuId]);
            console.log("✅ SKU eliminado.");

            // b. Eliminar de product_versions (si no tiene más skus)
            const otherSkus = await dbQuery(`SELECT count(*) FROM public.product_skus WHERE version_id = $1`, [versionId]);
            if (parseInt(otherSkus[0].count) === 0) {
                await dbQuery(`DELETE FROM public.product_versions WHERE id = $1`, [versionId]);
                console.log("✅ Versión eliminada (era exclusiva).");
            }

            // c. Eliminar de product_references (si no tiene más versiones)
            if (referenceId) {
                const otherVersions = await dbQuery(`SELECT count(*) FROM public.product_versions WHERE reference_id = $1`, [referenceId]);
                if (parseInt(otherVersions[0].count) === 0) {
                    await dbQuery(`DELETE FROM public.product_references WHERE id = $1`, [referenceId]);
                    console.log("✅ Referencia eliminada (era exclusiva).");
                }
            }

            // d. Eliminar el Asset de la tabla assets
            if (isometric_asset_id) {
                await dbQuery(`DELETE FROM public.assets WHERE id = $1`, [isometric_asset_id]);
                console.log("✅ Registro de Asset eliminado de la tabla assets.");
            }
        }

        // 4. Limpieza de tabla legacy
        const oldResult = await dbQuery(`DELETE FROM public.cabinet_products WHERE code = $1`, [TARGET_CODE]);
        console.log(`✅ Registros eliminados de cabinet_products: ${oldResult.success ? 'Éxito' : '0'}`);

        console.log("\n✨ Eliminación completada exitosamente.");

    } catch (error) {
        console.error("\n❌ Error durante la ejecución:", error);
    }
}

executeDeletion();
