-- Permitir que assets almacene los tipos canonicos del flujo "Asociar recursos".

alter table public.assets
  drop constraint if exists assets_type_check;

alter table public.assets
  add constraint assets_type_check check (
    type = any (array[
      'logo'::text,
      'client_logo'::text,
      'icon'::text,
      'isometric'::text,
      'symbol'::text,
      'instruction_pdf'::text,
      'front_view_dimensioned'::text,
      'side_view_dimensioned'::text,
      'top_view_dimensioned'::text,
      'exploded_view'::text,
      'assembly_step'::text
    ])
  );
