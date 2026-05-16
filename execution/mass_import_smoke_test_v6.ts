/* eslint-disable no-console */
// Smoke test for Mass Import V6 RPCs (preview only).
// Note: This script is intentionally CommonJS to avoid ts-node ESM resolution issues on Windows.

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { supabaseServer } = require('../src/lib/supabase');

async function main() {
  const { data: existing, error } = await supabaseServer
    .from('product_skus')
    .select('sku_complete')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error || !existing?.[0]?.sku_complete) throw new Error('Failed to fetch an existing SKU');

  const baseSku = String(existing[0].sku_complete);
  const parts = baseSku.split('-');
  const sku1 = `${parts[0]}-${parts[1]}-${parts[2]}-0100`;
  const sku2 = `${parts[0]}-${parts[1]}-${parts[2]}-0000`;
  const sku3 = `${parts[0]}-${parts[1]}-${parts[2]}-9999`;

  const { data: preview, error: prevErr } = await supabaseServer.rpc('bulk_import_products_v2', {
    p_payload: {
      rows: [
        { sku_complete: sku1, sap_description_original: 'TEST DESC 1', product_name: 'TEST PRODUCT', special_label: 'NA', ref_attrs: { rh: 'NA' }, version_label: 'NA', version_attrs: {}, sku_attrs: {} },
        { sku_complete: sku2, sap_description_original: 'TEST DESC 2', product_name: 'TEST PRODUCT', special_label: 'NA', ref_attrs: { rh: 'RH' }, version_label: 'NA', version_attrs: {}, sku_attrs: { test: true } },
        { sku_complete: sku3, sap_description_original: 'TEST DESC 3', product_name: 'TEST PRODUCT', special_label: 'NA', ref_attrs: { rh: 'NA' }, version_label: 'NA', version_attrs: {}, sku_attrs: {} },
      ],
      families: [],
      colors: [],
    },
    p_dry_run: true,
    p_test_rollback: false,
  });
  if (prevErr) throw new Error(prevErr.message);

  console.log('Preview OK:', JSON.stringify(preview, null, 2).slice(0, 2000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
