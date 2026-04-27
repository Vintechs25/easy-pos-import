CREATE TYPE public.app_role AS ENUM ('system_owner', 'business_admin', 'supervisor', 'cashier', 'staff');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  license_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  license_expires_at timestamptz,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  address text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, business_id, branch_id)
);

CREATE TABLE public.business_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  contact_person text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hardware_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  category text,
  unit text NOT NULL DEFAULT 'piece',
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  supplier text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.timber_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  species text NOT NULL,
  grade text,
  thickness numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 0,
  length numeric NOT NULL DEFAULT 0,
  dim_unit text NOT NULL DEFAULT 'inch',
  length_unit text NOT NULL DEFAULT 'ft',
  price_per_unit numeric NOT NULL DEFAULT 0,
  price_unit text NOT NULL DEFAULT 'piece',
  pieces numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  type text NOT NULL DEFAULT 'walk-in',
  credit_limit numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  loyalty_discount_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  receipt_no text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  payment_ref text,
  mpesa_transaction_id uuid,
  status text NOT NULL DEFAULT 'paid',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid,
  kind text NOT NULL,
  name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_label text,
  total numeric NOT NULL DEFAULT 0,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mpesa_config (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'sandbox',
  shortcode text,
  passkey text,
  consumer_key text,
  consumer_secret text,
  callback_url text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  phone text NOT NULL,
  account_reference text,
  transaction_desc text,
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  result_code integer,
  result_desc text,
  mpesa_receipt_number text,
  initiated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ADD CONSTRAINT sales_mpesa_transaction_id_fkey FOREIGN KEY (mpesa_transaction_id) REFERENCES public.mpesa_transactions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'system_owner') OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
  ) OR EXISTS (
    SELECT 1 FROM public.business_users
    WHERE user_id = _user_id AND business_id = _business_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'system_owner') OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id AND role = 'business_admin'
  );
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hardware_products_updated_at BEFORE UPDATE ON public.hardware_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_timber_products_updated_at BEFORE UPDATE ON public.timber_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mpesa_config_updated_at BEFORE UPDATE ON public.mpesa_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mpesa_transactions_updated_at BEFORE UPDATE ON public.mpesa_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_business_id ON public.user_roles(business_id);
CREATE INDEX idx_branches_business_id ON public.branches(business_id);
CREATE INDEX idx_hardware_branch_id ON public.hardware_products(branch_id);
CREATE INDEX idx_timber_branch_id ON public.timber_products(branch_id);
CREATE INDEX idx_customers_business_id ON public.customers(business_id);
CREATE INDEX idx_suppliers_business_id ON public.suppliers(business_id);
CREATE INDEX idx_sales_business_branch ON public.sales(business_id, branch_id);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_mpesa_checkout ON public.mpesa_transactions(checkout_request_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timber_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpesa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'system_owner'));
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'system_owner'));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'system_owner'));

CREATE POLICY "Members can view accessible businesses" ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), id));
CREATE POLICY "System owners can create businesses" ON public.businesses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'system_owner'));
CREATE POLICY "System owners can update businesses" ON public.businesses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'system_owner'));
CREATE POLICY "System owners can delete businesses" ON public.businesses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'system_owner'));

CREATE POLICY "Members can view branches" ON public.branches FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Admins can create branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (public.is_business_admin(auth.uid(), business_id));
CREATE POLICY "Admins can update branches" ON public.branches FOR UPDATE TO authenticated USING (public.is_business_admin(auth.uid(), business_id));
CREATE POLICY "Admins can delete branches" ON public.branches FOR DELETE TO authenticated USING (public.is_business_admin(auth.uid(), business_id));

CREATE POLICY "Members can view roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'system_owner') OR user_id = auth.uid() OR public.is_business_admin(auth.uid(), business_id));
CREATE POLICY "Admins can create roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_business_admin(auth.uid(), business_id));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_business_admin(auth.uid(), business_id));

CREATE POLICY "Members can view business users" ON public.business_users FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Admins can manage business users" ON public.business_users FOR ALL TO authenticated USING (public.is_business_admin(auth.uid(), business_id)) WITH CHECK (public.is_business_admin(auth.uid(), business_id));

CREATE POLICY "Members can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members can view hardware" ON public.hardware_products FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create hardware" ON public.hardware_products FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update hardware" ON public.hardware_products FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can delete hardware" ON public.hardware_products FOR DELETE TO authenticated USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members can view timber" ON public.timber_products FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create timber" ON public.timber_products FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update timber" ON public.timber_products FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can delete timber" ON public.timber_products FOR DELETE TO authenticated USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members can view customers" ON public.customers FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can delete customers" ON public.customers FOR DELETE TO authenticated USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members can view sales" ON public.sales FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can create sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update sales" ON public.sales FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Members can view sale items" ON public.sale_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.is_business_member(auth.uid(), s.business_id)));
CREATE POLICY "Members can create sale items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.is_business_member(auth.uid(), s.business_id)));

CREATE POLICY "Admins can view mpesa config" ON public.mpesa_config FOR SELECT TO authenticated USING (public.is_business_admin(auth.uid(), business_id));
CREATE POLICY "Admins can manage mpesa config" ON public.mpesa_config FOR ALL TO authenticated USING (public.is_business_admin(auth.uid(), business_id)) WITH CHECK (public.is_business_admin(auth.uid(), business_id));

CREATE POLICY "Members can view mpesa transactions" ON public.mpesa_transactions FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "Members can update mpesa transactions" ON public.mpesa_transactions FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id));