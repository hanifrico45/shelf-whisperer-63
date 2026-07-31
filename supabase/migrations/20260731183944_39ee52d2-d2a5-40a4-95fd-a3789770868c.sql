CREATE POLICY "book_covers_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'book-covers');
CREATE POLICY "book_covers_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-covers');
CREATE POLICY "book_covers_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'book-covers') WITH CHECK (bucket_id = 'book-covers');
CREATE POLICY "book_covers_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'book-covers');