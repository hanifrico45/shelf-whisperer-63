-- =====================================================================
-- InventoryBookshelf — COMPLETE SCHEMA
-- Recreates the entire application backend on a fresh Supabase project.
-- Run once, top to bottom, on an empty project (SQL Editor or CLI).
-- Idempotent where practical. Schema + reference seed data only (no user data).
-- =====================================================================

-- ---------------------------------------------------------------- ENUMS
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('owner','customer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.book_status AS ENUM ('active','archived','out_of_stock','discontinued'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM ('cash','card','transfer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.sale_status AS ENUM ('completed','refunded','void'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.purchase_order_status AS ENUM ('draft','ordered','partially_received','received','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------- SHARED TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =====================================================================
-- TABLES + GRANTS + RLS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- role helpers (security definer) — defined before policies that use them
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'::public.app_role); $$;

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_email text,
  phone text,
  website text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishers TO authenticated;
GRANT ALL ON public.publishers TO service_role;
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_name text,
  contact_email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  isbn text UNIQUE,
  barcode text,
  cover_url text,
  description text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_cost numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  status public.book_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL UNIQUE REFERENCES public.books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  minimum_stock_level integer NOT NULL DEFAULT 5,
  shelf_location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT 'book',
  entity_id uuid,
  entity_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text NOT NULL UNIQUE,
  cashier_id uuid REFERENCES auth.users(id),
  customer_name text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'amount',
  discount_value numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  change_due numeric NOT NULL DEFAULT 0,
  status public.sale_status NOT NULL DEFAULT 'completed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  title text NOT NULL,
  author text,
  isbn text,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  discount_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  receipt_number text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  print_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing',
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'card',
  shipping_address text,
  contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status public.purchase_order_status NOT NULL DEFAULT 'draft',
  expected_date date,
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  title text NOT NULL,
  isbn text,
  unit_cost numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  quantity_received integer NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_books_status ON public.books (status);
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books (title);
CREATE INDEX IF NOT EXISTS idx_books_author ON public.books (author);
CREATE INDEX IF NOT EXISTS idx_books_category ON public.books (category_id);
CREATE INDEX IF NOT EXISTS idx_books_publisher ON public.books (publisher_id);
CREATE INDEX IF NOT EXISTS idx_books_supplier ON public.books (supplier_id);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON public.books (isbn);
CREATE INDEX IF NOT EXISTS idx_inventory_book ON public.inventory (book_id);
CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON public.inventory (quantity);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_book_id ON public.sale_items (book_id);
CREATE INDEX IF NOT EXISTS idx_transactions_sale_id ON public.transactions (sale_id);
CREATE INDEX IF NOT EXISTS idx_receipts_sale_id ON public.receipts (sale_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles (user_id);

-- =====================================================================
-- RLS POLICIES
-- =====================================================================
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_roles_manage ON public.user_roles;
CREATE POLICY user_roles_manage ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS categories_write ON public.categories;
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS publishers_select ON public.publishers;
CREATE POLICY publishers_select ON public.publishers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS publishers_write ON public.publishers;
CREATE POLICY publishers_write ON public.publishers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS suppliers_staff ON public.suppliers;
CREATE POLICY suppliers_staff ON public.suppliers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS books_select ON public.books;
CREATE POLICY books_select ON public.books FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS books_write ON public.books;
CREATE POLICY books_write ON public.books FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS inventory_select ON public.inventory;
CREATE POLICY inventory_select ON public.inventory FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS inventory_write ON public.inventory;
CREATE POLICY inventory_write ON public.inventory FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sales_select ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR cashier_id = auth.uid());
DROP POLICY IF EXISTS sales_insert ON public.sales;
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = cashier_id AND public.is_staff(auth.uid()));
DROP POLICY IF EXISTS sales_update ON public.sales;
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS sale_items_select ON public.sale_items;
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS sale_items_insert ON public.sale_items;
CREATE POLICY sale_items_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = transactions.sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS receipts_select ON public.receipts;
CREATE POLICY receipts_select ON public.receipts FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = receipts.sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS receipts_insert ON public.receipts;
CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS receipts_update ON public.receipts;
CREATE POLICY receipts_update ON public.receipts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS cart_items_own ON public.cart_items;
CREATE POLICY cart_items_own ON public.cart_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
CREATE POLICY orders_insert_own ON public.orders FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS orders_update_staff ON public.orders;
CREATE POLICY orders_update_staff ON public.orders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS customers_staff ON public.customers;
CREATE POLICY customers_staff ON public.customers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS purchase_orders_staff ON public.purchase_orders;
CREATE POLICY purchase_orders_staff ON public.purchase_orders FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS purchase_order_items_staff ON public.purchase_order_items;
CREATE POLICY purchase_order_items_staff ON public.purchase_order_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =====================================================================
-- updated_at TRIGGERS (all 17 tables)
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','categories','publishers','suppliers','books','inventory',
                           'sales','sale_items','transactions','receipts','cart_items','orders','customers',
                           'purchase_orders','purchase_order_items','notifications']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
  END LOOP;
END $$;

-- =====================================================================
-- AUTH: new-user trigger (first account = owner, everyone after = customer)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'owner'::public.app_role ELSE 'customer'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- POS CHECKOUT (owner till)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.checkout_sale(
  _items jsonb, _customer_name text, _discount_type text, _discount_value numeric,
  _tax_rate numeric, _payments jsonb, _notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sale_id uuid := gen_random_uuid();
  _sale_number text; _receipt_number text;
  _subtotal numeric := 0; _discount_amount numeric := 0; _tax_amount numeric := 0;
  _total numeric := 0; _paid numeric := 0;
  _item jsonb; _pay jsonb; _qty integer; _price numeric; _stock integer;
  _book public.books%ROWTYPE; _seq bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT count(*) + 1 INTO _seq FROM public.sales;
  _sale_number := 'SL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(_seq::text, 4, '0');
  _receipt_number := 'RC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(_seq::text, 4, '0');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::int;
    IF _qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO _book FROM public.books WHERE id = (_item->>'book_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Book not found'; END IF;
    _price := _book.selling_price;
    SELECT quantity INTO _stock FROM public.inventory WHERE book_id = _book.id;
    IF _stock IS NULL OR _stock < _qty THEN
      RAISE EXCEPTION 'Insufficient stock for %', _book.title;
    END IF;
    _subtotal := _subtotal + (_price * _qty);
  END LOOP;

  IF _discount_type = 'percent' THEN
    _discount_amount := round(_subtotal * (COALESCE(_discount_value,0) / 100.0), 2);
  ELSE
    _discount_amount := LEAST(COALESCE(_discount_value,0), _subtotal);
  END IF;
  _tax_amount := round((_subtotal - _discount_amount) * (COALESCE(_tax_rate,0) / 100.0), 2);
  _total := round(_subtotal - _discount_amount + _tax_amount, 2);

  SELECT COALESCE(sum((value->>'amount')::numeric), 0) INTO _paid FROM jsonb_array_elements(_payments) AS value;
  IF _paid + 0.001 < _total THEN RAISE EXCEPTION 'Payment is less than total due'; END IF;

  INSERT INTO public.sales (id, sale_number, cashier_id, customer_name, subtotal, discount_type,
    discount_value, discount_amount, tax_rate, tax_amount, total, amount_paid, change_due, notes)
  VALUES (_sale_id, _sale_number, _uid, NULLIF(_customer_name,''), _subtotal, COALESCE(_discount_type,'amount'),
    COALESCE(_discount_value,0), _discount_amount, COALESCE(_tax_rate,0), _tax_amount, _total, _paid,
    GREATEST(_paid - _total, 0), NULLIF(_notes,''));

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::int;
    SELECT * INTO _book FROM public.books WHERE id = (_item->>'book_id')::uuid;
    INSERT INTO public.sale_items (sale_id, book_id, title, author, isbn, unit_price, quantity, line_total)
    VALUES (_sale_id, _book.id, _book.title, _book.author, _book.isbn, _book.selling_price, _qty,
      round(_book.selling_price * _qty, 2));

    UPDATE public.inventory SET quantity = quantity - _qty, updated_at = now() WHERE book_id = _book.id;
    UPDATE public.books SET status = 'out_of_stock', updated_at = now()
      WHERE id = _book.id AND status = 'active'
        AND (SELECT quantity FROM public.inventory WHERE book_id = _book.id) <= 0;
  END LOOP;

  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    IF (_pay->>'amount')::numeric > 0 THEN
      INSERT INTO public.transactions (sale_id, method, amount, reference)
      VALUES (_sale_id, (_pay->>'method')::public.payment_method, (_pay->>'amount')::numeric, NULLIF(_pay->>'reference',''));
    END IF;
  END LOOP;

  INSERT INTO public.receipts (sale_id, receipt_number, snapshot)
  VALUES (_sale_id, _receipt_number, jsonb_build_object('sale_number', _sale_number, 'total', _total));

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, entity_label, metadata)
  VALUES (_uid, 'Sale Completed', 'sale', _sale_id, _sale_number, jsonb_build_object('total', _total));

  RETURN jsonb_build_object('sale_id', _sale_id, 'sale_number', _sale_number, 'receipt_number', _receipt_number, 'total', _total);
END; $function$;

-- =====================================================================
-- STOREFRONT CHECKOUT (customer order)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.place_customer_order(
  _payment_method text, _shipping_address text, _contact_phone text,
  _tax_rate numeric DEFAULT 0, _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sale_id uuid := gen_random_uuid();
  _order_id uuid := gen_random_uuid();
  _sale_number text; _receipt_number text; _order_number text;
  _subtotal numeric := 0; _tax numeric := 0; _total numeric := 0;
  _row record; _seq bigint; _stock integer; _name text; _cnt int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO _cnt FROM public.cart_items WHERE user_id = _uid;
  IF _cnt = 0 THEN RAISE EXCEPTION 'Your cart is empty'; END IF;

  FOR _row IN
    SELECT c.quantity AS qty, b.* FROM public.cart_items c JOIN public.books b ON b.id = c.book_id
    WHERE c.user_id = _uid
  LOOP
    IF _row.qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT quantity INTO _stock FROM public.inventory WHERE book_id = _row.id;
    IF _stock IS NULL OR _stock < _row.qty THEN
      RAISE EXCEPTION 'Insufficient stock for %', _row.title;
    END IF;
    _subtotal := _subtotal + (_row.selling_price * _row.qty);
  END LOOP;

  _tax := round(_subtotal * (COALESCE(_tax_rate,0)/100.0), 2);
  _total := round(_subtotal + _tax, 2);

  SELECT count(*) + 1 INTO _seq FROM public.sales;
  _sale_number := 'SL-' || to_char(now(),'YYYYMMDD') || '-' || lpad(_seq::text,4,'0');
  _receipt_number := 'RC-' || to_char(now(),'YYYYMMDD') || '-' || lpad(_seq::text,4,'0');
  SELECT count(*) + 1 INTO _seq FROM public.orders;
  _order_number := 'OR-' || to_char(now(),'YYYYMMDD') || '-' || lpad(_seq::text,4,'0');

  SELECT COALESCE(full_name, email) INTO _name FROM public.profiles WHERE id = _uid;

  INSERT INTO public.sales (id, sale_number, cashier_id, customer_name, subtotal, discount_type,
    discount_value, discount_amount, tax_rate, tax_amount, total, amount_paid, change_due, notes)
  VALUES (_sale_id, _sale_number, _uid, COALESCE(_name,'Online customer'), _subtotal, 'amount',
    0, 0, COALESCE(_tax_rate,0), _tax, _total, _total, 0,
    'Online order ' || _order_number);

  FOR _row IN
    SELECT c.quantity AS qty, b.* FROM public.cart_items c JOIN public.books b ON b.id = c.book_id
    WHERE c.user_id = _uid
  LOOP
    INSERT INTO public.sale_items (sale_id, book_id, title, author, isbn, unit_price, quantity, line_total)
    VALUES (_sale_id, _row.id, _row.title, _row.author, _row.isbn, _row.selling_price, _row.qty,
      round(_row.selling_price * _row.qty, 2));

    UPDATE public.inventory SET quantity = quantity - _row.qty, updated_at = now() WHERE book_id = _row.id;
    UPDATE public.books SET status = 'out_of_stock', updated_at = now()
      WHERE id = _row.id AND status = 'active'
        AND (SELECT quantity FROM public.inventory WHERE book_id = _row.id) <= 0;
  END LOOP;

  INSERT INTO public.transactions (sale_id, method, amount, reference)
  VALUES (_sale_id, _payment_method::public.payment_method, _total, _order_number);

  INSERT INTO public.receipts (sale_id, receipt_number, snapshot)
  VALUES (_sale_id, _receipt_number, jsonb_build_object('sale_number', _sale_number, 'total', _total, 'order_number', _order_number));

  INSERT INTO public.orders (id, order_number, customer_id, sale_id, status, subtotal, tax_amount,
    total, payment_method, shipping_address, contact_phone, notes)
  VALUES (_order_id, _order_number, _uid, _sale_id, 'processing', _subtotal, _tax, _total,
    _payment_method::public.payment_method, NULLIF(_shipping_address,''), NULLIF(_contact_phone,''), NULLIF(_notes,''));

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, entity_label, metadata)
  VALUES (_uid, 'Online Order Placed', 'order', _order_id, _order_number, jsonb_build_object('total', _total));

  DELETE FROM public.cart_items WHERE user_id = _uid;

  RETURN jsonb_build_object('order_id', _order_id, 'order_number', _order_number,
    'sale_id', _sale_id, 'sale_number', _sale_number, 'receipt_number', _receipt_number, 'total', _total);
END; $function$;

-- =====================================================================
-- REALTIME (9 tables the app subscribes to)
-- =====================================================================
ALTER TABLE public.books REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.sale_items REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.receipts REPLICA IDENTITY FULL;
ALTER TABLE public.cart_items REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['books','inventory','audit_logs','sales','sale_items','transactions','receipts','cart_items','orders']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- =====================================================================
-- STORAGE: private "book-covers" bucket + policies
-- (If your project blocks SQL writes to storage.buckets, create the bucket
--  in the dashboard as PRIVATE and run only the policies below.)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers','book-covers', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS book_covers_select ON storage.objects;
CREATE POLICY book_covers_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'book-covers');
DROP POLICY IF EXISTS book_covers_insert ON storage.objects;
CREATE POLICY book_covers_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-covers');
DROP POLICY IF EXISTS book_covers_update ON storage.objects;
CREATE POLICY book_covers_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'book-covers') WITH CHECK (bucket_id = 'book-covers');
DROP POLICY IF EXISTS book_covers_delete ON storage.objects;
CREATE POLICY book_covers_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'book-covers');

