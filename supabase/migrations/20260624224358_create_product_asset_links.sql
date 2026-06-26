-- Relacionamiento escalable de recursos de producto.
-- Mantiene isometricos en el flujo legacy y habilita instructivos/vistas/despieces/pasos.

create table public.product_asset_links (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  reference_id uuid null references public.product_references(id) on delete cascade,
  version_id uuid null references public.product_versions(id) on delete cascade,
  sku_id uuid null references public.product_skus(id) on delete cascade,
  public_slug text null,
  version_number int not null default 1,
  status text not null default 'approved',
  sort_order int not null default 0,
  revision_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_asset_links_single_target_check check (
    num_nonnulls(reference_id, version_id, sku_id) = 1
  ),
  constraint product_asset_links_version_number_check check (version_number > 0),
  constraint product_asset_links_status_check check (
    status in ('draft', 'review', 'approved', 'replaced', 'rejected')
  ),
  constraint product_asset_links_public_slug_check check (
    public_slug is null or public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

create index product_asset_links_asset_id_idx
  on public.product_asset_links(asset_id);

create index product_asset_links_reference_id_idx
  on public.product_asset_links(reference_id);

create index product_asset_links_version_id_idx
  on public.product_asset_links(version_id);

create index product_asset_links_sku_id_idx
  on public.product_asset_links(sku_id);

create index product_asset_links_public_slug_idx
  on public.product_asset_links(public_slug)
  where public_slug is not null;

create unique index product_asset_links_one_approved_public_slug_idx
  on public.product_asset_links(public_slug)
  where public_slug is not null and status = 'approved';

create or replace function public.set_product_asset_links_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger set_product_asset_links_updated_at
before update on public.product_asset_links
for each row
execute function public.set_product_asset_links_updated_at();

alter table public.product_asset_links enable row level security;

create policy product_asset_links_admin_all
on public.product_asset_links
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
