-- Besluit Maxim 30-10-2026: voorbeeldlinks 14 dagen geldig (was 7). Ook voor al verstuurde, nog geldige voorbeelden.
UPDATE settings
SET value = jsonb_set(value, '{concepten,geldigDagen}', '14'::jsonb, true), updated_at = NOW()
WHERE key = 'b2b' AND COALESCE((value->'concepten'->>'geldigDagen')::int, 0) < 14;
UPDATE concepts c SET expires_at = l.sent_at + INTERVAL '14 days'
FROM leads l
WHERE l.id = c.lead_id AND l.sent_at IS NOT NULL AND c.status = 'klaar'
  AND c.expires_at IS NOT NULL AND c.expires_at > NOW() AND c.expires_at < l.sent_at + INTERVAL '14 days';
