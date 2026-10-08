-- Add customer requested fulfillment details to the existing rental records.
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS preferred_date date,
  ADD COLUMN IF NOT EXISTS fulfillment_method text,
  ADD COLUMN IF NOT EXISTS fulfillment_location text;

ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_fulfillment_method_check,
  ADD CONSTRAINT rentals_fulfillment_method_check
    CHECK (fulfillment_method IS NULL OR fulfillment_method IN ('pickup', 'delivery'));

ALTER TABLE public.rentals
  DROP CONSTRAINT IF EXISTS rentals_fulfillment_location_check,
  ADD CONSTRAINT rentals_fulfillment_location_check
    CHECK (fulfillment_location IS NULL OR length(trim(fulfillment_location)) BETWEEN 1 AND 300);

-- All new customer requests must use the scheduled flow. The older RPC remains
-- in the first migration for upgrade compatibility, but cannot bypass these fields.
REVOKE ALL ON FUNCTION public.request_book_rental(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_book_rental(
  _book_id uuid,
  _pickup_date date,
  _fulfillment_method text,
  _fulfillment_location text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.rental_memberships%ROWTYPE;
  b public.books%ROWTYPE;
  new_id uuid;
  active_count int;
  clean_location text := trim(COALESCE(_fulfillment_location, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to rent a book.';
  END IF;
  IF _pickup_date IS NULL OR _pickup_date < current_date THEN
    RAISE EXCEPTION 'Choose today or a future pickup or delivery date.';
  END IF;
  IF _fulfillment_method IS NULL OR _fulfillment_method NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Choose pickup or delivery.';
  END IF;
  IF length(clean_location) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Enter a valid pickup or delivery location.';
  END IF;

  SELECT * INTO m
  FROM public.rental_memberships
  WHERE user_id = auth.uid()
    AND status = 'active'
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join or renew the Book Rental Service first.';
  END IF;
  IF m.suspended_until IS NOT NULL AND m.suspended_until > now() THEN
    RAISE EXCEPTION 'Borrowing is temporarily suspended.';
  END IF;
  IF m.deposit_balance < m.deposit_required THEN
    RAISE EXCEPTION 'Restore your ₦5,000 security deposit before borrowing.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rentals
    WHERE user_id = auth.uid() AND late_fee > 0 AND NOT late_fee_paid
  ) THEN
    RAISE EXCEPTION 'Settle the outstanding late fee before borrowing again.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rentals
    WHERE user_id = auth.uid() AND balance_owed > 0
  ) THEN
    RAISE EXCEPTION 'Settle outstanding damage or replacement charges before borrowing again.';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.rentals
  WHERE user_id = auth.uid() AND status IN ('requested', 'active');
  IF active_count >= 2 THEN
    RAISE EXCEPTION 'Return a book before borrowing another. The limit is 2.';
  END IF;

  SELECT * INTO b
  FROM public.books
  WHERE id = _book_id AND status = 'active' AND rentable = true
  FOR UPDATE;
  IF NOT FOUND OR b.rental_fee IS NULL OR b.rental_category IS NULL THEN
    RAISE EXCEPTION 'This book is not available for rental.';
  END IF;
  IF (
    SELECT count(*) FROM public.rentals
    WHERE book_id = _book_id AND status IN ('requested', 'active')
  ) >= CASE
    WHEN b.one_at_a_time THEN 1
    ELSE COALESCE((SELECT quantity FROM public.inventory WHERE book_id = b.id), 0)
  END THEN
    RAISE EXCEPTION 'This book is currently unavailable.';
  END IF;

  INSERT INTO public.rentals(
    user_id, membership_id, book_id, rental_fee, status,
    preferred_date, fulfillment_method, fulfillment_location
  ) VALUES (
    auth.uid(), m.id, b.id, b.rental_fee, 'requested',
    _pickup_date, _fulfillment_method, clean_location
  ) RETURNING id INTO new_id;

  INSERT INTO public.rental_payments(user_id, membership_id, rental_id, payment_type, amount)
  VALUES (auth.uid(), m.id, new_id, 'rental', b.rental_fee);
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_book_rental(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_book_rental(uuid, date, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
