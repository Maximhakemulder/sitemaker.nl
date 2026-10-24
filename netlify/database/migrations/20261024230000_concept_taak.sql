-- Concepten worden ontworpen door een geplande Claude-taak (geen AI-kosten in Netlify).
-- bron = wat de scan vond (tekst, kleuren, analyse); taak_at = wanneer de taak het concept oppakte.
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS bron JSONB;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS taak_at TIMESTAMPTZ;
