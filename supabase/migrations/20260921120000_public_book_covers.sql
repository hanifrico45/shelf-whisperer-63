-- Let shop visitors see book cover images without signing in.
-- Uploads stay limited to authenticated staff.

INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS book_covers_public_select ON storage.objects;
CREATE POLICY book_covers_public_select
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'book-covers');
