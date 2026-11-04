-- KvK-nummer bijgewerkt naar 86540440 (04-11-2026).
UPDATE settings
SET value = value || jsonb_build_object('kvk', '86540440'), updated_at = NOW()
WHERE key = 'company';
