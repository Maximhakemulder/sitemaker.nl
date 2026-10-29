-- Pay.nl-controle (29-10-2026): juiste bedrijfsgegevens en een openbaar telefoonnummer op de site.
UPDATE settings
SET value = value || jsonb_build_object(
  'legalName', 'MH Holding B.V.',
  'kvk', '58436254',
  'email', CASE WHEN COALESCE(value->>'email', '') IN ('', 'info@sitemaker.nl') THEN 'hallo@sitemaker.nl' ELSE value->>'email' END,
  'phone', CASE WHEN COALESCE(value->>'phone', '') = '' THEN '085 200 92 05' ELSE value->>'phone' END
), updated_at = NOW()
WHERE key = 'company';
