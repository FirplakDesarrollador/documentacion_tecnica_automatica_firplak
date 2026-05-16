DO $$
DECLARE
  deps text[] := ARRAY[]::text[];
  item text;
  needle1 text := '%product_references.product_type%';
BEGIN
  -- No-op if the column is already gone.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_references'
      AND column_name = 'product_type'
  ) THEN
    RETURN;
  END IF;

  -- Pre-flight: fail early only for *real* references to product_references.product_type.
  -- We intentionally do NOT block on objects that merely mention product_references and families.product_type.
  FOR item IN
    (
      SELECT 'view:' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'v'
        AND (
          pg_get_viewdef(c.oid, true) ILIKE needle1
        )
      ORDER BY 1
      LIMIT 10
    )
  LOOP
    deps := array_append(deps, item);
  END LOOP;

  FOR item IN
    (
      SELECT 'function:' || quote_ident(n.nspname) || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      -- Only plain functions. pg_get_functiondef() throws on aggregates (e.g. array_agg).
      WHERE p.prokind = 'f'
        AND (
          pg_get_functiondef(p.oid) ILIKE needle1
          OR lower(pg_get_functiondef(p.oid)) LIKE '%insert into%product_references%product_type%'
          OR lower(pg_get_functiondef(p.oid)) LIKE '%update%product_references%product_type%'
        )
      ORDER BY 1
      LIMIT 10
    )
  LOOP
    deps := array_append(deps, item);
  END LOOP;

  FOR item IN
    (
      SELECT
        'policy:' || quote_ident(p.schemaname) || '.' || quote_ident(p.tablename) || '.' || quote_ident(p.policyname)
      FROM pg_policies p
      WHERE (p.qual ILIKE '%product_references%' AND p.qual ILIKE '%product_type%')
         OR (p.with_check ILIKE '%product_references%' AND p.with_check ILIKE '%product_type%')
      ORDER BY 1
      LIMIT 10
    )
  LOOP
    deps := array_append(deps, item);
  END LOOP;

  IF array_length(deps, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot drop public.product_references.product_type: dependencies still reference product_references + product_type. Fix these first: %',
      array_to_string(deps, '; ');
  END IF;

  ALTER TABLE public.product_references DROP COLUMN IF EXISTS product_type;
END $$;
