-- Opzeggen via het portaal (met opzegtermijn), klantvragen (tickets) en kosten voor de boekhouding.
ALTER TABLE customers ADD COLUMN opzeg_status TEXT NOT NULL DEFAULT '';   -- '' | aangevraagd | ingetrokken | afgerond
ALTER TABLE customers ADD COLUMN opzeg_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN opzeg_einde DATE;
ALTER TABLE customers ADD COLUMN opzeg_reden TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN opzeg_toelichting TEXT NOT NULL DEFAULT '';

CREATE TABLE tickets (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email           TEXT NOT NULL DEFAULT '',
  naam            TEXT NOT NULL DEFAULT '',
  onderwerp       TEXT NOT NULL DEFAULT '',
  bron            TEXT NOT NULL DEFAULT 'portaal',   -- portaal | mail | opzeggen
  status          TEXT NOT NULL DEFAULT 'open',      -- open | beantwoord | gesloten
  concept         TEXT NOT NULL DEFAULT '',          -- antwoord dat Claude klaarzet
  concept_status  TEXT NOT NULL DEFAULT '',          -- '' | bezig | klaar | fout
  laatste_msg_id  TEXT NOT NULL DEFAULT '',          -- Message-ID van de laatste mail van de klant (voor In-Reply-To)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX tickets_status_idx ON tickets(status, updated_at DESC);
CREATE TABLE ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  van         TEXT NOT NULL,                         -- klant | sitemaker
  tekst       TEXT NOT NULL,
  message_id  TEXT NOT NULL DEFAULT '',
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_messages_idx ON ticket_messages(ticket_id, created_at);
CREATE UNIQUE INDEX ticket_messages_mid_uniq ON ticket_messages(message_id) WHERE message_id <> '';

CREATE TABLE costs (
  id            SERIAL PRIMARY KEY,
  omschrijving  TEXT NOT NULL,
  leverancier   TEXT NOT NULL DEFAULT '',
  categorie     TEXT NOT NULL DEFAULT 'software',   -- software | hosting | ai | marketing | domeinen | overig
  soort         TEXT NOT NULL DEFAULT 'maandelijks', -- maandelijks | jaarlijks | eenmalig
  bedrag_cents  INTEGER NOT NULL,                    -- exclusief btw
  btw_cents     INTEGER NOT NULL DEFAULT 0,
  datum         DATE NOT NULL,                       -- eenmalig: de datum; terugkerend: vanaf
  tot           DATE,                                -- terugkerend: tot en met (leeg = loopt nog)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
