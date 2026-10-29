-- Anonieme bezoekersstatistiek voor de landingspagina /start (besluit Maxim 29-10-2026).
-- Geen cookies, geen IP-adres: alleen een willekeurige sessiecode uit sessionStorage van de bezoeker.
CREATE TABLE landing_sessies (
  sessie      TEXT PRIMARY KEY,
  bron        TEXT NOT NULL DEFAULT 'direct',
  eerste_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  laatst_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  formulier_at TIMESTAMPTZ,
  aanvraag_at  TIMESTAMPTZ,
  mobiel      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX landing_sessies_eerste_idx ON landing_sessies(eerste_at DESC);
CREATE INDEX landing_sessies_laatst_idx ON landing_sessies(laatst_at DESC);
