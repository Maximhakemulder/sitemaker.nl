-- Berichten die bezoekers via een formulier op een klantsite sturen (offerte, intake, afspraak, contact).
-- De klant krijgt elk bericht per mail; hier bewaren we ze ook (voor het portaal en als er een mail misgaat).
CREATE TABLE IF NOT EXISTS formulier_berichten (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  formulier   TEXT NOT NULL DEFAULT '',
  velden      JSONB NOT NULL DEFAULT '[]'::jsonb,
  email       TEXT NOT NULL DEFAULT '',
  ip_hash     TEXT NOT NULL DEFAULT '',
  gemaild     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS formulier_berichten_klant_idx ON formulier_berichten(customer_id, created_at DESC);
