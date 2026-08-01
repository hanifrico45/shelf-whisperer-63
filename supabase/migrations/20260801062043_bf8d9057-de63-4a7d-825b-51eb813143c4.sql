CREATE TYPE public.payment_method AS ENUM ('cash','card','transfer');
CREATE TYPE public.sale_status AS ENUM ('completed','refunded','void');

CREATE TABLE public.sales (
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

CREATE TABLE public.sale_items (
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

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  receipt_number text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  print_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_book_id ON public.sale_items(book_id);
CREATE INDEX idx_transactions_sale_id ON public.transactions(sale_id);
CREATE INDEX idx_receipts_sale_id ON public.receipts(sale_id);

GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipts TO authenticated;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.sale_items TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.receipts TO service_role;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = cashier_id);
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY sale_items_select ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY sale_items_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY receipts_select ON public.receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY receipts_insert ON public.receipts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY receipts_update ON public.receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sale_items_updated_at BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.checkout_sale(
  _items jsonb,
  _customer_name text,
  _discount_type text,
  _discount_value numeric,
  _tax_rate numeric,
  _payments jsonb,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale_id uuid := gen_random_uuid();
  _sale_number text;
  _receipt_number text;
  _subtotal numeric := 0;
  _discount_amount numeric := 0;
  _tax_amount numeric := 0;
  _total numeric := 0;
  _paid numeric := 0;
  _item jsonb;
  _pay jsonb;
  _qty integer;
  _price numeric;
  _stock integer;
  _book public.books%ROWTYPE;
  _seq bigint;
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
END; $$;

REVOKE ALL ON FUNCTION public.checkout_sale(jsonb, text, text, numeric, numeric, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.checkout_sale(jsonb, text, text, numeric, numeric, jsonb, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;