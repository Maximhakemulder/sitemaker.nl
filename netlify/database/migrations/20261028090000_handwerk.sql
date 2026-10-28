-- Alleen nog vakmensen die met hun handen werken (besluit Maxim 28-10-2026). Kantoorberoepen eruit (die hebben hun
-- website meestal al op orde), meer vakbedrijven erbij. Nog niet gemailde leads uit die branches worden overgeslagen.
UPDATE settings
SET value = jsonb_set(
  value, '{scout,categories}',
  (SELECT COALESCE(jsonb_agg(c ORDER BY nr), '[]'::jsonb) FROM (
     SELECT c, MIN(nr) AS nr FROM (
       SELECT c, nr FROM jsonb_array_elements_text(COALESCE(value->'scout'->'categories', '[]'::jsonb)) WITH ORDINALITY AS x(c, nr)
         WHERE c !~* '(administratie|boekhoud|accountant|coach|psycholoog|therapeut|interieurontwerp|fotograaf|keukenzaak|advocaat|notaris|adviseur|consultant)'
       UNION ALL
       SELECT c, 1000 + nr FROM unnest(ARRAY['timmerman','aannemer','klusbedrijf','elektricien','metselaar','vloerenlegger','autobedrijf','slotenmaker']) WITH ORDINALITY AS y(c, nr)
     ) a GROUP BY c
  ) t),
  true),
  updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

UPDATE leads SET status = 'overgeslagen', reject_reason = 'branche uitgesloten (geen vakbedrijf)', updated_at = NOW()
WHERE sent_at IS NULL AND status IN ('kandidaat', 'nieuw', 'goedgekeurd')
  AND category ~* '(administratie|boekhoud|accountant|coach|psycholoog|therapeut|interieurontwerp|fotograaf|keukenzaak|advocaat|notaris|adviseur|consultant)';
