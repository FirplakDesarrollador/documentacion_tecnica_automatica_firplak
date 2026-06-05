import { createClient } from '@supabase/supabase-js';
require('dotenv').config();
import { validateProductReadiness } from './src/lib/engine/validator';
import { mapRowToComposedProduct } from './src/lib/engine/product_composer';
import type { Rule } from './src/generated/prisma/client';
import type { TemplateElement } from './src/components/templates/TemplateCanvas';

type DebugTemplateRow = {
    elements_json: string | null
}

type SqlRpcResponse<Row> = {
    data: Row[] | null
    error: { message: string } | null
}

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SECRET_KEY'): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function execSql<Row>(queryText: string): Promise<SqlRpcResponse<Row>> {
    const response = await supabase.rpc('exec_sql', { query_text: queryText });
    return {
        data: (response.data as Row[] | null) ?? null,
        error: response.error ? { message: response.error.message } : null,
    };
}

const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY')
);

async function checkSku(sku: string) {
    const escapedSku = sku.replace(/'/g, "''");
    const { data: rows, error: rowsError } = await execSql<Parameters<typeof mapRowToComposedProduct>[0]>(
        `SELECT * FROM public.v_ui_generate_list WHERE sku_complete = '${escapedSku}'`
    );
    if (rowsError) {
        throw new Error(`Failed to fetch SKU rows: ${rowsError.message}`);
    }
    if (!rows || rows.length === 0) {
        console.log(`SKU ${sku} not found`);
        return;
    }
    const { data: rules, error: rulesError } = await execSql<Rule>(
        'SELECT * FROM public.rules WHERE enabled = true'
    );
    if (rulesError) {
        throw new Error(`Failed to fetch rules: ${rulesError.message}`);
    }
    const { data: templates, error: templatesError } = await execSql<DebugTemplateRow>(
        'SELECT elements_json FROM public.plantillas_doc_tec WHERE active = true'
    );
    if (templatesError) {
        throw new Error(`Failed to fetch templates: ${templatesError.message}`);
    }
    
    const allRequiredElements: TemplateElement[] = [];
    (templates ?? []).forEach(t => {
        try {
            const parsed = JSON.parse(t.elements_json || '[]') as TemplateElement[];
            allRequiredElements.push(...parsed);
        } catch (error) {
            console.warn('Ignoring invalid template JSON:', toErrorMessage(error));
        }
    });

    const p = mapRowToComposedProduct(rows[0]);
    const issues = validateProductReadiness(p, rules ?? [], allRequiredElements);
    
    console.log(`Issues for ${sku}:`);
    console.log(JSON.stringify(issues, null, 2));
}

checkSku('VBAN22-0015-000-0439').then(() => process.exit());
