-- Echte klantreviews, ingevoerd in HQ. Alleen gepubliceerde reviews komen op de website.
-- "Geverifieerd" betekent: gekoppeld aan een bestaande Sitemaker-klant.
CREATE TABLE reviews (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  company      TEXT NOT NULL DEFAULT '',
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  review_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  source       TEXT NOT NULL DEFAULT '',
  source_url   TEXT NOT NULL DEFAULT '',
  published    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX reviews_published_idx ON reviews(published, review_date DESC);
