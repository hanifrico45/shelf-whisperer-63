-- 2026-08-14: Insert storefront categories if missing (non-destructive)
INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Parenting'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Parenting');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Boys'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Boys');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Girls'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Girls');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Financial'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Financial');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Islamic'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Islamic');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Self-development'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Self-development');

INSERT INTO public.categories (id, name)
SELECT gen_random_uuid(), 'Journals'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name = 'Journals');
