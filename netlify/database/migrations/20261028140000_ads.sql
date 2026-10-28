-- Marketing & Design: advertenties (statics en animaties) die de geplande Claude-taak met Kive maakt voor Meta.
CREATE TABLE IF NOT EXISTS ads (
  id           SERIAL PRIMARY KEY,
  week         TEXT NOT NULL,                       -- bijv. 2026-W44
  soort        TEXT NOT NULL DEFAULT 'static',      -- static | animatie
  formaat      TEXT NOT NULL DEFAULT '1x1',         -- 1x1 | 4x5 | 9x16
  idee         TEXT NOT NULL DEFAULT '',            -- invalshoek / hook
  kop          TEXT NOT NULL DEFAULT '',            -- Meta: kop (headline)
  tekst        TEXT NOT NULL DEFAULT '',            -- Meta: primaire tekst
  beschrijving TEXT NOT NULL DEFAULT '',            -- Meta: beschrijving
  cta          TEXT NOT NULL DEFAULT 'Meer informatie',
  bestand_key  TEXT,
  bestand_type TEXT NOT NULL DEFAULT '',
  bron_url     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'nieuw',       -- nieuw | goedgekeurd | afgekeurd | gebruikt
  feedback     TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_week_idx ON ads(week DESC, id);
