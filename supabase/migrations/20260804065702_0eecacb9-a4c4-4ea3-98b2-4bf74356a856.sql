
-- Staff helper (owner + existing staff roles)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner'::public.app_role,'manager'::public.app_role,'cashier'::public.app_role,'inventory_staff'::public.app_role)
  );
$$;

-- New signups default to customer; first account stays owner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ---------------- cart_items ----------------
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_items_own ON public.cart_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_cart_items_updated BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- orders ----------------
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
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY orders_insert_own ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY orders_update_staff ON public.orders FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- storefront checkout ----------------
CREATE OR REPLACE FUNCTION public.place_customer_order(
  _payment_method text,
  _shipping_address text,
  _contact_phone text,
  _tax_rate numeric DEFAULT 0,
  _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

-- ---------------- tighten access for customers ----------------
DROP POLICY IF EXISTS books_all ON public.books;
CREATE POLICY books_select ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY books_write ON public.books FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS inventory_all ON public.inventory;
CREATE POLICY inventory_select ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_write ON public.inventory FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS categories_all ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS publishers_all ON public.publishers;
CREATE POLICY publishers_select ON public.publishers FOR SELECT TO authenticated USING (true);
CREATE POLICY publishers_write ON public.publishers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS suppliers_all ON public.suppliers;
CREATE POLICY suppliers_staff ON public.suppliers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS customers_all ON public.customers;
CREATE POLICY customers_staff ON public.customers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS purchase_orders_all ON public.purchase_orders;
CREATE POLICY purchase_orders_staff ON public.purchase_orders FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS purchase_order_items_all ON public.purchase_order_items;
CREATE POLICY purchase_order_items_staff ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS sales_select ON public.sales;
CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR cashier_id = auth.uid());
DROP POLICY IF EXISTS sales_update ON public.sales;
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS sales_insert ON public.sales;
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cashier_id AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS sale_items_select ON public.sale_items;
CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS sale_items_insert ON public.sale_items;
CREATE POLICY sale_items_insert ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS transactions_select ON public.transactions;
CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS receipts_select ON public.receipts;
CREATE POLICY receipts_select ON public.receipts FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));
DROP POLICY IF EXISTS receipts_insert ON public.receipts;
CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS receipts_update ON public.receipts;
CREATE POLICY receipts_update ON public.receipts FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
