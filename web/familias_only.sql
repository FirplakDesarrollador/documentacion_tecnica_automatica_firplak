-- FAMILIAS (5 registros)
INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)
VALUES ('BAN05', 'Muebles Lavamanos BAN05', 'MUEBLE', 'LAVAMANOS', false, false, '2026-03-10T18:48:01.298Z')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)
VALUES ('BAN12', 'Muebles Lavamanos Class', 'MUEBLE', 'LAVAMANOS', false, false, '2026-03-10T18:48:01.313Z')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)
VALUES ('BAN22', 'Muebles Class Armados', 'MUEBLE', 'LAVAMANOS', true, false, '2026-03-10T18:48:01.324Z')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)
VALUES ('BAN23', 'Muebles Life Armados', 'MUEBLE', 'LAVAMANOS', true, false, '2026-03-10T18:48:01.333Z')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.familias (code, name, product_type, use_destination, assembled_default, rh_default, created_at)
VALUES ('BAN24', 'Muebles Esencial Armados', 'MUEBLE', 'LAVAMANOS', true, false, '2026-03-10T18:48:01.340Z')
ON CONFLICT (code) DO NOTHING;

