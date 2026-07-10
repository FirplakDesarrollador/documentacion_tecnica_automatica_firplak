-- Preserve SAP ChildNum separately while using visible line order for app sorting.

UPDATE public.product_references
SET product_bom_structure = jsonb_set(
  product_bom_structure,
  '{lines}',
  (
    SELECT jsonb_agg(
      line.value || jsonb_build_object(
        'sap_child_num',
        CASE
          WHEN line.value ? 'sap_child_num' THEN line.value -> 'sap_child_num'
          WHEN (line.value ->> 'sort_order') ~ '^-?[0-9]+$' THEN to_jsonb((line.value ->> 'sort_order')::integer)
          ELSE NULL::jsonb
        END,
        'sort_order',
        line.ordinality::integer
      )
      ORDER BY line.ordinality
    )
    FROM jsonb_array_elements(product_bom_structure -> 'lines') WITH ORDINALITY AS line(value, ordinality)
  )
)
WHERE jsonb_typeof(product_bom_structure -> 'lines') = 'array'
  AND jsonb_array_length(product_bom_structure -> 'lines') > 0;
