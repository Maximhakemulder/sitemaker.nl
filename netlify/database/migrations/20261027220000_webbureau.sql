-- Leads waarvan de site door een webdesigner/webbureau is gemaakt slaan we over (besluit Maxim, 27-10-2026).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bureau TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bureau_at TIMESTAMPTZ;
