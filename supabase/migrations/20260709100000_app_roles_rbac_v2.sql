-- RBAC v2 minimo: catalogo de roles con modulos permitidos.
-- No aplicar en remoto sin revision y confirmacion explicita.

CREATE TABLE IF NOT EXISTS public.app_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NULL,
  allowed_modules text[] NOT NULL DEFAULT '{}'::text[],
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_roles_key_format_check CHECK (key ~ '^[a-z][a-z0-9_-]{1,31}$'),
  CONSTRAINT app_roles_label_not_blank_check CHECK (NULLIF(BTRIM(label), '') IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.set_app_roles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_roles_set_updated_at ON public.app_roles;
CREATE TRIGGER trg_app_roles_set_updated_at
BEFORE UPDATE ON public.app_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_app_roles_updated_at();

INSERT INTO public.app_roles (key, label, description, allowed_modules, is_system, active)
VALUES
  (
    'admin',
    'Admin',
    'Acceso total al sistema y administracion de usuarios, roles y configuracion.',
    ARRAY[
      'module:dashboard',
      'module:pending',
      'module:templates',
      'module:datasets',
      'module:assets',
      'module:generate',
      'module:print',
      'module:product-design',
      'module:productive-modules',
      'module:configuration',
      'module:consulta-sap'
    ]::text[],
    true,
    true
  ),
  (
    'production',
    'Produccion',
    'Acceso operativo a impresion y modulos productivos.',
    ARRAY['module:print', 'module:productive-modules']::text[],
    true,
    true
  ),
  (
    'designer',
    'Diseno',
    'Acceso a herramientas de diseno tecnico de producto.',
    ARRAY['module:product-design']::text[],
    true,
    true
  ),
  (
    'engineering',
    'Ingenieria',
    'Rol reservado sin modulos activos por defecto.',
    ARRAY[]::text[],
    true,
    true
  ),
  (
    'pending',
    'Pendiente',
    'Usuario autenticado sin modulos asignados.',
    ARRAY[]::text[],
    true,
    true
  )
ON CONFLICT (key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  allowed_modules = EXCLUDED.allowed_modules,
  is_system = EXCLUDED.is_system,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_fkey;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_fkey
FOREIGN KEY (role)
REFERENCES public.app_roles(key)
ON UPDATE RESTRICT
ON DELETE RESTRICT;

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_roles_authenticated_select ON public.app_roles;
CREATE POLICY app_roles_authenticated_select
ON public.app_roles
FOR SELECT
TO authenticated
USING (true);

REVOKE ALL ON TABLE public.app_roles FROM anon;
GRANT SELECT ON TABLE public.app_roles TO authenticated;
GRANT ALL ON TABLE public.app_roles TO service_role;
