import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { parseProductCode } from '../src/lib/engine/codeParser';

async function test() {
    console.log("=== TESTING CODE PARSER PHASE 1C ===");

    // Test 1: Known existing SKU (should hit composer)
    const known = await parseProductCode('VBAN05-0001-000-0387');
    console.log("\n1. Known SKU (VBAN05-0001-000-0387):");
    console.log("Source:", (known as any)._source);
    console.log("Cabinet Name:", known.cabinet_name);
    console.log("Rh:", known.rh);
    console.log("Weight:", known.weight_kg);

    // Test 2: New SKU (not in DB, should hit fallback)
    const sapDesc = "MUEBLE BASICO 100X50 CON MANIJAS CANTO 2 MM ARMADO";
    const unknown = await parseProductCode('VBAN05-9999-000-0100', sapDesc);
    console.log("\n2. Unknown SKU with SAP desc (VBAN05-9999-000-0100):");
    console.log("Source:", (unknown as any)._source || 'legacy_fallback');
    console.log("Product Type (from families):", unknown.product_type);
    console.log("Commercial Measure (from SAP):", unknown.commercial_measure);
    console.log("Canto Puertas (from SAP):", unknown.canto_puertas);
    console.log("Assembled Flag (from SAP):", unknown.assembled_flag);

    // Test 3: Unknown SKU, known version rule (MRH)
    const unknownVersion = await parseProductCode('VBAN05-9999-MRH-0100', sapDesc);
    console.log("\n3. Unknown SKU, known version (VBAN05-9999-MRH-0100):");
    console.log("Source:", (unknownVersion as any)._source || 'legacy_fallback');
    console.log("RH (from MRH version rule):", unknownVersion.rh);
}

test().catch(console.error);
