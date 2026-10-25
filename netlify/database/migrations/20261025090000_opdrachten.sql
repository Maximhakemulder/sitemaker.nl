-- Opdrachten: de echte website van een betalende klant, gemaakt door de ontwerper (geplande Claude-taak).
-- Basis = het concept dat de klant al zag (als dat er is); anders een nieuw ontwerp. Maxim controleert en zet live.
CREATE TABLE IF NOT EXISTS opdrachten (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  concept_id  INTEGER REFERENCES concepts(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'wacht',          -- wacht | ontwerpen | controle | live | fout
  token       TEXT NOT NULL UNIQUE,
  html        TEXT,
  content     JSONB,
  images      JSONB NOT NULL DEFAULT '[]'::jsonb,
  dna         JSONB,
  feedback    TEXT NOT NULL DEFAULT '',
  reden       TEXT NOT NULL DEFAULT '',
  pogingen    INTEGER NOT NULL DEFAULT 0,
  taak_at     TIMESTAMPTZ,
  klaar_at    TIMESTAMPTZ,
  live_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS opdrachten_status_idx ON opdrachten(status, created_at);
