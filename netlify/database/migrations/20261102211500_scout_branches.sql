-- Besluit Maxim 02-11-2026: ook zoeken naar tandartsen, fysiotherapeuten, kappers, garages, makelaars, autorijscholen, bloemisten en meubelzaken.
UPDATE settings
SET value = jsonb_set(value, '{scout,categories}',
  COALESCE(value->'scout'->'categories', '[]'::jsonb) ||
  COALESCE((SELECT jsonb_agg(n) FROM unnest(ARRAY['tandarts','fysiotherapeut','kapper','garage','makelaar','autorijschool','bloemist','meubelzaak']) AS n
            WHERE NOT (COALESCE(value->'scout'->'categories', '[]'::jsonb) ? n)), '[]'::jsonb), true),
    updated_at = NOW()
WHERE key = 'b2b' AND value ? 'scout';
