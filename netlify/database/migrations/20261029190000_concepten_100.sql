-- Besluit Maxim 29-10-2026 (avond): elke ochtend om 06:00 100 concepten klaar. Daglimiet ruim daarboven.
UPDATE settings
SET value = jsonb_set(value, '{concepten,perDag}', '120'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND COALESCE((value->'concepten'->>'perDag')::int, 20) < 120;
