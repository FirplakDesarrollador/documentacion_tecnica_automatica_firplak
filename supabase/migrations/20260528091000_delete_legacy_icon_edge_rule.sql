DELETE FROM public.rules
WHERE rule_type = 'icon_activation'
  AND condition_expression = 'icon_edge_2mm == true'
  AND action_type = 'activate_icon'
  AND action_payload = 'icon-edge2mm';
