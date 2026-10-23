-- Sitemaker: basis-schema voor website, klantenportaal en HQ.
-- Bedragen altijd in centen (integer). Tijden als timestamptz (UTC).

CREATE TABLE customers (
  id                     SERIAL PRIMARY KEY,
  company                TEXT NOT NULL,
  contact_name           TEXT NOT NULL DEFAULT '',
  email                  TEXT NOT NULL DEFAULT '',
  phone                  TEXT NOT NULL DEFAULT '',
  address                TEXT NOT NULL DEFAULT '',
  kvk                    TEXT NOT NULL DEFAULT '',
  vat_number             TEXT NOT NULL DEFAULT '',
  site_url               TEXT NOT NULL DEFAULT '',
  -- in_aanbouw | live | gepauzeerd | opgezegd
  site_status            TEXT NOT NULL DEFAULT 'in_aanbouw',
  delivered_at           DATE,
  -- geen | wacht_op_betaling | actief | betaling_mislukt | gepauzeerd | opgezegd | handmatig
  billing_status         TEXT NOT NULL DEFAULT 'geen',
  monthly_cents          INTEGER NOT NULL DEFAULT 6995,
  build_cents            INTEGER NOT NULL DEFAULT 29995,
  mollie_customer_id     TEXT,
  mollie_mandate_id      TEXT,
  mollie_subscription_id TEXT,
  subscription_start     DATE,
  notes                  TEXT NOT NULL DEFAULT '',
  lead_id                INTEGER,
  appointment_id         INTEGER,
  -- online-check
  check_at               TIMESTAMPTZ,
  check_ok               BOOLEAN,
  check_code             INTEGER,
  check_ms               INTEGER,
  check_fails            INTEGER NOT NULL DEFAULT 0,
  check_error            TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Iedereen die kan inloggen: klanten (aan een klant gekoppeld) en medewerkers.
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  -- klant | medewerker | admin
  role          TEXT NOT NULL,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('klant','medewerker','admin')),
  CONSTRAINT users_customer_check CHECK ((role = 'klant') = (customer_id IS NOT NULL))
);
CREATE INDEX users_customer_idx ON users(customer_id);

-- Inlogcodes per e-mail (alleen de hash wordt bewaard).
CREATE TABLE login_codes (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  attempts   INTEGER NOT NULL DEFAULT 0,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX login_codes_email_idx ON login_codes(email, created_at DESC);
CREATE INDEX login_codes_ip_idx ON login_codes(ip, created_at DESC);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Wijzigingsverzoeken vanuit het klantenportaal.
CREATE TABLE change_requests (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  page            TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL,
  -- ontvangen | in_behandeling | verwerkt | afgewezen
  status          TEXT NOT NULL DEFAULT 'ontvangen',
  -- maand waarin de wijziging meetelt, als 'YYYY-MM' (Europe/Amsterdam)
  month           TEXT NOT NULL,
  counts          BOOLEAN NOT NULL DEFAULT TRUE,
  -- plek 1 t/m 4 binnen de maand; uniek, zodat er nooit meer dan 4 meetellen
  slot            SMALLINT,
  staff_note      TEXT NOT NULL DEFAULT '',
  attachment_key  TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT change_status_check CHECK (status IN ('ontvangen','in_behandeling','verwerkt','afgewezen')),
  CONSTRAINT change_slot_range CHECK (slot BETWEEN 1 AND 4),
  CONSTRAINT change_slot_counts CHECK ((counts AND slot IS NOT NULL) OR (NOT counts AND slot IS NULL))
);
CREATE UNIQUE INDEX change_slot_uniq ON change_requests(customer_id, month, slot) WHERE slot IS NOT NULL;
CREATE INDEX change_customer_month_idx ON change_requests(customer_id, month);
CREATE INDEX change_status_idx ON change_requests(status, created_at);

CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  number            TEXT NOT NULL UNIQUE,
  invoice_date      DATE NOT NULL,
  due_date          DATE,
  description       TEXT NOT NULL DEFAULT '',
  -- bedragen: totaal is wat de klant betaalt
  amount_cents      INTEGER NOT NULL,
  vat_cents         INTEGER NOT NULL DEFAULT 0,
  -- open | betaald | vervallen | gecrediteerd
  status            TEXT NOT NULL DEFAULT 'open',
  pdf_key           TEXT,
  -- handmatig | mollie
  source            TEXT NOT NULL DEFAULT 'handmatig',
  mollie_payment_id TEXT UNIQUE,
  paid_at           TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_status_check CHECK (status IN ('open','betaald','vervallen','gecrediteerd'))
);
CREATE INDEX invoices_customer_idx ON invoices(customer_id, invoice_date DESC);

