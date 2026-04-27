INSERT INTO public.profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email)
FROM auth.users
WHERE lower(email) = 'vintechcyber24@gmail.com'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'system_owner'::app_role
FROM auth.users
WHERE lower(email) = 'vintechcyber24@gmail.com'
ON CONFLICT DO NOTHING;