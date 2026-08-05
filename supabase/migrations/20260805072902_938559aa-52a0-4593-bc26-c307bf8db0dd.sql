-- 1. Promote legacy staff roles to owner, then de-duplicate
UPDATE public.user_roles SET role = 'owner'::public.app_role
WHERE role IN ('manager','cashier','inventory_staff');

DELETE FROM public.user_roles a USING public.user_roles b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.role = b.role;

-- 2. Recreate the enum with only owner + customer
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('owner','customer');

ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role
  USING role::text::public.app_role;

DROP POLICY IF EXISTS user_roles_manage ON public.user_roles;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role_old);
DROP TYPE public.app_role_old;

-- 3. Recreate role helpers against the new enum
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'owner'::public.app_role
  );
$$;

CREATE POLICY user_roles_manage ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

-- 4. Signup trigger: first account is owner, everyone else customer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'owner'::public.app_role ELSE 'customer'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;