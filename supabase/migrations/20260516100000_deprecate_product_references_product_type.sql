DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_references'
      AND column_name = 'product_type'
  ) THEN
    COMMENT ON COLUMN public.product_references.product_type IS
      'DEPRECATED: no se usa; la fuente de verdad es families.product_type; se eliminará en la siguiente migración.';
  END IF;
END $$;

