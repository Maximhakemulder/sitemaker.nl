-- Besluit Maxim 02-11-2026 (later die avond): €59,95 per maand (eerst €49,95 gepland, nooit gebruikt).
ALTER TABLE customers ALTER COLUMN monthly_cents SET DEFAULT 5995;
UPDATE customers SET monthly_cents = 5995 WHERE monthly_cents IN (6995, 4995) AND started_at IS NULL;
