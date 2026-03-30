import { dbQuery } from './src/lib/supabase';
import { translateSpanishToEnglish } from './src/lib/engine/translator';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const examples = [
        {
            es: 'KIT LVM SIENA 79X48 MARFIL MUEBLE BASICO ELEVADO SIN MANIJAS GRACIA/SIKUANI',
            expected: 'KIT SIENA LAV 31INX19IN IVORY BASIC WALL MOUNTED VANITY WITHOUT HANDLES GRACIA/SIKUANI',
            ctx: { cabinet_name: 'SIENA', color_name: 'MARFIL GRACIA/SIKUANI' }
        },
        {
            es: 'MBLE SUP COC 2 PUERTAS 2 ENTREPAÑOS CIERRE LENTO CANTO 2MM CANDELARIA AMAZONAS RH',
            expected: 'WALL CABINET 2 DOORS 2 SHELVES SOFT CLOSE 2MM EDGE BAND CANDELARIA AMAZONAS MR',
            ctx: { color_name: 'CANDELARIA AMAZONAS' }
        },
        {
            es: 'ALACENA 2 PUERTAS 5 ENTREPAÑOS CIERRE LENTO MITTE/TAMBO',
            expected: 'PANTRY CABINET 2 DOORS 5 SHELVES SOFT CLOSE MITTE/TAMBO',
            ctx: { color_name: 'MITTE/TAMBO' }
        },
        {
            es: 'LAVADERO 63X50 BLANCO',
            expected: 'LAUNDRY SINK 25INX20IN WHITE',
            ctx: { color_name: 'BLANCO' }
        },
        {
            es: 'KIT HIDROMASAJE CHATTANOOGAN 200X200 FULL PRE ENSAMBLE PULSADORES',
            expected: 'CHATTANOOGAN WHIRLPOOL KIT 79INX79IN FULL PREASSEMBLY PUSH BUTTONS',
            ctx: { cabinet_name: 'CHATTANOOGAN', line: 'FULL' }
        }
    ];

    for (const ex of examples) {
        const { translatedName, missingTerms, isValid, errorReason } = await translateSpanishToEnglish(ex.es, ex.ctx);
        console.log(`\nOriginal: ${ex.es}`);
        console.log(`Expected: ${ex.expected}`);
        console.log(`Actual  : ${translatedName}`);
        console.log(`isValid : ${isValid}`);
        if (!isValid) console.log(`ErrorReason: ${errorReason}`);
    }
}
run();
