import { parseProductCode } from '../src/lib/engine/codeParser'
import { getRulesAction } from '../src/app/rules/actions'
import { evaluateProductRules } from '../src/lib/engine/ruleEvaluator'
import { Product } from '@prisma/client'

async function test() {
    console.log("1. Buscando código: VBAN12-0032-000-0368");
    const parsed = await parseProductCode(
        "VBAN12-0032-000-0368", 
        "MUEBLE VITELI LVM 79X48 CANTO 2MM CIERRE LENTO OCULTO TABACO CHIC",
        false
    );

    console.log("Resultado de Smart Lookup:");
    console.log(parsed);

    console.log("\n2. Simulando estado del formulario (formData)...");
    const formData = {
        code: "VBAN12-0032-000-0368",
        sap_description: "MUEBLE VITELI LVM 79X48 CANTO 2MM CIERRE LENTO OCULTO TABACO CHIC",
        ...parsed
    } as unknown as Product;

    console.log("\n3. Obteniendo reglas de Nomenclatura...");
    const rules = await getRulesAction();

    console.log("\n4. Evaluando reglas...");
    const result = evaluateProductRules(formData, rules);
    
    console.log("=========================================");
    console.log("Nombre Final (ES):", result.finalNameEs);
    console.log("=========================================");
}

test().catch(console.error);
