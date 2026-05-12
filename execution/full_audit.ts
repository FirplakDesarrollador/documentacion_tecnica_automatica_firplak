import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { dbQuery } from '../src/lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    const output: string[] = [];
    const log = (s: string) => { output.push(s); console.log(s); };

    log('=== PUBLIC FUNCTIONS ===');
    const fns = await dbQuery(`SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name`);
    fns.forEach((f: any) => log(f.routine_name));

    log('\n=== PUBLIC VIEWS ===');
    const views = await dbQuery(`SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`);
    views.forEach((v: any) => log(v.viewname));

    log('\n=== PUBLIC TRIGGERS ===');
    const triggers = await dbQuery(`SELECT trigger_name, event_object_table, action_timing, event_manipulation FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name`);
    triggers.forEach((t: any) => log(`${t.event_object_table}.${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`));

    log('\n=== FOREIGN KEYS ===');
    const fks = await dbQuery(`
        SELECT tc.table_name, kcu.column_name, ccu.table_name AS fk_table, ccu.column_name AS fk_col
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND tc.table_name IN ('families','product_references','product_versions','product_skus','colors')
        ORDER BY tc.table_name
    `);
    fks.forEach((fk: any) => log(`${fk.table_name}.${fk.column_name} -> ${fk.fk_table}.${fk.fk_col}`));

    log('\n=== UNIQUE CONSTRAINTS ===');
    const uniqs = await dbQuery(`
        SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type IN ('UNIQUE','PRIMARY KEY') AND tc.table_schema = 'public'
        AND tc.table_name IN ('families','product_references','product_versions','product_skus','colors')
        ORDER BY tc.table_name, tc.constraint_name
    `);
    uniqs.forEach((u: any) => log(`${u.table_name}: ${u.constraint_type} on ${u.column_name} (${u.constraint_name})`));

    log('\n=== ALL REF_ATTRS KEYS ===');
    const refKeys = await dbQuery(`SELECT DISTINCT jsonb_object_keys(ref_attrs) as key FROM public.product_references WHERE ref_attrs IS NOT NULL AND ref_attrs != '{}'::jsonb ORDER BY key`);
    refKeys.forEach((k: any) => log(k.key));

    log('\n=== ALL VERSION_ATTRS KEYS ===');
    const verKeys = await dbQuery(`SELECT DISTINCT jsonb_object_keys(version_attrs) as key FROM public.product_versions WHERE version_attrs IS NOT NULL AND version_attrs != '{}'::jsonb ORDER BY key`);
    verKeys.forEach((k: any) => log(k.key));

    log('\n=== COLORS TABLE ===');
    const colors = await dbQuery(`SELECT code_4dig, code_short, name_color_sap FROM public.colors ORDER BY code_4dig`);
    colors.forEach((c: any) => log(`${c.code_4dig} | ${c.code_short} | ${c.name_color_sap}`));

    log('\n=== bulk_import_products DEFINITION ===');
    const funcDef = await dbQuery(`SELECT pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'bulk_import_products'`);
    if (funcDef.length > 0) log(funcDef[0]?.def);
    else log('NOT FOUND');

    fs.writeFileSync(path.join(process.cwd(), 'artifacts', 'full_audit_output.txt'), output.join('\n'), 'utf8');
    log('\n✅ Saved to artifacts/full_audit_output.txt');
}

main().catch(console.error);
