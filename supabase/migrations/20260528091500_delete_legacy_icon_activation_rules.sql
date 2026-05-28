DELETE FROM public.rules
WHERE rule_type = 'icon_activation'
  AND action_type = 'activate_icon'
  AND (
    (condition_expression = 'icon_full_extension == true' AND action_payload = 'icon-full-ext')
    OR (condition_expression = 'rh == ''RH''' AND action_payload = 'icon-rh')
  );
