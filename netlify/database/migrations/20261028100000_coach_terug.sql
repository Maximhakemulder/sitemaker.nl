-- Coach en psycholoog terug (besluit Maxim 28-10-2026: daar valt veel te halen), transport erbij.
-- Hun leads die net werden overgeslagen, gaan terug naar "nieuw".
UPDATE settings
SET value = jsonb_set(
  value, '{scout,categories}',
  (SELECT COALESCE(jsonb_agg(c ORDER BY nr), '[]'::jsonb) FROM (
     SELECT c, MIN(nr) AS nr FROM (
       SELECT c, nr FROM jsonb_array_elements_text(COALESCE(value->'scout'->'categories', '[]'::jsonb)) WITH ORDINALITY AS x(c, nr)
       UNION ALL
       SELECT c, 1000 + nr FROM unnest(ARRAY['coach','psycholoog','transportbedrijf','koeltransport']) WITH ORDINALITY AS y(c, nr)
     ) a GROUP BY c
  ) t),
  true),
  updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

UPDATE leads SET status = CASE WHEN email IS NULL OR email = '' THEN 'kandidaat' ELSE 'nieuw' END, reject_reason = '', updated_at = NOW()
WHERE status = 'overgeslagen' AND reject_reason = 'branche uitgesloten (geen vakbedrijf)' AND category ~* '(coach|psycholoog)';
