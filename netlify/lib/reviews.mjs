// Klantreviews: ingevoerd in HQ, alleen gepubliceerde komen op de website.
// "Geverifieerde klant" alleen als de review aan een bestaande Sitemaker-klant hangt.
import { q, one, str, normUrl, fail, audit } from "./core.mjs";

const publiek = (r) => ({
  name: r.name, company: r.company, rating: r.rating, title: r.title, body: r.body, date: r.review_date,
  verified: !!r.customer_id, source: r.source, sourceUrl: r.source_url,
});

export async function publishedReviews() {
  const rows = await q("SELECT * FROM reviews WHERE published ORDER BY review_date DESC, id DESC LIMIT 40");
  const [avg] = await q("SELECT COUNT(*)::int AS n, COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS gem FROM reviews WHERE published");
  return { reviews: rows.map(publiek), count: avg.n, average: avg.gem };
}

export async function listReviews() {
  const rows = await q("SELECT r.*, c.company AS klant FROM reviews r LEFT JOIN customers c ON c.id = r.customer_id ORDER BY r.created_at DESC");
  return rows.map((r) => ({ id: r.id, ...publiek(r), customerId: r.customer_id, klant: r.klant, published: r.published, uitPortaal: r.source === "portaal", createdAt: r.created_at }));
}

function velden(b) {
  const name = str(b.name, 80), body = str(b.body, 1500);
  const rating = Number(b.rating);
  if (!name) fail(400, "Vul de naam van de klant in.", { field: "name" });
  if (body.length < 10) fail(400, "Vul de tekst van de review in.", { field: "body" });
  if (!(rating >= 1 && rating <= 5)) fail(400, "Kies 1 tot 5 sterren.", { field: "rating" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : null;
  return { name, body, rating, company: str(b.company, 120), title: str(b.title, 120), date, source: str(b.source, 60), sourceUrl: b.sourceUrl ? normUrl(b.sourceUrl) : "", customerId: Number(b.customerId) || null, published: !!b.published };
}

export async function saveReview(id, b, user) {
  const f = velden(b);
  if (f.customerId && !(await one("SELECT 1 FROM customers WHERE id = $1", [f.customerId]))) fail(400, "Die klant bestaat niet.");
  const params = [f.customerId, f.name, f.company, f.rating, f.title, f.body, f.date, f.source, f.sourceUrl, f.published];
  const r = id
    ? await one(`UPDATE reviews SET customer_id=$1, name=$2, company=$3, rating=$4, title=$5, body=$6, review_date=COALESCE($7::date, review_date), source=$8, source_url=$9, published=$10, updated_at=NOW() WHERE id=$11 RETURNING id`, [...params, id])
    : await one(`INSERT INTO reviews (customer_id, name, company, rating, title, body, review_date, source, source_url, published) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8,$9,$10) RETURNING id`, params);
  if (!r) fail(404, "Review niet gevonden.");
  await audit(user.id, f.customerId, id ? "review.bijgewerkt" : "review.toegevoegd", { id: r.id, published: f.published });
  return { id: r.id };
}

export async function deleteReview(id, user) {
  const r = await one("DELETE FROM reviews WHERE id = $1 RETURNING customer_id", [id]);
  if (!r) fail(404, "Review niet gevonden.");
  await audit(user.id, r.customer_id, "review.verwijderd", { id });
  return { ok: true };
}
