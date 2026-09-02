-- Permite reutilizar component_items como clasificación productiva y de costo.
-- MO y CIF no son inferibles de forma fiable desde los campos estándar de SAP.

ALTER TABLE public.component_items
  DROP CONSTRAINT IF EXISTS component_items_category_check;

ALTER TABLE public.component_items
  ADD CONSTRAINT component_items_category_check CHECK (
    component_category = ANY (ARRAY[
      'material',
      'hardware',
      'packaging',
      'mo',
      'cif',
      'process',
      'substructure',
      'child_sku',
      'unknown'
    ])
  );
