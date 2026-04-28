ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS refunded_by uuid,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE TABLE IF NOT EXISTS public.sale_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  restocked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view sale refunds" ON public.sale_refunds;
CREATE POLICY "Members can view sale refunds"
ON public.sale_refunds
FOR SELECT
TO authenticated
USING (public.is_business_member(auth.uid(), business_id));

DROP POLICY IF EXISTS "Members can create sale refunds" ON public.sale_refunds;
CREATE POLICY "Members can create sale refunds"
ON public.sale_refunds
FOR INSERT
TO authenticated
WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE INDEX IF NOT EXISTS idx_sale_refunds_sale ON public.sale_refunds(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_business ON public.sale_refunds(business_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_branch ON public.sale_refunds(branch_id);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_kind text NOT NULL,
  product_name text NOT NULL,
  delta numeric NOT NULL DEFAULT 0,
  old_value numeric NOT NULL DEFAULT 0,
  new_value numeric NOT NULL DEFAULT 0,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Members can view stock adjustments"
ON public.stock_adjustments
FOR SELECT
TO authenticated
USING (public.is_business_member(auth.uid(), business_id));

DROP POLICY IF EXISTS "Members can create stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Members can create stock adjustments"
ON public.stock_adjustments
FOR INSERT
TO authenticated
WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_business ON public.stock_adjustments(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_branch ON public.stock_adjustments(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON public.stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created ON public.stock_adjustments(created_at DESC);