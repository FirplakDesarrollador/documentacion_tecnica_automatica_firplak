-- Un mismo instructivo/slug puede servir a varias referencias o versiones.
-- La unicidad debe evitar duplicados por destino, no bloquear el slug globalmente.

drop index if exists public.product_asset_links_one_approved_slug_idx;
drop index if exists public.product_asset_links_one_approved_public_slug_idx;

create unique index if not exists product_asset_links_one_approved_slug_per_reference_idx
  on public.product_asset_links(public_slug, reference_id)
  where public_slug is not null
    and reference_id is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_version_idx
  on public.product_asset_links(public_slug, version_id)
  where public_slug is not null
    and version_id is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_sku_idx
  on public.product_asset_links(public_slug, sku_id)
  where public_slug is not null
    and sku_id is not null
    and status = 'approved';
