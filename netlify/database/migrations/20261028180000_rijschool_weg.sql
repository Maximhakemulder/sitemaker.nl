-- Geen rijscholen meer (besluit Maxim 28-10-2026): branche uit de zoekopdrachten, nog niet gemailde rijschool-leads overgeslagen.
UPDATE settings
SET value = jsonb_set(
  value, '{scout,categories}',
  (SELECT COALESCE(jsonb_agg(c ORDER BY nr), '[]'::jsonb)
     FROM jsonb_array_elements_text(COALESCE(value->'scout'->'categories', '[]'::jsonb)) WITH ORDINALITY AS x(c, nr)
     WHERE c !~* '(rijschool|rijles|autorijschool)'),
  true),
  updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

UPDATE leads SET status = 'overgeslagen', reject_reason = 'branche uitgesloten (rijschool)', updated_at = NOW()
WHERE sent_at IS NULL AND status IN ('kandidaat', 'nieuw', 'goedgekeurd')
  AND (category ~* '(rijschool|rijles)' OR company ~* '(rijschool|rijles|autorijschool)');
