CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE(role public.app_role, business_id uuid, branch_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ur.role, ur.business_id, ur.branch_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE WHEN ur.role = 'system_owner' THEN 0 ELSE 1 END, ur.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_roles() FROM public;
REVOKE ALL ON FUNCTION public.get_my_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

NOTIFY pgrst, 'reload schema';