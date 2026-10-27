-- Na livegang krijgt een klant 2 gratis feedbackrondes (tellen niet mee voor de 4 per maand).
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS oplever BOOLEAN NOT NULL DEFAULT FALSE;
