-- Afdeling Domeinen: per klant zijn domeinnaam, wie hem beheert en of hij goed naar de site wijst.
CREATE TABLE domains (
  id             SERIAL PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  naam           TEXT NOT NULL,                       -- bijv. bakkerijzon.nl (zonder www)
  -- eigen = klant houdt het bij zijn provider | verhuizen = naar Sitemaker | nieuw = Sitemaker registreert
  keuze          TEXT NOT NULL DEFAULT 'eigen',
  -- wacht_op_klant | aangevraagd | verhuizen | registreren | dns_klaar | actief | probleem | opgezegd
  status         TEXT NOT NULL DEFAULT 'wacht_op_klant',
  provider       TEXT NOT NULL DEFAULT '',            -- huidige of gekozen registrar
  verhuiscode    TEXT NOT NULL DEFAULT '',            -- alleen tijdelijk, wordt gewist zodra de verhuizing klaar is
  verloopt_op    DATE,                                -- alleen bij beheer door Sitemaker
  dns            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- laatste controle
  dns_at         TIMESTAMPTZ,
  netlify_gekoppeld BOOLEAN NOT NULL DEFAULT FALSE,
  notitie        TEXT NOT NULL DEFAULT '',
  waarschuwing_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX domains_naam_uniq ON domains(naam) WHERE status <> 'opgezegd';
CREATE INDEX domains_customer_idx ON domains(customer_id);
