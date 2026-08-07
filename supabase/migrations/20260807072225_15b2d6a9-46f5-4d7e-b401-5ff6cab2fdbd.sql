INSERT INTO public.categories (name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Parenting','Books on raising children and family life'),
  ('Boys','Titles aimed at boys'),
  ('Girls','Titles aimed at girls'),
  ('Financial','Money, business and personal finance'),
  ('Islamic','Islamic studies and literature'),
  ('Self-development','Personal growth and productivity'),
  ('Journals','Notebooks, planners and journals')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE lower(c.name) = lower(v.name)
);