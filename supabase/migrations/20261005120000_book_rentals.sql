-- Book rental service. Existing books remain the single catalog source.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS rentable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_category text,
  ADD COLUMN IF NOT EXISTS rental_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS one_at_a_time boolean NOT NULL DEFAULT false;

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_rental_category_check;
ALTER TABLE public.books ADD CONSTRAINT books_rental_category_check
  CHECK (rental_category IS NULL OR rental_category IN ('A','B','C'));
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_rental_fee_check;
ALTER TABLE public.books ADD CONSTRAINT books_rental_fee_check CHECK (rental_fee IS NULL OR rental_fee > 0);

CREATE OR REPLACE FUNCTION public.book_rental_default_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_default_category text; old_default_fee numeric;
BEGIN
  IF TG_OP='UPDATE' AND NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
    IF NEW.selling_price NOT BETWEEN 3000 AND 12000 THEN
      NEW.rentable := false; NEW.rental_category := NULL; NEW.rental_fee := NULL;
    ELSIF NOT OLD.rentable THEN
      NEW.rental_category := NULL; NEW.rental_fee := NULL;
    ELSE
      old_default_category := CASE WHEN OLD.selling_price>=10000 AND OLD.selling_price<=12000 THEN 'A' WHEN OLD.selling_price>=6000 AND OLD.selling_price<10000 THEN 'B' WHEN OLD.selling_price>=3000 AND OLD.selling_price<6000 THEN 'C' ELSE NULL END;
      old_default_fee := CASE old_default_category WHEN 'A' THEN 1200 WHEN 'B' THEN 800 WHEN 'C' THEN 500 ELSE NULL END;
      IF OLD.rental_category=old_default_category AND OLD.rental_fee=old_default_fee THEN
        NEW.rental_category := NULL; NEW.rental_fee := NULL;
      END IF;
    END IF;
  END IF;
  IF NEW.rentable THEN
    IF NEW.rental_category IS NULL AND NEW.selling_price BETWEEN 3000 AND 12000 THEN
      IF NEW.selling_price >= 10000 THEN NEW.rental_category := 'A';
      ELSIF NEW.selling_price >= 6000 THEN NEW.rental_category := 'B';
      ELSE NEW.rental_category := 'C'; END IF;
    END IF;
    IF NEW.rental_fee IS NULL AND NEW.rental_category IS NOT NULL THEN
      NEW.rental_fee := CASE NEW.rental_category WHEN 'A' THEN 1200 WHEN 'B' THEN 800 ELSE 500 END;
    END IF;
    IF NEW.rental_category IS NULL OR NEW.rental_fee IS NULL THEN NEW.rentable := false; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER books_rental_default_price BEFORE INSERT OR UPDATE OF selling_price, rentable, rental_category, rental_fee ON public.books
FOR EACH ROW EXECUTE FUNCTION public.book_rental_default_price();

CREATE TABLE public.rental_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  membership_type text NOT NULL CHECK (membership_type IN ('single','family')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','suspended','closure_pending','closed')),
  fee numeric(12,2) NOT NULL CHECK (fee IN (3000,7000)),
  starts_at timestamptz,
  expires_at timestamptz,
  deposit_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_balance >= 0),
  deposit_required numeric(12,2) NOT NULL DEFAULT 5000 CHECK (deposit_required = 5000),
  suspended_until timestamptz,
  suspension_reason text,
  refund_amount numeric(12,2),
  refund_status text CHECK (refund_status IS NULL OR refund_status IN ('pending','refunded','applied_to_debt')),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_membership_fee_matches_type CHECK ((membership_type='single' AND fee=3000) OR (membership_type='family' AND fee=7000))
);
CREATE INDEX rental_memberships_user_status_idx ON public.rental_memberships(user_id,status);

CREATE TABLE public.rental_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  membership_id uuid REFERENCES public.rental_memberships(id) ON DELETE RESTRICT,
  rental_id uuid,
  payment_type text NOT NULL CHECK (payment_type IN ('membership','deposit','rental','renewal','late_fee','damage','replacement','deposit_refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','waived','refunded')),
  method text CHECK (method IS NULL OR method IN ('cash','card','transfer','manual')),
  reference text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_payments_user_idx ON public.rental_payments(user_id,created_at DESC);

