-- Allow POS users to create pending M-Pesa transactions for businesses they belong to
DROP POLICY IF EXISTS "Members can create mpesa transactions" ON public.mpesa_transactions;
CREATE POLICY "Members can create mpesa transactions"
ON public.mpesa_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.is_business_member(auth.uid(), business_id));

-- Restrict M-Pesa configuration management to system owners only
DROP POLICY IF EXISTS "Admins can manage mpesa config" ON public.mpesa_config;
DROP POLICY IF EXISTS "Admins can view mpesa config" ON public.mpesa_config;
DROP POLICY IF EXISTS "System owners can manage mpesa config" ON public.mpesa_config;

CREATE POLICY "System owners can manage mpesa config"
ON public.mpesa_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));