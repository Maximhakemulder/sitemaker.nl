-- Vanaf 28-10-2026 alleen nog bouw- en installatievakken (besluit Maxim): installateurs, bouw, schilders enz.
-- Geen kappers, salons, coaches, psychologen, advocaten, rijscholen, transport, schoonmaak, honden enz. meer.
UPDATE settings
SET value = jsonb_set(value, '{scout,categories}', to_jsonb(ARRAY['installatiebedrijf','loodgieter','elektricien','schilder','stukadoor','tegelzetter','dakdekker','timmerman','aannemer','bouwbedrijf','klusbedrijf','metselaar','voegbedrijf','vloerenlegger','bestratingsbedrijf','hovenier','kozijnen','glaszetter','keukenmontage','badkamerrenovatie','zonnepanelen installateur','warmtepomp installateur','isolatiebedrijf','grondwerk','sloopbedrijf']::text[]), true), updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';

-- Nog niet gemailde scout-leads uit andere branches overslaan.
UPDATE leads SET status = 'overgeslagen', reject_reason = 'branche uitgesloten (alleen bouw en installatie)', updated_at = NOW()
WHERE sent_at IS NULL AND source = 'scout' AND status IN ('kandidaat', 'nieuw', 'goedgekeurd')
  AND NOT (lower(coalesce(category, '')) = ANY(ARRAY['installatiebedrijf','loodgieter','elektricien','schilder','stukadoor','tegelzetter','dakdekker','timmerman','aannemer','bouwbedrijf','klusbedrijf','metselaar','voegbedrijf','vloerenlegger','bestratingsbedrijf','hovenier','kozijnen','glaszetter','keukenmontage','badkamerrenovatie','zonnepanelen installateur','warmtepomp installateur','isolatiebedrijf','grondwerk','sloopbedrijf']::text[]));
