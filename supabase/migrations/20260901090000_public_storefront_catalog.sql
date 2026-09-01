-- Let storefront visitors browse the catalog before creating an account.
-- This grants read-only access only; cart persistence, checkout, and staff writes
-- continue to require an authenticated user and their existing RLS policies.

GRANT SELECT ON public.books, public.categories, public.inventory TO anon;

DROP POLICY IF EXISTS books_public_storefront_select ON public.books;
CREATE POLICY books_public_storefront_select
  ON public.books
  FOR SELECT
  TO anon
  USING (status = 'active');

DROP POLICY IF EXISTS categories_public_storefront_select ON public.categories;
CREATE POLICY categories_public_storefront_select
  ON public.categories
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS inventory_public_storefront_select ON public.inventory;
CREATE POLICY inventory_public_storefront_select
  ON public.inventory
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.books
      WHERE books.id = inventory.book_id
        AND books.status = 'active'
    )
  );
