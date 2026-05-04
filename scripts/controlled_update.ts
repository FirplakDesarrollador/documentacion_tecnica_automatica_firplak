
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { translateProductToEnglish } from '../src/lib/engine/translator';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const targetIds = [
    "7f78d02e-ab55-4f82-81fd-cf974b379aa4", "8427d03a-5270-44ea-8a65-029ee5769f00", "188fb735-f29a-4c42-9286-6fad78ebeb47", "05f06a2a-e3a9-422c-8f7b-ac7cda3aae40", 
    "6315ff90-589e-4d49-8472-b80e637ec3fa", "4df1fdfe-65f7-41ba-a0e1-b41f182e1bbb", "5823e583-f770-404b-a33f-5658cbda3827", "e2e27cf3-6feb-453f-b26a-2dd37aea2fca", 
    "f4dec254-1c83-4d67-aae1-3b3c60f90015", "3fbd7731-31a6-4908-924c-cbc03cf33f75", "80ac0173-d1f0-4d8c-94a5-2b636ab4c6d2", "1f11b9fb-6228-43d6-acbb-b4d6df3f8604", 
    "06c48da0-d90b-4e1b-9303-05080ff8ff1a", "b040271e-9c8b-414e-b79c-c930e7a89b37", "7a5bf541-7260-40d3-a645-222a0cb8c6cb", "d944faf1-90f1-41cb-9134-d47109d8d25f", 
    "708fc6f4-47b9-42c2-9145-a6bba0a14de5", "336c686b-e844-48e2-9957-13cec27b073a", "3e5edb4f-4fe9-4ab5-a0bc-0b5b7796966a", "18b77336-536e-40f6-9d1e-24daef6cb01e", 
    "93716088-8ee2-4211-9213-a877c3db007e", "4f7baa58-c71a-49ab-ae66-c65152246bbf", "7c9a260d-ec2e-422d-87e4-542ec9f732ca", "937c45e4-d53f-41de-8dab-9e437fd83c37", 
    "d149cad1-626c-428a-9c94-f284adb4535f", "29654594-6c1e-4fe1-8774-8883634f7bda", "4ac9b5af-188b-4c62-a36e-da6abeb9d905", "270e5c53-7791-4510-b5af-d27d3b61c098", 
    "655035e6-dcd4-4383-a891-392600e0341b", 
    // Tapas
    "fee2c6d6-643f-4077-ab67-b59e9cfc243a", "730feeb2-638c-43a2-8e64-658b34dd0b5b", "fc6e4779-8145-4d16-920a-e6f99faaef66", "68dd79d9-72c5-4025-a35c-287a9b634441", 
    "ff5e3a11-c79d-450e-af70-f2efdeb4fbd6"
];

async function runControlledUpdate() {
    console.log(`\n🚀 INICIANDO ACTUALIZACIÓN CONTROLADA DE ${targetIds.length} PRODUCTOS...\n`);
    
    // 1. Fetch products
    const { data: products, error } = await supabase
        .from('cabinet_products')
        .select('*')
        .in('id', targetIds);

    if (error || !products) {
        console.error('Error fetching products:', error);
        return;
    }

    const reportRows: string[] = [];
    const sqlStatements: string[] = [];

    // 2. Process each product
    for (const p of products) {
        const oldName = p.cabinet_name_en || '(VACÍO)';
        const translationResult = await translateProductToEnglish(p, 'MUEBLE');
        const newName = translationResult.translatedName;

        reportRows.push(`| ${p.sap_description.substring(0, 30).padEnd(30)} | ${oldName.substring(0, 30).padEnd(30)} | ${newName.substring(0, 30).padEnd(30)} | ${newName !== oldName ? '✨' : ' '} |`);
        
        // Escape single quotes for SQL
        const escapedName = newName.replace(/'/g, "''");
        sqlStatements.push(`UPDATE cabinet_products SET final_name_en = '${escapedName}' WHERE id = '${p.id}';`);
    }

    // 3. Generate Report Artifact
    const reportContent = `
# Reporte de Ejecución: Lote Controlado (Batch v3.21)

Se han procesado **${products.length}** registros reales para validar el motor de traducción.

## Resumen de Cambios

| SAP Description | Anterior (EN) | Nuevo (EN) | Modificado |
|:---|:---|:---|:---:|
${reportRows.join('\n')}

## SQL para Aplicación
\`\`\`sql
${sqlStatements.join('\n')}
\`\`\`
`;

    fs.writeFileSync('reporte_lote_controlado.md', reportContent);
    fs.writeFileSync('apply_controlled_update.sql', sqlStatements.join('\n'));
    console.log(`✅ Reporte generado en reporte_lote_controlado.md`);
    console.log(`✅ SQL generado en apply_controlled_update.sql\n`);

    console.log(`🏁 Proceso de generación completado.\n`);
}

runControlledUpdate();
