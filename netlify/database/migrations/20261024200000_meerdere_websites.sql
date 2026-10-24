-- Eén klant (gebruiker) kan meerdere websites hebben. Elke website blijft een eigen klantregel (eigen abonnement,
-- 4 wijzigingen per maand, facturen, domein); user_sites koppelt een portaalgebruiker aan al zijn websites.
CREATE TABLE user_sites (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, customer_id)
);
CREATE INDEX user_sites_customer_idx ON user_sites(customer_id);
INSERT INTO user_sites (user_id, customer_id) SELECT id, customer_id FROM users WHERE customer_id IS NOT NULL ON CONFLICT DO NOTHING;
-- De website die de klant in het portaal open heeft.
ALTER TABLE sessions ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
-- Naam van de website (bij meerdere websites van hetzelfde bedrijf), bijv. "Webshop-vrije site Utrecht".
ALTER TABLE customers ADD COLUMN site_naam TEXT NOT NULL DEFAULT '';
