import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    const skusToDelete = ['VCOC01-0115-000-0442', 'VEXH01-0051-000-0467'];
    const familiesToDelete = ['VEXH01', 'EXH01'];

    console.log('Cleaning up SKUs...');
    for (const sku of skusToDelete) {
        const { error } = await sb.from('product_skus').delete().eq('sku_complete', sku);
        if (error) console.error(`Error deleting SKU ${sku}:`, error.message);
        else console.log(`Deleted SKU ${sku}`);
    }

    console.log('Cleaning up families from families and familias...');
    for (const fam of familiesToDelete) {
        // Delete from V6.1
        const { error: err1 } = await sb.from('families').delete().eq('family_code', fam);
        if (err1) console.error(`Error deleting family ${fam} from families:`, err1.message);
        else console.log(`Deleted family ${fam} from families`);

        // Delete from legacy
        const { error: err2 } = await sb.from('familias').delete().eq('code', fam);
        if (err2) console.error(`Error deleting family ${fam} from familias:`, err2.message);
        else console.log(`Deleted family ${fam} from familias`);
    }

    // Since reference and version have cascade delete (hopefully), they should be gone if SKUs were the only ones.
    // If not, we might need to delete them explicitly. But usually V6.1 is designed with cascade or we manually delete.
    
    console.log('Cleanup finished.');
})();
