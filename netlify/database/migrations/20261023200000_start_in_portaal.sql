-- Startflow in het portaal: gegevens aanvullen → akkoord en betalen → informatie aanleveren.
ALTER TABLE customers ADD COLUMN onboarding BOOLEAN NOT NULL DEFAULT FALSE;  -- klant doorloopt de start zelf in het portaal
ALTER TABLE customers ADD COLUMN details_at TIMESTAMPTZ;                     -- bedrijfsgegevens bevestigd
ALTER TABLE customers ADD COLUMN terms_at TIMESTAMPTZ;                       -- akkoord voorwaarden + automatische incasso
ALTER TABLE customers ADD COLUMN terms_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN terms_by TEXT NOT NULL DEFAULT '';          -- e-mailadres van wie akkoord gaf
ALTER TABLE customers ADD COLUMN started_at TIMESTAMPTZ;                     -- eerste betaling binnen
ALTER TABLE customers ADD COLUMN intake JSONB NOT NULL DEFAULT '{}'::jsonb;  -- informatie voor de website
ALTER TABLE customers ADD COLUMN intake_at TIMESTAMPTZ;                      -- informatie verstuurd: klok van 48 uur start

CREATE TABLE intake_files (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'foto',   -- logo | foto | overig
  key         TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX intake_files_customer_idx ON intake_files(customer_id);
