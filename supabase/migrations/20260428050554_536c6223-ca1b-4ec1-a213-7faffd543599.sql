GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) FROM anon;

NOTIFY pgrst, 'reload schema';