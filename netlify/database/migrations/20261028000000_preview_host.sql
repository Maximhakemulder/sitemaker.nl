-- Eigen voorbeeldadres per klantsite (bijv. de-schilder-profs.sitemaker.nl), zodat klanten nooit ….netlify.app zien.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preview_host TEXT NOT NULL DEFAULT '';
