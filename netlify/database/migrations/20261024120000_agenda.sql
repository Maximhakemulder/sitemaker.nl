-- Kennismakingen online boeken (zoals Calendly): afspraken met een tijd, en uitzonderingen op de vaste beschikbaarheid.
ALTER TABLE appointments ADD COLUMN starts_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN ends_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN token TEXT NOT NULL DEFAULT '';          -- voor annuleren en .ics via de link in de mail
ALTER TABLE appointments ADD COLUMN canceled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN canceled_by TEXT NOT NULL DEFAULT '';    -- klant | sitemaker
ALTER TABLE appointments ADD COLUMN reminder_at TIMESTAMPTZ;
-- status: nieuw | gepland | klant | geen_interesse | niet_bereikbaar | geannuleerd
-- Twee boekingen op hetzelfde moment kan niet.
CREATE UNIQUE INDEX appointments_slot_uniq ON appointments(starts_at) WHERE starts_at IS NOT NULL AND status <> 'geannuleerd';
CREATE INDEX appointments_starts_idx ON appointments(starts_at);

CREATE TABLE agenda_exceptions (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,              -- dicht | open
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agenda_exceptions_idx ON agenda_exceptions(starts_at, ends_at);
