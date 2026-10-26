-- Openingszinnen opnieuw schrijven met de nieuwe stijl (je-vorm, pakkender): intro_v = versie van de schrijfwijze.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intro_v INTEGER NOT NULL DEFAULT 0;
