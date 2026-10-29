-- Gratis ontwerp aanvragen via sitemaker.nl/start (Meta-ads, besluit Maxim 29-10-2026).
-- Lead met status 'aanvraag' tot het ontwerp klaar is; daarna gaat de mail automatisch en wordt hij 'verstuurd'.
ALTER TABLE leads ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN aanvraag_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN aanvraag_tekst TEXT NOT NULL DEFAULT '';
CREATE INDEX leads_aanvraag_idx ON leads(aanvraag_at DESC) WHERE aanvraag_at IS NOT NULL;
