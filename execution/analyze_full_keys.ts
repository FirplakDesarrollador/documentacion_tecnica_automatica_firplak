import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    try {
        console.log('Fetching all ref_attrs...');
        const refs = await dbQuery(`SELECT ref_attrs FROM public.product_references WHERE ref_attrs IS NOT NULL AND ref_attrs::text != '{}'`);
        const refKeys = new Set<string>();
        refs.forEach((r: any) => {
            if (typeof r.ref_attrs === 'object' && r.ref_attrs !== null) {
                 Object.keys(r.ref_attrs).forEach(k => refKeys.add(k));
            }
        });
        console.log('ALL_REF_ATTRS_KEYS:', Array.from(refKeys));

        console.log('Fetching all version_attrs...');
        const vers = await dbQuery(`SELECT version_attrs FROM public.product_versions WHERE version_attrs IS NOT NULL AND version_attrs::text != '{}'`);
        const verKeys = new Set<string>();
        vers.forEach((v: any) => {
            if (typeof v.version_attrs === 'object' && v.version_attrs !== null) {
                Object.keys(v.version_attrs).forEach(k => verKeys.add(k));
            }
        });
        console.log('ALL_VERSION_ATTRS_KEYS:', Array.from(verKeys));

        console.log('Fetching all colors...');
        const colors = await dbQuery(`SELECT code_4dig FROM public.colors`);
        const colorCodes = colors.map((c: any) => c.code_4dig);
        console.log(`TOTAL_COLORS: ${colorCodes.length}`);
        // We will output a few just to verify, but we know how many there are.
        
    } catch (e) {
        console.error('Error:', e);
    }
}
main();
