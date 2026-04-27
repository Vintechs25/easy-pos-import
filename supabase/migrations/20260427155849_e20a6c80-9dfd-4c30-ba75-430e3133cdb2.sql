REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_business_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_business_member(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_business_admin(uuid, uuid) FROM anon, authenticated;