CREATE TABLE public.rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.rental_memberships(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','returned','lost','damaged','cancelled')),
  rental_fee numeric(12,2) NOT NULL CHECK (rental_fee > 0),
  checked_out_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  renewed_at timestamptz,
  renewal_requested_at timestamptz,
  original_due_at timestamptz,
  renewal_payment_id uuid REFERENCES public.rental_payments(id) ON DELETE RESTRICT,
  issue_condition text CHECK (issue_condition IS NULL OR issue_condition IN ('good','fair','damaged')),
  issue_notes text,
  return_condition text CHECK (return_condition IS NULL OR return_condition IN ('good','fair','damaged','lost')),
  return_notes text,
  late_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (late_fee BETWEEN 0 AND 500),
  late_fee_paid boolean NOT NULL DEFAULT false,
  damage_charge numeric(12,2) NOT NULL DEFAULT 0 CHECK (damage_charge >= 0),
  replacement_charge numeric(12,2) NOT NULL DEFAULT 0 CHECK (replacement_charge >= 0),
  deposit_applied numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_applied >= 0),
  balance_owed numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_owed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rentals_user_status_idx ON public.rentals(user_id,status);
CREATE INDEX rentals_book_status_idx ON public.rentals(book_id,status);
ALTER TABLE public.rental_payments ADD CONSTRAINT rental_payments_rental_fk FOREIGN KEY (rental_id) REFERENCES public.rentals(id) ON DELETE RESTRICT;

CREATE TABLE public.rental_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','fulfilled','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,book_id,status)
);
CREATE TABLE public.rental_condition_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES public.rentals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  condition text NOT NULL CHECK (condition IN ('good','fair','damaged')),
  notes text NOT NULL CHECK (length(trim(notes)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rental_id,user_id)
);
CREATE UNIQUE INDEX one_open_membership_per_user_idx ON public.rental_memberships(user_id) WHERE status IN ('pending','active','suspended','closure_pending');

ALTER TABLE public.rental_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_condition_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.rental_memberships TO authenticated;
GRANT SELECT ON public.rental_payments TO authenticated;
GRANT SELECT ON public.rentals TO authenticated;
GRANT SELECT, UPDATE ON public.rental_reservations TO authenticated;
GRANT SELECT ON public.rental_condition_reports TO authenticated;
CREATE POLICY rental_memberships_read ON public.rental_memberships FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY rental_memberships_staff_update ON public.rental_memberships FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY rental_payments_read ON public.rental_payments FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY rental_payments_staff_write ON public.rental_payments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY rentals_read ON public.rentals FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY rentals_staff_write ON public.rentals FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY rental_reservations_read ON public.rental_reservations FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY rental_reservations_staff_update ON public.rental_reservations FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY rental_condition_reports_read ON public.rental_condition_reports FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY books_public_rental_catalog ON public.books FOR SELECT TO anon USING (status='active' AND rentable=true);

