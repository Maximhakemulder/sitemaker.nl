-- Besluit Maxim 30-10-2026: €99,95 startkosten in plaats van €299,95 bouwprijs.
-- Nieuwe klanten krijgen 9995 als standaard; klanten die nog niet betaald hebben (nog niet gestart) gaan mee naar de nieuwe prijs.
ALTER TABLE customers ALTER COLUMN build_cents SET DEFAULT 9995;
UPDATE customers SET build_cents = 9995 WHERE build_cents = 29995 AND started_at IS NULL;
