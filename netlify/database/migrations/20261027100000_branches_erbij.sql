-- Nieuwe branches voor de zoeker (besluit Maxim 27-10-2026): ondernemers die achter een bureau zitten en hun mail lezen.
-- Maxim typte ze als zinnen in HQ; de zoeker gebruikt elke regel letterlijk als zoekopdracht. Die zinnen (alles met
-- een komma, "en" of haakjes) worden vervangen door losse zoekwoorden. Bestaande gewone branches blijven staan.
UPDATE settings
SET value = jsonb_set(
  value, '{scout,categories}',
  (SELECT COALESCE(jsonb_agg(c ORDER BY nr), '[]'::jsonb) FROM (
     SELECT c, MIN(nr) AS nr FROM (
       SELECT c, nr FROM jsonb_array_elements_text(COALESCE(value->'scout'->'categories', '[]'::jsonb)) WITH ORDINALITY AS x(c, nr)
         WHERE c !~ '[,()]' AND c !~* '\s(en)\s'
       UNION ALL
       SELECT c, 1000 + nr FROM unnest(ARRAY['administratiekantoor','boekhoudkantoor','coach','psycholoog','therapeut','rijschool','hondentrainer','trimsalon','fotograaf','schoonmaakbedrijf','verhuisbedrijf','keukenzaak','interieurontwerper']) WITH ORDINALITY AS y(c, nr)
     ) a GROUP BY c
  ) t),
  true),
  updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';
