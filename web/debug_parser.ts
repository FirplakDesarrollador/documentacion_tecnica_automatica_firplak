import { parseProductCode } from './src/lib/engine/codeParser';

async function run() {
    try {
        const code = 'VBAN05-0039-CHT-0439';
        const sapDescription = 'MUEBLE VALDEZ PISO LVM 48X43 MITTE/TAMBO-CHILEMAT';
        
        console.log("TESTING PARSER WITH:");
        console.log("Code:", code);
        console.log("SAP Description:", sapDescription);

        const result = await parseProductCode(code, sapDescription);
        
        console.log("\nPARSER RESULT:");
        console.log("private_label_client_name:", result.private_label_client_name);

        if (result.private_label_client_name === 'CHILEMAT') {
            console.log("\n✅ SUCCESS: Private Label detected as CHILEMAT");
        } else {
            console.log("\n❌ FAILURE: Private Label NOT detected correctly. Got: " + result.private_label_client_name);
        }

    } catch (e) {
        console.error(e);
    }
}
run();
