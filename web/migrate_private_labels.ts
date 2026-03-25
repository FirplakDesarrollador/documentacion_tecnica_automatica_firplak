import { dbQuery } from './src/lib/supabase';

async function run() {
    try {
        const clients = await dbQuery("SELECT id, name FROM public.clients");
        console.log(`Found ${clients.length} clients.`);

        let totalUpdated = 0;

        for (const client of clients) {
            const clientName = client.name.replace(/'/g, "''");
            // Update products ending with -CLIENTNAME and having 'NA' or NULL in private_label_client_name
            const updateQ = `
                UPDATE public.cabinet_products
                SET 
                    private_label_client_name = '${clientName}',
                    private_label_flag = true
                WHERE 
                    (private_label_client_name = 'NA' OR private_label_client_name IS NULL)
                    AND UPPER(sap_description) LIKE '%-${client.name.toUpperCase()}'
                RETURNING id
            `;
            const updated = await dbQuery(updateQ);
            if (updated && updated.length > 0) {
                console.log(`Updated ${updated.length} products for client ${client.name}`);
                totalUpdated += updated.length;
            }
        }

        console.log(`\nMigration complete. Total products updated: ${totalUpdated}`);

    } catch (e) {
        console.error("Migration failed:", e);
    }
}
run();
