-- Per klant een eigen GitHub-repo en Netlify-project; per wijziging een voorstel van Claude.
ALTER TABLE customers ADD COLUMN site_repo TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN site_netlify_id TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN site_netlify_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN site_theme TEXT NOT NULL DEFAULT '';

-- ai_status: leeg | wachtrij | bezig | voorstel | handmatig | fout | goedgekeurd | afgewezen
ALTER TABLE change_requests ADD COLUMN ai_status TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN ai_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN ai_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN ai_diff JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE change_requests ADD COLUMN ai_feedback TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN ai_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE change_requests ADD COLUMN ai_updated_at TIMESTAMPTZ;
ALTER TABLE change_requests ADD COLUMN pr_number INTEGER;
ALTER TABLE change_requests ADD COLUMN pr_url TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN preview_url TEXT NOT NULL DEFAULT '';
ALTER TABLE change_requests ADD COLUMN branch TEXT NOT NULL DEFAULT '';
CREATE INDEX change_ai_idx ON change_requests(ai_status, created_at);
