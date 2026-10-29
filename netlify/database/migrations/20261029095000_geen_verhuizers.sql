-- Geen verhuizers meer (besluit Maxim 29-10-2026, 09:49: "zijn al te goed").
UPDATE settings
SET value = jsonb_set(value, '{scout,categories}', COALESCE((SELECT jsonb_agg(c) FROM jsonb_array_elements(value->'scout'->'categories') c WHERE c <> '"verhuisbedrijf"'::jsonb), '[]'::jsonb), true), updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

-- Nog niet gemailde verhuis-leads overslaan; hun concepten die nog niet af zijn gaan niet meer naar de ontwerper.
UPDATE leads SET status = 'overgeslagen', reject_reason = 'branche uitgesloten (geen verhuizers)', updated_at = NOW()
WHERE sent_at IS NULL AND status IN ('kandidaat', 'nieuw', 'goedgekeurd') AND lower(coalesce(category, '')) = 'verhuisbedrijf';

UPDATE concepts SET status = 'overgeslagen', updated_at = NOW()
WHERE status IN ('wachtrij', 'ontwerp') AND lead_id IN (SELECT id FROM leads WHERE reject_reason = 'branche uitgesloten (geen verhuizers)');
