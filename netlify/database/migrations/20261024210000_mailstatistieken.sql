-- Mailstatistieken B2B: opens (pixel) en klikken (ondertekende links) per mail, bounces en klachten per lead.
CREATE TABLE mail_events (
  id         SERIAL PRIMARY KEY,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mail       TEXT NOT NULL DEFAULT 'eerste',   -- eerste | opvolging
  soort      TEXT NOT NULL,                    -- open | klik
  url        TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mail_events_lead_idx ON mail_events(lead_id, soort, created_at);
ALTER TABLE leads ADD COLUMN bounced_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN klacht_at TIMESTAMPTZ;   -- reactie als "spam" of klacht
UPDATE leads SET bounced_at = updated_at WHERE status = 'fout' AND error ILIKE '%bounce%';
