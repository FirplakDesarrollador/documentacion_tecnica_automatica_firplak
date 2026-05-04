import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

(async () => {
    const families = ['EXH01', 'VEXH01'];
    
    console.log('Finding blocking references...');
    const { data: refs, error: refError } = await sb
        .from('product_references')
        .select('id, reference_code, family_code')
        .in('family_code', families);
    
    if (refError) {
        console.error('Error fetching refs:', refError.message);
        return;
    }

    if (refs && refs.length > 0) {
        console.log(`Found ${refs.length} references:`, refs);
        
        const refIds = refs.map(r => r.id);
        
        // Before deleting references, check for SKUs
        const { data: skus, error: skuError } = await sb
            .from('product_skus')
            .select('id, sku_complete')
            .in('reference_id', refIds);
            
        if (skus && skus.length > 0) {
            console.log(`Found ${skus.length} blocking SKUs:`, skus);
            const skuIds = skus.map(s => s.id);
            const { error: delSkuErr } = await sb.from('product_skus').delete().in('id', skuIds);
            if (delSkuErr) console.error('Error deleting SKUs:', delSkuErr.message);
            else console.log('Deleted blocking SKUs.');
        }

        const { error: delRefErr } = await sb.from('product_references').delete().in('id', refIds);
        if (delRefErr) console.error('Error deleting references:', delRefErr.message);
        else console.log('Deleted blocking references.');
    } else {
        console.log('No blocking references found.');
    }

    console.log('Deleting families...');
    for (const fam of families) {
        const { error: famErr } = await sb.from('families').delete().eq('family_code', fam);
        if (famErr) console.error(`Error deleting family ${fam}:`, famErr.message);
        else console.log(`Deleted family ${fam}`);
    }
    
    console.log('Cleanup V2 finished.');
})();