-- =====================================================================
-- SEED REFERENCE DATA (identical to the current backend)
-- =====================================================================
INSERT INTO public.categories (name, description) VALUES
  ('Fiction','Novels and literary fiction'),
  ('Non-Fiction','Essays, biography and reference'),
  ('Children','Books for young readers'),
  ('Science & Technology','STEM titles'),
  ('Business','Management and economics')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.publishers (name, contact_email, website) VALUES
  ('Penguin Random House','contact@penguin.example','https://penguin.example'),
  ('HarperCollins','hello@harpercollins.example','https://harpercollins.example'),
  ('MIT Press','info@mitpress.example','https://mitpress.example')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.suppliers (name, contact_name, contact_email, phone) VALUES
  ('Global Book Distributors','Amina Yusuf','orders@gbd.example','+1-555-0110'),
  ('City Wholesale Books','Marco Diaz','sales@citywholesale.example','+1-555-0120')
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- POST-MIGRATION MANUAL STEPS (dashboard, not SQL):
--  1. Authentication > Providers > Email: enabled, "Confirm email" ON
--     (matches current behaviour).
--  2. Authentication > URL Configuration: Site URL + redirect URLs set to
--     your app origin — required for password reset / confirm links.
--  3. Storage: keep "book-covers" PRIVATE (the app uses signed URLs).
--  4. First account registered becomes Owner; every later one is Customer.
-- =====================================================================
