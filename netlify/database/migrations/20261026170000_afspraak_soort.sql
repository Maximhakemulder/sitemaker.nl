-- Twee soorten kennismaking: telefoon (vaste weektijden uit settings.agenda) en video (doordeweeks 13–15 en 17–18).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS soort TEXT NOT NULL DEFAULT 'telefoon';
