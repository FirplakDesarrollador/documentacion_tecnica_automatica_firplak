import * as dotenv from 'dotenv';
import path from 'path';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    try {
        const refs = await dbQuery('SELECT ref_attrs FROM public.product_references WHERE ref_attrs IS NOT NULL AND ref_attrs != \'{}\' LIMIT 100');
        const refKeys = new Set();
        refs.forEach((r: any) => Object.keys(r.ref_attrs || {}).forEach(k => refKeys.add(k)));
        console.log('REF_ATTRS_KEYS:', JSON.stringify(Array.from(refKeys)));

        const vers = await dbQuery('SELECT version_attrs FROM public.product_versions WHERE version_attrs IS NOT NULL AND version_attrs != \'{}\' LIMIT 100');
        const verKeys = new Set();
        vers.forEach((v: any) => Object.keys(v.version_attrs || {}).forEach(k => verKeys.add(k)));
        console.log('VERSION_ATTRS_KEYS:', JSON.stringify(Array.from(verKeys)));
    } catch (e) {
        console.error(e);
    }
}
main();
