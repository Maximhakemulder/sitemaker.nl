-- Extra pagina's bij de echte website (algemene voorwaarden, privacyverklaring), naast ontwerp.html.
ALTER TABLE opdrachten ADD COLUMN IF NOT EXISTS paginas JSONB NOT NULL DEFAULT '{}'::jsonb;
