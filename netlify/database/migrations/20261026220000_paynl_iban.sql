-- Pay.nl: IBAN en rekeninghouder voor de incassomachtiging (SEPA). Kolommen mollie_* blijven bestaan maar
-- bevatten nu Pay.nl-codes (order-ID, IO-machtiging, IL-incasso).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS iban TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS iban_naam TEXT NOT NULL DEFAULT '';
