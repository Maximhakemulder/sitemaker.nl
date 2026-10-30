-- Besluit Maxim 30-10-2026: overdag bijmaken zolang er minder dan 100 goedgekeurde + te beoordelen concepten klaarstaan.
-- Daglimiet voor nieuwe concepten ruim omhoog, zodat de dagrondes niet vastlopen; de scout-bewaking zoekt mee tot dit getal.
UPDATE settings
SET value = jsonb_set(value, '{concepten,perDag}', '250'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND COALESCE((value->'concepten'->>'perDag')::int, 20) < 250;
