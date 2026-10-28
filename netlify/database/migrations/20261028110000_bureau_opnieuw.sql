-- Betere webbureau-herkenning (ook een kale link onderaan, zoals "APD Creations"): alle nog niet gemailde leads opnieuw controleren.
UPDATE leads SET bureau_at = NULL WHERE sent_at IS NULL AND status IN ('kandidaat', 'nieuw', 'goedgekeurd');
