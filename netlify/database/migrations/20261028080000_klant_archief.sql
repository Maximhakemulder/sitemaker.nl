-- Klanten verwijderen: zonder facturen/betalingen echt weg; met facturen (bewaarplicht) gearchiveerd en uit alle lijsten.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gearchiveerd_at TIMESTAMPTZ;
