-- Uniek ontwerp per concept: volledig HTML-document van de ontwerp-agent (zonder scripts, opgeschoond).
ALTER TABLE concepts ADD COLUMN html TEXT NOT NULL DEFAULT '';
ALTER TABLE concepts ADD COLUMN ontwerp_fout TEXT NOT NULL DEFAULT '';
