
import { dbQuery } from './web/src/lib/supabase';

async function run() {
    console.log("Analizando descripciones SAP con caracteres dañados...");
    try {
        // Buscamos cualquier descripción que tenga caracteres fuera del rango ASCII
        const rows = await dbQuery("SELECT DISTINCT sap_description FROM public.cabinet_products WHERE sap_description ~ '[^\\x00-\\x7F]'");
        
        if (!rows || rows.length === 0) {
            console.log("No se encontraron registros con el caracter .");
            return;
        }

        console.log(`Se encontraron ${rows.length} registros únicos afectados.`);
        
        const patterns = new Map<string, string>();
        rows.forEach((row: any) => {
            const desc = row.sap_description;
            const words = desc.split(/\s+/);
            words.forEach((word: string) => {
                const nonAscii = Array.from(word).filter(c => c.charCodeAt(0) > 127);
                if (nonAscii.length > 0) {
                    const hex = Array.from(word).map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
                    patterns.set(word, hex);
                }
            });
        });

        console.log("Patrones detectados (Palabra -> HEX):");
        patterns.forEach((hex, word) => console.log(`- ${word} -> ${hex}`));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
