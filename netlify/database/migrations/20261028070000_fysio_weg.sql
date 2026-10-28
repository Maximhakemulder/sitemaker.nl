-- Fysiotherapeuten hebben meestal al een goede website (besluit Maxim 28-10-2026): branche eruit, vervangen door
-- vakbedrijven (zoals onze eerste klanten: schilder, installateur). Nog niet gemailde fysio-leads worden overgeslagen.
UPDATE settings
SET value = jsonb_set(
  value, '{scout,categories}',
  (SELECT COALESCE(jsonb_agg(c ORDER BY nr), '[]'::jsonb) FROM (
     SELECT c, MIN(nr) AS nr FROM (
       SELECT c, nr FROM jsonb_array_elements_text(COALESCE(value->'scout'->'categories', '[]'::jsonb)) WITH ORDINALITY AS x(c, nr)
         WHERE c !~* '(fysio|physio|oefenthera|manuele thera)'
       UNION ALL
       SELECT c, 1000 + nr FROM unnest(ARRAY['stukadoor','tegelzetter','dakdekker','loodgieter','glazenwasser','bestratingsbedrijf']) WITH ORDINALITY AS y(c, nr)
     ) a GROUP BY c
  ) t),
  true),
  updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

UPDATE leads SET status = 'overgeslagen', reject_reason = 'branche uitgesloten (fysiotherapie)', updated_at = NOW()
WHERE sent_at IS NULL AND status IN ('kandidaat', 'nieuw', 'goedgekeurd')
  AND (category ~* '(fysio|physio|oefenthera|manuele thera)' OR company ~* '(fysio|physio|oefenthera)');
