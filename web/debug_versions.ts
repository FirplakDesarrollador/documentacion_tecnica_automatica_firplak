import { parseProductCode } from './src/lib/engine/codeParser';

async function test(code: string, desc: string) {
    console.log(`\n--- Testing Code: ${code} ---`);
    const result = await parseProductCode(code, desc);
    console.log("RH:", result.rh);
    console.log("Client:", result.private_label_client_name);
    console.log("Accessories:", result.accessory_text);
    return result;
}

async function run() {
    try {
        // Test CHT
        await test('VBAN05-0039-CHT-0439', 'MUEBLE VALDEZ PISO');
        
        // Test MRH
        await test('VBAN05-0039-MRH-0439', 'MUEBLE VALDEZ PISO');

        // Test MST
        await test('VBAN05-0039-MST-0439', 'MUEBLE VALDEZ PISO');

        // Test 001
        await test('VBAN05-0039-001-0439', 'MUEBLE VALDEZ PISO');

    } catch (e) {
        console.error(e);
    }
}
run();
