REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_business_admin(uuid, uuid) FROM public;

NOTIFY pgrst, 'reload schema';