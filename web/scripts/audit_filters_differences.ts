import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { dbQuery } from '../src/lib/supabase';
import { getFamilyFilters, getReferenceFilters } from '../src/lib/data/filters';

async function runDetailedAudit() {
    console.log("=== AUDITORÍA DETALLADA DE DIFERENCIAS EN FILTROS (2%) ===\n");

    const families = await getFamilyFilters();
    const results: any[] = [];

    for (const fam of families) {
        const famCode = fam.value;
        
        // 1. Obtener datos Legacy
        const legacyRows = await dbQuery(`
            SELECT ref_code, commercial_measure, MAX(designation) as designation, MAX(cabinet_name) as cabinet_name
            FROM public.cabinet_products
            WHERE status = 'ACTIVO' AND familia_code = $1
            GROUP BY ref_code, commercial_measure
        `, [famCode]);

        // 2. Obtener datos Nuevos (vía getReferenceFilters que ya usa product_references)
        const newFilters = await getReferenceFilters([famCode]);
        
        // Mapear newFilters de vuelta a un formato comparable
        const newRowsMap = new Map();
        const newRefData = await dbQuery(`
            SELECT reference_code, commercial_measure, designation, product_name as cabinet_name
            FROM public.product_references
            WHERE status = 'ACTIVO' AND family_code = $1
        `, [famCode]);
        
        for(const r of newRefData) {
            const key = `${r.reference_code}|||${(r.commercial_measure || '').toUpperCase()}`;
            newRowsMap.set(key, r);
        }

        const legacyKeys = new Set(legacyRows.map(r => `${r.ref_code}|||${(r.commercial_measure || '').toUpperCase()}`));
        const newKeys = new Set(newRowsMap.keys());

        // Diferencias: Faltantes en Nuevo
        for (const lKey of legacyKeys) {
            if (!newKeys.has(lKey)) {
                const lData = legacyRows.find(r => `${r.ref_code}|||${(r.commercial_measure || '').toUpperCase()}` === lKey);
                results.push({
                    family_code: famCode,
                    reference_code: lData.ref_code,
                    type: 'MISSING_IN_NEW',
                    legacy_val: lKey,
                    new_val: 'N/A',
                    field: 'commercial_measure',
                    legacy_full: lData
                });
            }
        }

        // Diferencias: Extras en Nuevo
        for (const nKey of newKeys) {
            if (!legacyKeys.has(nKey)) {
                const nData = newRowsMap.get(nKey);
                results.push({
                    family_code: famCode,
                    reference_code: nData.reference_code,
                    type: 'EXTRA_IN_NEW',
                    legacy_val: 'N/A',
                    new_val: nKey,
                    field: 'existence',
                    new_full: nData
                });
            }
        }
        
        // Diferencias: Metadatos (Designación o Nombre) para llaves coincidentes
        for (const key of legacyKeys) {
            if (newKeys.has(key)) {
                const lData = legacyRows.find(r => `${r.ref_code}|||${(r.commercial_measure || '').toUpperCase()}` === key);
                const nData = newRowsMap.get(key);
                
                if (lData.designation !== nData.designation || lData.cabinet_name !== nData.cabinet_name) {
                    results.push({
                        family_code: famCode,
                        reference_code: lData.ref_code,
                        type: 'METADATA_MISMATCH',
                        legacy_val: `Desig: ${lData.designation}, Cab: ${lData.cabinet_name}`,
                        new_val: `Desig: ${nData.designation}, Cab: ${nData.cabinet_name}`,
                        field: 'designation/name',
                        legacy_full: lData,
                        new_full: nData
                    });
                }
            }
        }
    }

    console.log(`Se detectaron ${results.length} diferencias totales.\n`);

    for (const res of results) {
        console.log(`--------------------------------------------------`);
        console.log(`FAMILIA: ${res.family_code} | REF: ${res.reference_code}`);
        console.log(`Tipo: ${res.type}`);
        console.log(`Legacy: ${res.legacy_val}`);
        console.log(`Nuevo:  ${res.new_val}`);
        
        if (res.type === 'MISSING_IN_NEW') {
            // Investigar por qué falta. ¿Existe la referencia pero con otra medida?
            const otherMeasures = await dbQuery(`SELECT commercial_measure FROM public.product_references WHERE family_code = $1 AND reference_code = $2`, [res.family_code, res.reference_code]);
            console.log(`Nota: En product_references existe con estas medidas: ${otherMeasures.map(m => m.commercial_measure).join(', ') || 'NINGUNA'}`);
        }
    }
}

runDetailedAudit().catch(console.error);