-- Alle betalingen bij Mollie (eerste betaling, abonnement, losse factuur).
CREATE TABLE payments (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_id        INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  mollie_payment_id TEXT NOT NULL UNIQUE,
  -- eerste | abonnement | factuur
  kind              TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  method            TEXT,
  checkout_url      TEXT,
  description       TEXT NOT NULL DEFAULT '',
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_customer_idx ON payments(customer_id, created_at DESC);

-- Aanvragen via het formulier op de website.
CREATE TABLE appointments (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  preference  TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  -- nieuw | gepland | klant | geen_interesse
  status      TEXT NOT NULL DEFAULT 'nieuw',
  staff_note  TEXT NOT NULL DEFAULT '',
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  lead_id     INTEGER,
  source      TEXT NOT NULL DEFAULT 'website',
  ip_hash     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX appointments_status_idx ON appointments(status, created_at DESC);

-- B2B-acquisitie: bedrijven die we per mail benaderen.
CREATE TABLE leads (
  id               SERIAL PRIMARY KEY,
  company          TEXT NOT NULL,
  email            TEXT,
  website          TEXT NOT NULL DEFAULT '',
  domain           TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  -- scout | handmatig | import | website
  source           TEXT NOT NULL DEFAULT 'handmatig',
  -- kandidaat | nieuw | goedgekeurd | verstuurd | opvolging_klaar | opgevolgd | reactie | afspraak | klant | afgemeld | overgeslagen | fout
  status           TEXT NOT NULL DEFAULT 'nieuw',
  intro            TEXT NOT NULL DEFAULT '',
  research_note    TEXT NOT NULL DEFAULT '',
  researched_at    TIMESTAMPTZ,
  reject_reason    TEXT NOT NULL DEFAULT '',
  sent_at          TIMESTAMPTZ,
  sent_subject     TEXT,
  message_id       TEXT,
  followup_at      TIMESTAMPTZ,
  followup_id      TEXT,
  reply_at         TIMESTAMPTZ,
  reply_snippet    TEXT NOT NULL DEFAULT '',
  unsub_at         TIMESTAMPTZ,
  error            TEXT NOT NULL DEFAULT '',
  customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX leads_email_uniq ON leads(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX leads_domain_uniq ON leads(domain) WHERE domain <> '';
CREATE INDEX leads_status_idx ON leads(status, updated_at DESC);

-- Adressen die nooit meer B2B-mail krijgen.
CREATE TABLE suppressions (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL DEFAULT 'afgemeld',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Verzonden mail (zonder inhoud van inlogcodes).
CREATE TABLE mail_log (
  id         SERIAL PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  error      TEXT NOT NULL DEFAULT '',
  ref        TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mail_log_created_idx ON mail_log(created_at DESC);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_customer_idx ON audit_log(customer_id, created_at DESC);
CREATE INDEX audit_created_idx ON audit_log(created_at DESC);

-- Simpele vergrendeling voor geplande taken.
CREATE TABLE locks (
  name       TEXT PRIMARY KEY,
  until      TIMESTAMPTZ NOT NULL
);
