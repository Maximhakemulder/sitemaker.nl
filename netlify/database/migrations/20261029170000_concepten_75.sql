-- Besluit Maxim 29-10-2026: elke ochtend om 06:00 75 concepten klaar. Daglimiet ruim daarboven (overgeslagen sites tellen niet mee).
UPDATE settings
SET value = jsonb_set(value, '{concepten,perDag}', '90'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND COALESCE((value->'concepten'->>'perDag')::int, 20) < 90;
