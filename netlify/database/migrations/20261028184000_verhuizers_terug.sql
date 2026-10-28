-- Verhuizers mogen toch (besluit Maxim 28-10-2026, 18:23).
UPDATE settings
SET value = jsonb_set(value, '{scout,categories}', COALESCE(value->'scout'->'categories', '[]'::jsonb) || '["verhuisbedrijf"]'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout' AND NOT (COALESCE(value->'scout'->'categories', '[]'::jsonb) ? 'verhuisbedrijf');

-- Verhuis-leads die net zijn overgeslagen weer meenemen (opnieuw onderzoeken).
UPDATE leads SET status = 'kandidaat', reject_reason = '', updated_at = NOW()
WHERE status = 'overgeslagen' AND sent_at IS NULL AND lower(coalesce(category, '')) = 'verhuisbedrijf'
  AND reject_reason = 'branche uitgesloten (alleen bouw en installatie)';
