-- 50 concepten per nacht (besluit Maxim 28-10-2026): de scout moet daarvoor genoeg bedrijven per dag vinden.
-- Ongeveer 1 op 3 kandidaten heeft een bruikbaar algemeen adres, dus ±200 kandidaten per dag.
UPDATE settings
SET value = jsonb_set(value, '{scout,perDay}', '200'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout' AND COALESCE((value->'scout'->>'perDay')::int, 20) < 200;
