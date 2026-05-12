import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching all product_references...");
    
    // Group keys by family
    const familySchemas: Record<string, Record<string, any>> = {};
    
    // We fetch in chunks if needed, but since there might not be too many, let's just fetch all family/ref_attrs pairs
    const { data: refs, error: errRefs } = await supabase
        .from('product_references')
        .select('family_code, ref_attrs');
        
    if (errRefs || !refs) {
        console.error("Error fetching refs:", errRefs);
        return;
    }
    
    console.log(`Analyzing ${refs.length} references...`);
    
    // Gather all distinct keys and their possible values per family
    const familyKeyValues: Record<string, Record<string, Set<string>>> = {};
    
    for (const r of refs) {
        const fam = r.family_code;
        const attrs = r.ref_attrs;
        
        if (!familyKeyValues[fam]) {
            familyKeyValues[fam] = {};
        }
        
        if (typeof attrs === 'object' && attrs !== null) {
            for (const key of Object.keys(attrs)) {
                if (!familyKeyValues[fam][key]) {
                    familyKeyValues[fam][key] = new Set<string>();
                }
                const val = attrs[key];
                if (val !== null && val !== undefined) {
                    familyKeyValues[fam][key].add(String(val));
                }
            }
        }
    }
    
    // Build the schema object per family
    for (const fam of Object.keys(familyKeyValues)) {
        familySchemas[fam] = {};
        for (const key of Object.keys(familyKeyValues[fam])) {
            const valuesSet = familyKeyValues[fam][key];
            // Ensure 'NA' is always an allowed value, or just use what we found
            valuesSet.add('NA');
            const allowedValues = Array.from(valuesSet);
            
            // Basic label logic (e.g. "carb2" -> "CARB2", "door_color_text" -> "DOOR COLOR TEXT")
            const label = key.toUpperCase().replace(/_/g, ' ');
            
            familySchemas[fam][key] = {
                label: label,
                type: 'enum',
                allowed_values: allowedValues,
                default_value: 'NA',
                active: true
            };
        }
    }
    
    console.log(`Found schemas for ${Object.keys(familySchemas).length} families. Updating DB...`);
    
    // Now update the families table
    for (const fam of Object.keys(familySchemas)) {
        const schema = familySchemas[fam];
        if (Object.keys(schema).length > 0) {
            const { error: errUp } = await supabase
                .from('families')
                .update({ ref_attrs_schema: schema })
                .eq('family_code', fam);
                
            if (errUp) {
                console.error(`Error updating family ${fam}:`, errUp);
            } else {
                console.log(`Updated schema for family ${fam}`);
            }
        }
    }
    
    console.log("Migration of existing schemas completed.");
}

run();
