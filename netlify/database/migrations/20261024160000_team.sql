-- Het bedrijf in HQ: briefings van afdelingsmanagers en de directeur, vragen aan managers, rapporten van geplande Claude-taken.
CREATE TABLE team_briefings (
  id         SERIAL PRIMARY KEY,
  dept       TEXT NOT NULL,                 -- afdeling, of 'directie' voor de directeur
  day        DATE NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  ai         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX team_briefings_uniq ON team_briefings(dept, day);

CREATE TABLE team_questions (
  id          SERIAL PRIMARY KEY,
  dept        TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',   -- open | klaar | fout
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX team_questions_idx ON team_questions(dept, created_at DESC);

-- Rapporten en resultaten van geplande Claude-taken (bijv. Meta-rapport, statische advertenties).
CREATE TABLE team_reports (
  id         SERIAL PRIMARY KEY,
  dept       TEXT NOT NULL,
  agent      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX team_reports_idx ON team_reports(dept, kind, created_at DESC);