CREATE OR REPLACE FUNCTION public.get_rental_catalog()
RETURNS TABLE(id uuid,title text,author text,cover_url text,description text,selling_price numeric,rental_category text,rental_fee numeric,available boolean,due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT b.id,b.title,b.author,b.cover_url,b.description,b.selling_price,b.rental_category,b.rental_fee,
   (CASE WHEN b.one_at_a_time THEN (SELECT count(*) FROM public.rentals r WHERE r.book_id=b.id AND r.status IN ('requested','active'))=0
     ELSE COALESCE(i.quantity,0) > (SELECT count(*) FROM public.rentals r WHERE r.book_id=b.id AND r.status IN ('requested','active')) END),
   (SELECT min(r.due_at) FROM public.rentals r WHERE r.book_id=b.id AND r.status='active')
 FROM public.books b LEFT JOIN public.inventory i ON i.book_id=b.id
 WHERE b.status='active' AND b.rentable=true ORDER BY b.title;
$$;
GRANT EXECUTE ON FUNCTION public.get_rental_catalog() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.request_rental_membership(_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; fee numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join the Book Rental Service.'; END IF;
 IF _type IS NULL OR _type NOT IN ('single','family') THEN RAISE EXCEPTION 'Choose a valid membership package.'; END IF;
 UPDATE public.rental_memberships SET status='expired',updated_at=now() WHERE user_id=auth.uid() AND status='active' AND expires_at<=now();
 IF EXISTS (SELECT 1 FROM public.rental_memberships WHERE user_id=auth.uid() AND status IN ('pending','active','suspended','closure_pending')) THEN RAISE EXCEPTION 'You already have an open membership.'; END IF;
 fee:=CASE WHEN _type='single' THEN 3000 ELSE 7000 END;
 INSERT INTO public.rental_memberships(user_id,membership_type,fee) VALUES(auth.uid(),_type,fee) RETURNING id INTO new_id;
 INSERT INTO public.rental_payments(user_id,membership_id,payment_type,amount) VALUES(auth.uid(),new_id,'membership',fee),(auth.uid(),new_id,'deposit',5000);
 RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_rental_membership(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_deposit_replenishment(_membership_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE; due numeric; payment_id uuid;
BEGIN
 SELECT * INTO m FROM public.rental_memberships WHERE id=_membership_id AND user_id=auth.uid() AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active membership not found.'; END IF;
 due:=m.deposit_required-m.deposit_balance;
 IF due<=0 THEN RAISE EXCEPTION 'Your deposit is already fully funded.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rental_payments WHERE membership_id=m.id AND payment_type='deposit' AND status='pending') THEN RAISE EXCEPTION 'A deposit payment is already awaiting confirmation.'; END IF;
 INSERT INTO public.rental_payments(user_id,membership_id,payment_type,amount) VALUES(m.user_id,m.id,'deposit',due) RETURNING id INTO payment_id;
 RETURN payment_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_deposit_replenishment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_record_rental_payment(_payment_id uuid,_method text,_reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 IF _method IS NULL OR _method NOT IN ('cash','transfer','manual') THEN RAISE EXCEPTION 'Rental payments must be recorded as cash, transfer, or manual.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rental_payments p JOIN public.rentals r ON r.id=p.rental_id WHERE p.id=_payment_id AND p.payment_type='renewal' AND EXISTS(SELECT 1 FROM public.rental_reservations q WHERE q.book_id=r.book_id AND q.user_id<>r.user_id AND q.status='requested')) THEN RAISE EXCEPTION 'Another member has requested this book; renewal cannot be completed.'; END IF;
 UPDATE public.rental_payments SET status='paid',method=_method,reference=_reference,recorded_by=auth.uid(),paid_at=now()
 WHERE id=_payment_id AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending payment not found.'; END IF;
 UPDATE public.rentals r SET original_due_at=r.due_at,due_at=r.due_at+interval '7 days',renewed_at=now(),renewal_payment_id=_payment_id,renewal_requested_at=NULL
 WHERE r.id=(SELECT rental_id FROM public.rental_payments WHERE id=_payment_id AND payment_type='renewal') AND r.status='active' AND r.renewed_at IS NULL;
 UPDATE public.rentals r SET late_fee_paid=true WHERE r.id=(SELECT rental_id FROM public.rental_payments WHERE id=_payment_id AND payment_type='late_fee');
 UPDATE public.rentals r SET balance_owed=GREATEST(0,r.balance_owed-(SELECT amount FROM public.rental_payments WHERE id=_payment_id)) WHERE r.id=(SELECT rental_id FROM public.rental_payments WHERE id=_payment_id AND payment_type IN ('damage','replacement'));
 UPDATE public.rental_memberships m SET deposit_balance=LEAST(m.deposit_required,m.deposit_balance+(SELECT amount FROM public.rental_payments WHERE id=_payment_id)) WHERE m.id=(SELECT membership_id FROM public.rental_payments WHERE id=_payment_id AND payment_type='deposit' AND status='paid');
 UPDATE public.rental_memberships m SET refund_status='refunded',refunded_at=now() WHERE m.id=(SELECT membership_id FROM public.rental_payments WHERE id=_payment_id AND payment_type='deposit_refund' AND status='paid');
END; $$;
GRANT EXECUTE ON FUNCTION public.staff_record_rental_payment(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_activate_rental_membership(_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE;
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 SELECT * INTO m FROM public.rental_memberships WHERE id=_membership_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending membership not found.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.rental_payments WHERE membership_id=m.id AND status='paid' AND payment_type='membership')
    OR NOT EXISTS (SELECT 1 FROM public.rental_payments WHERE membership_id=m.id AND status='paid' AND payment_type='deposit' AND amount>=m.deposit_required) THEN
   RAISE EXCEPTION 'Record the membership fee and full security deposit before activation.';
 END IF;
 UPDATE public.rental_memberships SET status='active',starts_at=now(),expires_at=now()+interval '12 months',deposit_balance=5000,updated_at=now() WHERE id=m.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.staff_activate_rental_membership(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_set_rental_membership_status(_membership_id uuid,_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE;
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 IF _status IS NULL OR _status NOT IN ('active','suspended','expired') THEN RAISE EXCEPTION 'Choose a valid membership status.'; END IF;
 SELECT * INTO m FROM public.rental_memberships WHERE id=_membership_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Membership not found.'; END IF;
 IF _status='active' AND (
   m.status<>'suspended' OR m.expires_at IS NULL OR m.expires_at<=now() OR
   m.deposit_balance<m.deposit_required OR (m.suspended_until IS NOT NULL AND m.suspended_until>now())
 ) THEN RAISE EXCEPTION 'This membership cannot be restored; confirm it is unexpired, unsuspended, and has its full deposit.'; END IF;
 UPDATE public.rental_memberships
 SET status=_status,
     suspension_reason=CASE WHEN _status='suspended' THEN COALESCE(suspension_reason,'Suspended by staff') ELSE NULL END,
     suspended_until=CASE WHEN _status='active' THEN NULL ELSE suspended_until END,
     updated_at=now()
 WHERE id=m.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.staff_set_rental_membership_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_activate_book_rental(_rental_id uuid,_condition text DEFAULT 'good',_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rentals%ROWTYPE;
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 SELECT * INTO r FROM public.rentals WHERE id=_rental_id AND status='requested' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rental request not found.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rental_memberships WHERE id=r.membership_id AND user_id=r.user_id AND status='active' AND expires_at>now() AND deposit_balance>=deposit_required) THEN RAISE EXCEPTION 'Member eligibility or deposit is not valid.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rental_payments WHERE rental_id=r.id AND payment_type='rental' AND status='paid') THEN RAISE EXCEPTION 'Record the rental fee before checkout.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rentals WHERE user_id=r.user_id AND late_fee>0 AND NOT late_fee_paid) THEN RAISE EXCEPTION 'Customer has unresolved late fees.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rentals WHERE user_id=r.user_id AND balance_owed>0) THEN RAISE EXCEPTION 'Customer has outstanding damage or replacement charges.'; END IF;
 IF (SELECT count(*) FROM public.rentals WHERE book_id=r.book_id AND status IN ('requested','active')) > CASE WHEN (SELECT one_at_a_time FROM public.books WHERE id=r.book_id) THEN 1 ELSE COALESCE((SELECT quantity FROM public.inventory WHERE book_id=r.book_id),0) END THEN RAISE EXCEPTION 'There are no available copies of this book.'; END IF;
 IF _condition NOT IN ('good','fair','damaged') THEN RAISE EXCEPTION 'Invalid issue condition.'; END IF;
 UPDATE public.rentals SET status='active',checked_out_at=now(),due_at=now()+interval '14 days',issue_condition=_condition,issue_notes=_notes,updated_at=now() WHERE id=r.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.staff_activate_book_rental(uuid,text,text) TO authenticated;

-- The borrower never supplies a price. Staff marks manual payments as paid and
-- activates a rental after recording the fee; this RPC is atomic and enforces eligibility.
CREATE OR REPLACE FUNCTION public.request_book_rental(_book_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE; b public.books%ROWTYPE; new_id uuid; active_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to rent a book.'; END IF;
  SELECT * INTO m FROM public.rental_memberships WHERE user_id=auth.uid() AND status='active' AND expires_at>now() ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join or renew the Book Rental Service first.'; END IF;
  IF m.suspended_until IS NOT NULL AND m.suspended_until>now() THEN RAISE EXCEPTION 'Borrowing is temporarily suspended.'; END IF;
  IF m.deposit_balance<m.deposit_required THEN RAISE EXCEPTION 'Restore your ₦5,000 security deposit before borrowing.'; END IF;
  IF EXISTS (SELECT 1 FROM public.rentals WHERE user_id=auth.uid() AND late_fee>0 AND NOT late_fee_paid) THEN RAISE EXCEPTION 'Settle the outstanding late fee before borrowing again.'; END IF;
  IF EXISTS (SELECT 1 FROM public.rentals WHERE user_id=auth.uid() AND balance_owed>0) THEN RAISE EXCEPTION 'Settle outstanding damage or replacement charges before borrowing again.'; END IF;
  SELECT count(*) INTO active_count FROM public.rentals WHERE user_id=auth.uid() AND status IN ('requested','active');
  IF active_count>=2 THEN RAISE EXCEPTION 'Return a book before borrowing another. The limit is 2.'; END IF;
  SELECT * INTO b FROM public.books WHERE id=_book_id AND status='active' AND rentable=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This book is not available for rental.'; END IF;
  IF (SELECT count(*) FROM public.rentals WHERE book_id=_book_id AND status IN ('requested','active')) >= CASE WHEN b.one_at_a_time THEN 1 ELSE COALESCE((SELECT quantity FROM public.inventory WHERE book_id=b.id),0) END THEN RAISE EXCEPTION 'This book is currently unavailable.'; END IF;
  INSERT INTO public.rentals(user_id,membership_id,book_id,rental_fee,status) VALUES(auth.uid(),m.id,b.id,b.rental_fee,'requested') RETURNING id INTO new_id;
  INSERT INTO public.rental_payments(user_id,membership_id,rental_id,payment_type,amount) VALUES(auth.uid(),m.id,new_id,'rental',b.rental_fee);
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_book_rental(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_rental_return(_rental_id uuid,_condition text,_notes text DEFAULT NULL,_replacement_amount numeric DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rentals%ROWTYPE; fee numeric; applied numeric;
BEGIN
 IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff access required.'; END IF;
 SELECT * INTO r FROM public.rentals WHERE id=_rental_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active rental not found.'; END IF;
 IF _condition NOT IN ('good','fair','damaged','lost') THEN RAISE EXCEPTION 'Invalid return condition.'; END IF;
 IF COALESCE(_replacement_amount,0)<0 THEN RAISE EXCEPTION 'Replacement amount cannot be negative.'; END IF;
 fee := CASE WHEN now()::date > r.due_at::date THEN LEAST(500,(now()::date-r.due_at::date)*100) ELSE 0 END;
 applied := LEAST((CASE WHEN _condition IN ('damaged','lost') THEN COALESCE(_replacement_amount,0) ELSE 0 END), (SELECT deposit_balance FROM public.rental_memberships WHERE id=r.membership_id));
 UPDATE public.rental_memberships SET deposit_balance=deposit_balance-applied WHERE id=r.membership_id;
 UPDATE public.rentals SET status=CASE WHEN _condition='lost' THEN 'lost' WHEN _condition='damaged' AND COALESCE(_replacement_amount,0)>0 THEN 'damaged' ELSE 'returned' END,returned_at=now(),return_condition=_condition,return_notes=_notes,
 late_fee=fee,damage_charge=CASE WHEN _condition='damaged' THEN COALESCE(_replacement_amount,0) ELSE 0 END,
 replacement_charge=CASE WHEN _condition='lost' THEN COALESCE(_replacement_amount,0) ELSE 0 END,deposit_applied=applied,
 balance_owed=GREATEST(0,COALESCE(_replacement_amount,0)-applied),updated_at=now() WHERE id=_rental_id;
 IF _condition='lost' OR (_condition='damaged' AND COALESCE(_replacement_amount,0)>0) THEN UPDATE public.inventory SET quantity=GREATEST(quantity-1,0),updated_at=now() WHERE book_id=r.book_id; END IF;
 IF fee>0 THEN INSERT INTO public.rental_payments(user_id,membership_id,rental_id,payment_type,amount) VALUES(r.user_id,r.membership_id,r.id,'late_fee',fee); END IF;
 IF _replacement_amount>applied THEN INSERT INTO public.rental_payments(user_id,membership_id,rental_id,payment_type,amount) VALUES(r.user_id,r.membership_id,r.id,CASE WHEN _condition='lost' THEN 'replacement' ELSE 'damage' END,_replacement_amount-applied); END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.process_rental_return(uuid,text,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.renew_book_rental(_rental_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rentals%ROWTYPE; fee numeric;
BEGIN
 SELECT * INTO r FROM public.rentals WHERE id=_rental_id AND user_id=auth.uid() AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active rental not found.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rental_memberships m WHERE m.id=r.membership_id AND m.status='active' AND m.expires_at>now() AND m.deposit_balance>=m.deposit_required AND (m.suspended_until IS NULL OR m.suspended_until<=now())) THEN RAISE EXCEPTION 'An active membership and full security deposit are required to renew.'; END IF;
 IF r.renewed_at IS NOT NULL OR r.renewal_requested_at IS NOT NULL THEN RAISE EXCEPTION 'This rental has already been renewed or has a renewal request pending.'; END IF;
 IF r.due_at<now() THEN RAISE EXCEPTION 'Renew before the due date.'; END IF;
 IF EXISTS (SELECT 1 FROM public.rental_reservations WHERE book_id=r.book_id AND user_id<>auth.uid() AND status='requested') THEN RAISE EXCEPTION 'Another member has requested this book.'; END IF;
 SELECT rental_fee INTO fee FROM public.books WHERE id=r.book_id;
 UPDATE public.rentals SET renewal_requested_at=now() WHERE id=r.id;
 INSERT INTO public.rental_payments(user_id,membership_id,rental_id,payment_type,amount) VALUES(r.user_id,r.membership_id,r.id,'renewal',fee);
END; $$;
GRANT EXECUTE ON FUNCTION public.renew_book_rental(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_rental_membership_closure(_membership_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE; refund numeric;
BEGIN
 SELECT * INTO m FROM public.rental_memberships WHERE id=_membership_id AND user_id=auth.uid() AND status IN ('active','expired','suspended') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open membership not found.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rentals WHERE membership_id=m.id AND status IN ('requested','active')) THEN RAISE EXCEPTION 'Return all borrowed books and resolve rental requests before closing membership.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rental_payments WHERE membership_id=m.id AND payment_type NOT IN ('membership','deposit','deposit_refund') AND status='pending') THEN RAISE EXCEPTION 'Settle all rental, late, damage, and replacement charges before closing membership.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rentals WHERE membership_id=m.id AND balance_owed>0) THEN RAISE EXCEPTION 'Settle all damage or replacement balances before closing membership.'; END IF;
 refund:=m.deposit_balance;
 UPDATE public.rental_memberships SET status='closed',refund_amount=refund,refund_status=CASE WHEN refund>0 THEN 'pending' ELSE 'refunded' END,refunded_at=CASE WHEN refund=0 THEN now() ELSE NULL END,deposit_balance=0,updated_at=now() WHERE id=m.id;
 IF refund>0 THEN INSERT INTO public.rental_payments(user_id,membership_id,payment_type,amount,status) VALUES(m.user_id,m.id,'deposit_refund',refund,'pending'); END IF;
 RETURN refund;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_rental_membership_closure(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_book_reservation(_book_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.rental_memberships%ROWTYPE; new_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to request a reservation.'; END IF;
 SELECT * INTO m FROM public.rental_memberships WHERE user_id=auth.uid() AND status='active' AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'An active membership is required to reserve a book.'; END IF;
 IF m.deposit_balance<m.deposit_required OR (m.suspended_until IS NOT NULL AND m.suspended_until>now()) THEN RAISE EXCEPTION 'Your deposit must be restored and borrowing privileges active to reserve.'; END IF;
 IF EXISTS(SELECT 1 FROM public.rentals WHERE user_id=auth.uid() AND late_fee>0 AND NOT late_fee_paid) THEN RAISE EXCEPTION 'Settle outstanding late fees before reserving.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rentals WHERE book_id=_book_id AND status='active') THEN RAISE EXCEPTION 'This book is currently available.'; END IF;
 INSERT INTO public.rental_reservations(user_id,book_id) VALUES(auth.uid(),_book_id) RETURNING id INTO new_id;
 RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_book_reservation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_rental_condition(_rental_id uuid,_condition text,_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to report a book condition.'; END IF;
 IF _condition NOT IN ('good','fair','damaged') THEN RAISE EXCEPTION 'Choose good, fair, or damaged.'; END IF;
 IF _notes IS NULL OR length(trim(_notes)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Enter a short condition note (up to 1,000 characters).'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rentals WHERE id=_rental_id AND user_id=auth.uid() AND status IN ('requested','active')) THEN RAISE EXCEPTION 'This rental cannot accept a condition report.'; END IF;
 INSERT INTO public.rental_condition_reports(rental_id,user_id,condition,notes) VALUES(_rental_id,auth.uid(),_condition,trim(_notes)) RETURNING id INTO new_id;
 RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.report_rental_condition(uuid,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
