import { dbQuery } from './web/src/lib/supabase';

async function run() {
    try {
        const code = 'VBAN05-0039-CHT-0439';
        const q = `SELECT id, code, private_label_flag, private_label_client_name, sap_description, product_type FROM public.cabinet_products WHERE code = '${code}'`;
        const res = await dbQuery(q);
        console.log("PRODUCT DATA:");
        console.log(JSON.stringify(res, null, 2));

        if (res.length > 0) {
            const q2 = `SELECT * FROM public.rules WHERE target_entity = '${res[0]?.product_type}' AND enabled = true AND rule_type = 'name_component' ORDER BY priority ASC`;
            const rules = await dbQuery(q2);
            console.log("\nRULES FOR TYPE " + res[0]?.product_type + ":");
            console.log(JSON.stringify(rules.map((r:any) => ({ id: r.id, payload: r.action_payload, condition: r.condition_expression })), null, 2));
        }

    } catch (e) {
        console.error(e);
    }
}
run();
