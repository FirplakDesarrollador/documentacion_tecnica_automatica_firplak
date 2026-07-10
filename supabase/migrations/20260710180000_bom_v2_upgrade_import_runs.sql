-- Complete the V2 shape for historical import runs and component defaults.

ALTER TABLE public.component_items
  ALTER COLUMN item_bom_structure SET DEFAULT jsonb_build_object(
    'schema_version', 2,
    'structure_type', 'component',
    'input_warehouse_code', NULL,
    'output_warehouse_code', NULL,
    'lines', jsonb_build_array()
  );

UPDATE public.product_bom_import_runs run
SET proposed_bom_structure = jsonb_set(
      jsonb_set(COALESCE(run.proposed_bom_structure, '{}'::jsonb), '{schema_version}', '2'::jsonb, true),
      '{lines}',
      COALESCE((
        SELECT jsonb_agg(
          line.value || jsonb_build_object(
            'line_kind', COALESCE(NULLIF(line.value ->> 'line_kind', ''), 'fixed'),
            'alternatives', COALESCE(line.value -> 'alternatives', '[]'::jsonb),
            'consumptions', COALESCE(line.value -> 'consumptions', '[]'::jsonb)
          )
          ORDER BY line.ordinality
        )
        FROM jsonb_array_elements(COALESCE(run.proposed_bom_structure -> 'lines', '[]'::jsonb))
          WITH ORDINALITY AS line(value, ordinality)
      ), '[]'::jsonb),
      true
    ),
    published_bom_structure = CASE
      WHEN run.published_bom_structure IS NULL THEN NULL
      ELSE jsonb_set(
        jsonb_set(run.published_bom_structure, '{schema_version}', '2'::jsonb, true),
        '{lines}',
        COALESCE((
          SELECT jsonb_agg(
            line.value || jsonb_build_object(
              'line_kind', COALESCE(NULLIF(line.value ->> 'line_kind', ''), 'fixed'),
              'alternatives', COALESCE(line.value -> 'alternatives', '[]'::jsonb),
              'consumptions', COALESCE(line.value -> 'consumptions', '[]'::jsonb)
            )
            ORDER BY line.ordinality
          )
          FROM jsonb_array_elements(COALESCE(run.published_bom_structure -> 'lines', '[]'::jsonb))
            WITH ORDINALITY AS line(value, ordinality)
        ), '[]'::jsonb),
        true
      )
    END;
