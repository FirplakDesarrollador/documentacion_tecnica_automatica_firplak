export interface ParsedSku {
  sku_complete: string;
  sku_base: string;
  family_code: string;
  reference_code: string;
  version_code: string;
  color_code: string;
}

export function parseSkuComplete(skuCompleteRaw: string): ParsedSku {
  const sku_complete = String(skuCompleteRaw || '').trim().toUpperCase();
  const parts = sku_complete.split('-').map(p => p.trim());
  if (parts.length < 4) {
    throw new Error(`SKU_COMPLETE inválido: "${sku_complete}"`);
  }
  const sku_base = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const family_code = parts[0].toUpperCase().startsWith('V') ? parts[0].substring(1) : parts[0];
  return {
    sku_complete,
    sku_base,
    family_code,
    reference_code: parts[1],
    version_code: parts[2],
    color_code: parts[3],
  };
}

