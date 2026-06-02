ALTER TABLE public.naming_components
  DROP CONSTRAINT IF EXISTS naming_components_behavior_en_check;

ALTER TABLE public.naming_components
  ADD CONSTRAINT naming_components_behavior_en_check
  CHECK (behavior_en IN ('translate', 'preserve', 'resolved_type', 'translate_if_exists'));

NOTIFY pgrst, 'reload schema';
