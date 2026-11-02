-- Besluit Maxim 02-11-2026: €49,95 per maand (was €69,95).
-- Nieuwe klanten krijgen 4995 als standaard; klanten die nog niet gestart zijn gaan mee. Lopende abonnementen blijven op hun eigen bedrag tot Maxim ze aanpast.
ALTER TABLE customers ALTER COLUMN monthly_cents SET DEFAULT 4995;
UPDATE customers SET monthly_cents = 4995 WHERE monthly_cents = 6995 AND started_at IS NULL;
