DROP POLICY IF EXISTS "Members can view refunds" ON public.sale_refunds;
DROP POLICY IF EXISTS "Members can create refunds" ON public.sale_refunds;
DROP POLICY IF EXISTS "Members can view stock adjustments" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Members can create stock adjustments" ON public.stock_adjustments;

CREATE POLICY "Members can view refunds" ON public.sale_refunds FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create refunds" ON public.sale_refunds FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can view stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));