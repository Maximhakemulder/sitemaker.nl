-- Netlify-credits bijhouden: wat wij zelf meten per factuurperiode (rekentijd van functies, AI Gateway).
CREATE TABLE IF NOT EXISTS credit_meter (
  periode DATE NOT NULL,
  soort   TEXT NOT NULL,          -- compute_ms | ai_credits
  waarde  DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (periode, soort)
);
