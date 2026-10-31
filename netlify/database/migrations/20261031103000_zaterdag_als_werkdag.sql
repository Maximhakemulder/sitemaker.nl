-- Besluit Maxim 31-10-2026: zaterdag net zo veel versturen als doordeweeks (100). Eventuele aparte zaterdaglimiet weghalen.
UPDATE settings SET value = value - 'zaterdag', updated_at = NOW() WHERE key = 'b2b' AND value ? 'zaterdag';
