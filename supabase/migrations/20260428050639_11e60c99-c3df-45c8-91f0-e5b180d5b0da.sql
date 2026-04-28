CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_business_admin(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT app_private.has_role(_user_id, 'system_owner'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id AND role = 'business_admin'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_business_member(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT app_private.has_role(_user_id, 'system_owner'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
  ) OR EXISTS (
    SELECT 1 FROM public.business_users
    WHERE user_id = _user_id AND business_id = _business_id
  );
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION app_private.is_business_member(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION app_private.is_business_admin(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_business_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_business_admin(uuid, uuid) TO authenticated;

DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  roles_sql text;
  policy_sql text;
BEGIN
  FOR p IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%has_role(%'
        OR coalesce(qual, '') LIKE '%is_business_member(%'
        OR coalesce(qual, '') LIKE '%is_business_admin(%'
        OR coalesce(qual, '') LIKE '%public.has_role%'
        OR coalesce(qual, '') LIKE '%public.is_business_member%'
        OR coalesce(qual, '') LIKE '%public.is_business_admin%'
        OR coalesce(with_check, '') LIKE '%has_role(%'
        OR coalesce(with_check, '') LIKE '%is_business_member(%'
        OR coalesce(with_check, '') LIKE '%is_business_admin(%'
        OR coalesce(with_check, '') LIKE '%public.has_role%'
        OR coalesce(with_check, '') LIKE '%public.is_business_member%'
        OR coalesce(with_check, '') LIKE '%public.is_business_admin%'
      )
  LOOP
    new_qual := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'public.has_role', 'app_private.has_role');
      new_qual := replace(new_qual, 'public.is_business_member', 'app_private.is_business_member');
      new_qual := replace(new_qual, 'public.is_business_admin', 'app_private.is_business_admin');
      new_qual := replace(new_qual, 'has_role(', 'app_private.has_role(');
      new_qual := replace(new_qual, 'is_business_member(', 'app_private.is_business_member(');
      new_qual := replace(new_qual, 'is_business_admin(', 'app_private.is_business_admin(');
      new_qual := replace(new_qual, 'app_private.app_private.', 'app_private.');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'public.has_role', 'app_private.has_role');
      new_check := replace(new_check, 'public.is_business_member', 'app_private.is_business_member');
      new_check := replace(new_check, 'public.is_business_admin', 'app_private.is_business_admin');
      new_check := replace(new_check, 'has_role(', 'app_private.has_role(');
      new_check := replace(new_check, 'is_business_member(', 'app_private.is_business_member(');
      new_check := replace(new_check, 'is_business_admin(', 'app_private.is_business_admin(');
      new_check := replace(new_check, 'app_private.app_private.', 'app_private.');
    END IF;

    roles_sql := array_to_string(ARRAY(SELECT quote_ident(r) FROM unnest(p.roles) AS r), ', ');
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    policy_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, roles_sql);

    IF new_qual IS NOT NULL THEN
      policy_sql := policy_sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      policy_sql := policy_sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE policy_sql;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) FROM authenticated, anon, public;

NOTIFY pgrst, 'reload schema';