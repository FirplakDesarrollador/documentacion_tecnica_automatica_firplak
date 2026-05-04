
import { dbQuery } from './src/lib/supabase.ts';

async function test() {
    console.log("Testing V6.1 distinct queries...");
    try {
        const types = await dbQuery(`SELECT DISTINCT product_type FROM public.families WHERE product_type IS NOT NULL AND product_type != ''`);
        console.log("Types:", types.length);

        const refAttrs = await dbQuery(`SELECT DISTINCT ref_attrs->>'bisagras' as bisagras FROM public.product_references WHERE ref_attrs->>'bisagras' IS NOT NULL AND ref_attrs->>'bisagras' != ''`);
        console.log("Bisagras:", refAttrs.length);

    } catch (e) {
        console.error(e);
    }
}
test();
