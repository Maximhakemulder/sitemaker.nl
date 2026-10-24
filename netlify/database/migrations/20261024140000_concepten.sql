-- Concept-websites voor leads: de agent bekijkt hun site, Claude maakt een opzet in de Sitemaker-opmaak.
CREATE TABLE concepts (
  id            SERIAL PRIMARY KEY,
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  -- wachtrij | bezig | klaar | fout | overgeslagen
  status        TEXT NOT NULL DEFAULT 'wachtrij',
  content       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- zelfde opbouw als content.json van een klantsite
  images        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, key, type, w, h, size, bron}]
  analysis      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- feiten over hun huidige site (https, mobiel, jaartal …)
  instructie    TEXT NOT NULL DEFAULT '',             -- extra wens van Maxim bij opnieuw maken
  reden         TEXT NOT NULL DEFAULT '',             -- waarom overgeslagen of mislukt
  pogingen      INTEGER NOT NULL DEFAULT 0,
  views         INTEGER NOT NULL DEFAULT 0,
  first_view_at TIMESTAMPTZ,
  last_view_at  TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  ready_at      TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX concepts_lead_uniq ON concepts(lead_id);
CREATE UNIQUE INDEX concepts_token_uniq ON concepts(token);
CREATE INDEX concepts_status_idx ON concepts(status, created_at);
