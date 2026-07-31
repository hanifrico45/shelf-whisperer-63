-- enums
CREATE TYPE public.app_role AS ENUM ('owner','manager','cashier','inventory_staff');
CREATE TYPE public.book_status AS ENUM ('active','archived','out_of_stock','discontinued');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'inventory_staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
CREATE TRIGGER trg_user_roles_updated BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- new user handler: profile + default role (first user becomes owner)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'owner'::public.app_role ELSE 'inventory_staff'::public.app_role end)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_all" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- publishers
CREATE TABLE public.publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  phone TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishers TO authenticated;
GRANT ALL ON public.publishers TO service_role;
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publishers_all" ON public.publishers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_publishers_updated BEFORE UPDATE ON public.publishers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_all" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- books
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT UNIQUE,
  barcode TEXT,
  cover_url TEXT,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  publisher_id UUID REFERENCES public.publishers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.book_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_title ON public.books(title);
CREATE INDEX idx_books_author ON public.books(author);
CREATE INDEX idx_books_status ON public.books(status);
CREATE INDEX idx_books_category ON public.books(category_id);
CREATE INDEX idx_books_publisher ON public.books(publisher_id);
CREATE INDEX idx_books_supplier ON public.books(supplier_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books_all" ON public.books FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_books_updated BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- inventory
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL UNIQUE REFERENCES public.books(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  minimum_stock_level INTEGER NOT NULL DEFAULT 5,
  shelf_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_book ON public.inventory(book_id);
CREATE INDEX idx_inventory_quantity ON public.inventory(quantity);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_all" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'book',
  entity_id UUID,
  entity_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- realtime
ALTER TABLE public.books REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.books;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- seed reference data
INSERT INTO public.categories (name, description) VALUES
 ('Fiction','Novels and literary fiction'),
 ('Non-Fiction','Essays, biography and reference'),
 ('Science & Technology','STEM titles'),
 ('Children','Books for young readers'),
 ('Business','Management and economics');
INSERT INTO public.publishers (name, contact_email, website) VALUES
 ('Penguin Random House','contact@penguin.example','https://penguin.example'),
 ('HarperCollins','hello@harpercollins.example','https://harpercollins.example'),
 ('MIT Press','info@mitpress.example','https://mitpress.example');
INSERT INTO public.suppliers (name, contact_name, contact_email, phone) VALUES
 ('Global Book Distributors','Amina Yusuf','orders@gbd.example','+1-555-0110'),
 ('City Wholesale Books','Marco Diaz','sales@citywholesale.example','+1-555-0120');