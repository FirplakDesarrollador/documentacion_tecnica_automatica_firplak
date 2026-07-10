-- Reference BOMs cannot retain SKU-specific SAP snapshot fields.

UPDATE public.product_references AS reference
SET product_bom_structure = jsonb_set(
  reference.product_bom_structure,
  '{lines}',
  (
    SELECT jsonb_agg(
      line.value
        - 'sap_item_code'
        - 'sap_item_name'
        - 'sap_variant_code_4'
        - 'sap_child_num'
      ORDER BY line.ordinality
    )
    FROM jsonb_array_elements(reference.product_bom_structure -> 'lines')
      WITH ORDINALITY AS line(value, ordinality)
  )
)
WHERE jsonb_typeof(reference.product_bom_structure -> 'lines') = 'array'
  AND jsonb_array_length(reference.product_bom_structure -> 'lines') > 0
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(reference.product_bom_structure -> 'lines') AS line(value)
    WHERE line.value ?| ARRAY[
      'sap_item_code',
      'sap_item_name',
      'sap_variant_code_4',
      'sap_child_num'
    ]
  );
