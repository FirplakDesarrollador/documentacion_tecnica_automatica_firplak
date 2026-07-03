-- App-level SAP write switch. Environment variable SAP_ENABLE_WRITES remains the master guard.

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('sap_writes_enabled', to_jsonb(false), now())
ON CONFLICT (key) DO NOTHING;
