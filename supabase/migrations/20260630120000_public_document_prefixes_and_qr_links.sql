-- Public document QR links with dynamic document prefixes.
-- Keeps product_asset_links as the relationship source of truth while allowing
-- public URLs such as ins/mueble-elevado-...

create table if not exists public.document_slug_prefixes (
  id uuid primary key default gen_random_uuid(),
  document_slot text not null,
  label text not null,
  prefix text not null,
  description text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_slug_prefixes_slot_check check (document_slot ~ '^[a-z0-9_]+$'),
  constraint document_slug_prefixes_prefix_check check (prefix ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint document_slug_prefixes_document_slot_key unique (document_slot),
  constraint document_slug_prefixes_prefix_key unique (prefix)
);

create or replace function public.set_document_slug_prefixes_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists set_document_slug_prefixes_updated_at on public.document_slug_prefixes;
create trigger set_document_slug_prefixes_updated_at
before update on public.document_slug_prefixes
for each row
execute function public.set_document_slug_prefixes_updated_at();

alter table public.document_slug_prefixes enable row level security;

drop policy if exists document_slug_prefixes_public_active_select on public.document_slug_prefixes;
create policy document_slug_prefixes_public_active_select
on public.document_slug_prefixes
for select
to anon
using (active = true);

drop policy if exists document_slug_prefixes_authenticated_active_select on public.document_slug_prefixes;
create policy document_slug_prefixes_authenticated_active_select
on public.document_slug_prefixes
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists document_slug_prefixes_admin_all on public.document_slug_prefixes;
create policy document_slug_prefixes_admin_all
on public.document_slug_prefixes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.document_slug_prefixes (document_slot, label, prefix, description)
values
  ('manual_instalacion', 'Instructivo / manual de instalacion', 'ins', 'Documentos publicos de instalacion o armado por producto.'),
  ('isometrico', 'Isometrico', 'iso', 'Isometricos publicables cuando se requiera QR o enlace externo.'),
  ('garantia', 'Garantia', 'gar', 'Garantias generales o por alcance de producto.'),
  ('cuidados', 'Cuidados', 'cui', 'Cuidados y recomendaciones de uso.'),
  ('manual_general', 'Manual general', 'man', 'Manuales de uso o consulta general.')
on conflict (document_slot) do update
set label = excluded.label,
    prefix = excluded.prefix,
    description = excluded.description,
    active = true,
    updated_at = now();

create table if not exists public.nomenclature_abbreviations (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  source_value text not null,
  abbreviation text not null,
  description text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nomenclature_abbreviations_category_check check (category ~ '^[a-z0-9_]+$'),
  constraint nomenclature_abbreviations_abbreviation_check check (abbreviation ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint nomenclature_abbreviations_category_source_key unique (category, source_value)
);

create or replace function public.set_nomenclature_abbreviations_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists set_nomenclature_abbreviations_updated_at on public.nomenclature_abbreviations;
create trigger set_nomenclature_abbreviations_updated_at
before update on public.nomenclature_abbreviations
for each row
execute function public.set_nomenclature_abbreviations_updated_at();

alter table public.nomenclature_abbreviations enable row level security;

drop policy if exists nomenclature_abbreviations_admin_all on public.nomenclature_abbreviations;
create policy nomenclature_abbreviations_admin_all
on public.nomenclature_abbreviations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.nomenclature_abbreviations (category, source_value, abbreviation, description)
values
  ('use_destination', 'LAVAMANOS', 'lvm', 'Destino de uso para muebles o productos de lavamanos.'),
  ('use_destination', 'COCINA', 'coc', 'Destino de uso para cocina.'),
  ('use_destination', 'LAVARROPAS', 'lvr', 'Destino de uso para lavarropas.'),
  ('use_destination', 'LAVATRAPERO', 'lvt', 'Destino de uso para lavatrapero.')
on conflict (category, source_value) do update
set abbreviation = excluded.abbreviation,
    description = excluded.description,
    active = true,
    updated_at = now();

alter table public.assets
  drop constraint if exists assets_type_check;

alter table public.assets
  add constraint assets_type_check check (type ~ '^[a-z0-9_]+$');

alter table public.product_asset_links
  add column if not exists is_public boolean not null default false,
  add column if not exists document_slot text null,
  add column if not exists document_label text null,
  add column if not exists slug_prefix text null,
  add column if not exists slug_body text null,
  add column if not exists slug_strategy_version int not null default 1,
  add column if not exists family_code text null,
  add column if not exists product_type text null,
  add column if not exists manufacturing_process text null,
  add column if not exists use_destination text null,
  add column if not exists global_key text null;

alter table public.product_asset_links
  drop constraint if exists product_asset_links_public_slug_check,
  drop constraint if exists product_asset_links_public_slug_format,
  drop constraint if exists product_asset_links_single_target_check,
  drop constraint if exists product_asset_links_one_target,
  drop constraint if exists product_asset_links_slug_prefix_check,
  drop constraint if exists product_asset_links_slug_body_check,
  drop constraint if exists product_asset_links_document_slot_check,
  drop constraint if exists product_asset_links_public_components_check;

update public.product_asset_links
set is_public = true,
    document_slot = coalesce(document_slot, 'manual_instalacion'),
    document_label = coalesce(document_label, 'Instructivo de instalacion'),
    slug_prefix = case
      when public_slug is not null and position('/' in public_slug) > 0 then split_part(public_slug, '/', 1)
      else 'ins'
    end,
    slug_body = case
      when public_slug is not null and position('/' in public_slug) > 0 then split_part(public_slug, '/', 2)
      else public_slug
    end,
    public_slug = case
      when public_slug is not null and position('/' in public_slug) > 0 then public_slug
      else 'ins/' || public_slug
    end,
    slug_strategy_version = coalesce(slug_strategy_version, 1),
    updated_at = now()
where public_slug is not null;

alter table public.product_asset_links
  add constraint product_asset_links_single_target_check check (
    num_nonnulls(
      reference_id,
      version_id,
      sku_id,
      family_code,
      product_type,
      manufacturing_process,
      use_destination,
      global_key
    ) = 1
  ),
  add constraint product_asset_links_public_slug_check check (
    public_slug is null
    or public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  add constraint product_asset_links_slug_prefix_check check (
    slug_prefix is null or slug_prefix ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  add constraint product_asset_links_slug_body_check check (
    slug_body is null or slug_body ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  add constraint product_asset_links_document_slot_check check (
    document_slot is null or document_slot ~ '^[a-z0-9_]+$'
  ),
  add constraint product_asset_links_public_components_check check (
    is_public = false
    or status <> 'approved'
    or (
      document_slot is not null
      and slug_prefix is not null
      and slug_body is not null
      and public_slug = slug_prefix || '/' || slug_body
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_asset_links_family_code_fkey'
  ) then
    alter table public.product_asset_links
      add constraint product_asset_links_family_code_fkey
      foreign key (family_code) references public.families(family_code) on delete cascade;
  end if;
end $$;

create index if not exists product_asset_links_document_slot_idx
  on public.product_asset_links(document_slot)
  where document_slot is not null;

create index if not exists product_asset_links_slug_prefix_idx
  on public.product_asset_links(slug_prefix)
  where slug_prefix is not null;

create index if not exists product_asset_links_family_code_idx
  on public.product_asset_links(family_code)
  where family_code is not null;

create index if not exists product_asset_links_product_type_idx
  on public.product_asset_links(product_type)
  where product_type is not null;

create index if not exists product_asset_links_manufacturing_process_idx
  on public.product_asset_links(manufacturing_process)
  where manufacturing_process is not null;

create index if not exists product_asset_links_use_destination_idx
  on public.product_asset_links(use_destination)
  where use_destination is not null;

create index if not exists product_asset_links_global_key_idx
  on public.product_asset_links(global_key)
  where global_key is not null;

create unique index if not exists product_asset_links_one_approved_slug_per_family_idx
  on public.product_asset_links(public_slug, family_code)
  where public_slug is not null
    and family_code is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_product_type_idx
  on public.product_asset_links(public_slug, product_type)
  where public_slug is not null
    and product_type is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_manufacturing_idx
  on public.product_asset_links(public_slug, manufacturing_process)
  where public_slug is not null
    and manufacturing_process is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_use_destination_idx
  on public.product_asset_links(public_slug, use_destination)
  where public_slug is not null
    and use_destination is not null
    and status = 'approved';

create unique index if not exists product_asset_links_one_approved_slug_per_global_idx
  on public.product_asset_links(public_slug, global_key)
  where public_slug is not null
    and global_key is not null
    and status = 'approved';
