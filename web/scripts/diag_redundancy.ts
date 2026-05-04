import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function runDiagnostic() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY!;
    const supabase = createClient(supabaseUrl, supabaseSecret);

    console.log('--- DIAGNÓSTICO DE REDUNDANCIA DE DATOS ---');

    console.log('\nCargando datos de la tabla cabinet_products...');
    const { data: products, error } = await supabase
        .from('cabinet_products')
        .select('*')
        .limit(2000); // Suficiente para detectar patrones

    if (error || !products) {
        console.error('Error al cargar productos:', error);
        return;
    }

    console.log(`📦 Se analizaron ${products.length} registros.\n`);

    // 1. Análisis por SKU_BASE (Fam-Ref-Ver)
    const skuGroups: Record<string, any[]> = {};
    products.forEach(p => {
        if (p.sku_base) {
            if (!skuGroups[p.sku_base]) skuGroups[p.sku_base] = [];
            skuGroups[p.sku_base].push(p);
        }
    });

    const skuAnalysis = Object.entries(skuGroups)
        .filter(([_, group]) => group.length > 1)
        .map(([sku, group]) => {
            const distinctWidths = new Set(group.map(p => p.width_cm)).size;
            const distinctDepths = new Set(group.map(p => p.depth_cm)).size;
            const distinctHeights = new Set(group.map(p => p.height_cm)).size;
            const distinctColors = new Set(group.map(p => p.color_code)).size;
            return {
                sku_base: sku,
                total: group.length,
                colors: distinctColors,
                widths: distinctWidths,
                depths: distinctDepths,
                heights: distinctHeights,
                identical_physical: (distinctWidths === 1 && distinctDepths === 1 && distinctHeights === 1) ? 'SÍ' : 'NO'
            };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    console.log('1. Análisis por SKU_BASE (Fam-Ref-Ver): ¿Datos idénticos variando solo color?');
    console.table(skuAnalysis);

    // 2. Análisis por FAMILIA-REF
    const famRefGroups: Record<string, any[]> = {};
    products.forEach(p => {
        const key = `${p.familia_code}-${p.ref_code}`;
        if (p.familia_code && p.ref_code) {
            if (!famRefGroups[key]) famRefGroups[key] = [];
            famRefGroups[key].push(p);
        }
    });

    const famRefAnalysis = Object.entries(famRefGroups)
        .filter(([_, group]) => group.length > 1)
        .map(([key, group]) => {
            const distinctVersions = new Set(group.map(p => p.version_code)).size;
            const distinctWidths = new Set(group.map(p => p.width_cm)).size;
            const distinctRh = new Set(group.map(p => p.rh)).size;
            return {
                fam_ref: key,
                records: group.length,
                versions: distinctVersions,
                widths: distinctWidths,
                rh_variants: distinctRh
            };
        })
        .sort((a, b) => b.versions - a.versions)
        .slice(0, 10);

    console.log('\n2. Análisis por FAMILIA-REF: ¿Mismo mueble variando solo Versión (RH/Armado)?');
    console.table(famRefAnalysis);

    const totalProducts = products.length;
    const totalSkuBases = Object.keys(skuGroups).length;
    const totalFurniture = Object.keys(famRefGroups).length;

    console.log('\n3. Resumen Global de Redundancia');
    console.log(`Total registros analizados: ${totalProducts}`);
    console.log(`Total SKU Bases (Fam-Ref-Ver): ${totalSkuBases} (${Math.round(totalSkuBases/totalProducts*100)}% del total)`);
    console.log(`Total Configuraciones Mueble (Fam-Ref): ${totalFurniture} (${Math.round(totalFurniture/totalProducts*100)}% del total)`);
    console.log(`\nPromedio de colores por SKU Base: ${(totalProducts / totalSkuBases).toFixed(1)}`);
}

runDiagnostic().catch(console.error);
