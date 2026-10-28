// Marketing & Design (Milo): advertenties voor Meta, gemaakt door een geplande Claude-taak met Kive.
// De taak levert per ad de teksten + een Kive-URL; wij halen het bestand op en bewaren het in Blobs (ads/<id>.<ext>).
import crypto from "node:crypto";
import { env, q, one, str, fail, audit, publicBase } from "./core.mjs";
import { putFile, getFile, deleteFile } from "./files.mjs";

const SOORTEN = ["static", "animatie"], FORMATEN = ["1x1", "4x5", "9x16"], STATUS = ["nieuw", "goedgekeurd", "afgekeurd", "gebruikt"];
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const publiek = (a) => ({ id: a.id, week: a.week, soort: a.soort, formaat: a.formaat, idee: a.idee, kop: a.kop, tekst: a.tekst, beschrijving: a.beschrijving,
  cta: a.cta, status: a.status, feedback: a.feedback, heeftBestand: !!a.bestand_key, type: a.bestand_type, bronUrl: a.bron_url, createdAt: a.created_at });

// Publieke, ondertekende link naar het bestand (voor Canva "upload vanaf URL"; Kive-links haalt Canva niet op).
const adSig = (id) => crypto.createHmac("sha256", env("AUTH_SECRET", "sitemaker-local-dev")).update(`ad:${id}`).digest("base64url").slice(0, 24);
export const adPubliekUrl = (base, id, type) => `${base}/api/adbestand/${id}/${adSig(id)}.${TYPES[type] || "bin"}`;
export async function publiekBestand(id, sig) {
  if (!id || !sig || sig !== adSig(id)) return new Response("Niet gevonden", { status: 404 });
  const a = await one("SELECT * FROM ads WHERE id = $1", [id]);
  const buf = a?.bestand_key && await getFile(a.bestand_key);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  return new Response(buf, { headers: { "content-type": a.bestand_type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" } });
}

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dag);
  const jaar = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(jaar, 0, 1)) / 86400000 + 1) / 7);
  return `${jaar}-W${String(w).padStart(2, "0")}`;
}

// ---- taak-API
export async function taakOpslaan(b, base = "") {
  const soort = SOORTEN.includes(b.soort) ? b.soort : "static", formaat = FORMATEN.includes(b.formaat) ? b.formaat : "1x1";
  const kop = str(b.kop, 120), tekst = str(b.tekst, 1500);
  if (!kop || !tekst) fail(400, "kop en tekst zijn verplicht.");
  const url = str(b.url, 2000);
  if (!/^https:\/\//.test(url)) fail(400, "url (https) van het Kive-bestand is verplicht.");
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) fail(400, `Bestand ophalen lukte niet (${r.status}).`);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES[type]) fail(400, `Onbekend bestandstype ${type || "?"} (verwacht png/jpg/webp/mp4).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40 * 1024 * 1024) fail(400, "Bestand is groter dan 40 MB.");
  const a = await one(`INSERT INTO ads (week, soort, formaat, idee, kop, tekst, beschrijving, cta, bestand_type, bron_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [str(b.week, 10) || weekKey(), soort, formaat, str(b.idee, 300), kop, tekst, str(b.beschrijving, 200), str(b.cta, 40) || "Meer informatie", type, url]);
  const key = `ads/${a.id}.${TYPES[type]}`;
  await putFile(key, buf, { type, name: `sitemaker-ad-${a.id}.${TYPES[type]}` });
  await q("UPDATE ads SET bestand_key = $2 WHERE id = $1", [a.id, key]);
  return { ok: true, id: a.id, bestandUrl: adPubliekUrl(base, a.id, type) };
}
// Wat Maxim eerder vond: zodat de designer leert (afgekeurd + feedback, goedgekeurd).
export async function taakFeedback() {
  const rows = await q("SELECT id, week, soort, idee, kop, status, feedback FROM ads WHERE status <> 'nieuw' OR feedback <> '' ORDER BY updated_at DESC LIMIT 30");
  return { ads: rows };
}

// ---- HQ
export async function lijst() {
  const rows = await q("SELECT * FROM ads ORDER BY week DESC, id DESC LIMIT 200");
  return { ads: rows.map(publiek), tellers: Object.fromEntries((await q("SELECT status, COUNT(*)::int AS n FROM ads GROUP BY status")).map((r) => [r.status, r.n])) };
}
export async function bijwerken(id, b, user) {
  const a = await one("SELECT * FROM ads WHERE id = $1", [id]);
  if (!a) fail(404, "Advertentie niet gevonden.");
  const status = STATUS.includes(b.status) ? b.status : a.status;
  const feedback = b.feedback !== undefined ? str(b.feedback, 1000) : a.feedback;
  const r = await one("UPDATE ads SET status = $2, feedback = $3, updated_at = NOW() WHERE id = $1 RETURNING *", [id, status, feedback]);
  await audit(user.id, null, "ad.status", { id, status });
  return publiek(r);
}
export async function verwijder(id) {
  const a = await one("DELETE FROM ads WHERE id = $1 RETURNING bestand_key", [id]);
  if (a?.bestand_key) await deleteFile(a.bestand_key).catch(() => {});
  return { ok: !!a };
}
export async function bestand(id, { download = false } = {}) {
  const a = await one("SELECT * FROM ads WHERE id = $1", [id]);
  const buf = a?.bestand_key && await getFile(a.bestand_key);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  const ext = TYPES[a.bestand_type] || "bin";
  return new Response(buf, { headers: { "content-type": a.bestand_type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff",
    ...(download ? { "content-disposition": `attachment; filename="sitemaker-${a.soort}-${a.formaat}-${a.id}.${ext}"` } : {}) } });
}
