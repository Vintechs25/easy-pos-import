GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';