// Anonieme bezoekers van de landingspagina /start: live, vandaag, 7 dagen, herkomst en waar mensen afhaken.
// Geen cookies en geen IP: de pagina stuurt een willekeurige sessiecode (sessionStorage) mee.
import { q, str } from "./core.mjs";

const BOT = /bot|crawl|spider|preview|facebookexternalhit|headless|lighthouse|pingdom|curl|python|go-http/i;
const BRONNEN = new Set(["meta", "google", "direct", "mail", "anders"]);

export async function meet(b, ua = "") {
  if (BOT.test(ua)) return { ok: true };
  const sessie = str(b.s, 40);
  if (!/^[a-z0-9]{12,40}$/i.test(sessie)) return { ok: true };
  const e = String(b.e || "");
  const bron = BRONNEN.has(b.b) ? b.b : "anders";
  const mobiel = b.m === true;
  if (e === "view") {
    await q(`INSERT INTO landing_sessies (sessie, bron, mobiel) VALUES ($1, $2, $3)
             ON CONFLICT (sessie) DO UPDATE SET laatst_at = NOW()`, [sessie, bron, mobiel]);
  } else if (e === "ping") {
    await q("UPDATE landing_sessies SET laatst_at = NOW() WHERE sessie = $1 AND eerste_at > NOW() - INTERVAL '2 hours'", [sessie]);
  } else if (e === "formulier") {
    await q("UPDATE landing_sessies SET laatst_at = NOW(), formulier_at = COALESCE(formulier_at, NOW()) WHERE sessie = $1", [sessie]);
  } else if (e === "aanvraag") {
    await q("UPDATE landing_sessies SET laatst_at = NOW(), formulier_at = COALESCE(formulier_at, NOW()), aanvraag_at = COALESCE(aanvraag_at, NOW()) WHERE sessie = $1", [sessie]);
  }
  return { ok: true };
}

const vanaf = (dagen) => dagen === 0
  ? "(date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')"
  : `NOW() - INTERVAL '${dagen} days'`;

async function periode(dagen) {
  const [r] = await q(`SELECT COUNT(*)::int AS bezoekers, COUNT(formulier_at)::int AS formulier, COUNT(aanvraag_at)::int AS aanvragen,
      COUNT(*) FILTER (WHERE mobiel)::int AS mobiel FROM landing_sessies WHERE eerste_at >= ${vanaf(dagen)}`);
  return { ...r, conversie: r.bezoekers ? Math.round((r.aanvragen / r.bezoekers) * 1000) / 10 : 0 };
}

export async function stats() {
  const [{ n: live }] = await q("SELECT COUNT(*)::int AS n FROM landing_sessies WHERE laatst_at > NOW() - INTERVAL '5 minutes'");
  const bronnen = await q(`SELECT bron, COUNT(*)::int AS bezoekers, COUNT(aanvraag_at)::int AS aanvragen FROM landing_sessies
      WHERE eerste_at >= NOW() - INTERVAL '7 days' GROUP BY bron ORDER BY bezoekers DESC`);
  const perDag = await q(`SELECT to_char(date_trunc('day', eerste_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM-DD') AS dag,
      COUNT(*)::int AS bezoekers, COUNT(aanvraag_at)::int AS aanvragen FROM landing_sessies
      WHERE eerste_at >= NOW() - INTERVAL '14 days' GROUP BY 1 ORDER BY 1`);
  return { live, vandaag: await periode(0), week: await periode(7), bronnen, perDag };
}

// Oude sessies opruimen (90 dagen bewaren).
export async function opruimen() {
  const r = await q("DELETE FROM landing_sessies WHERE eerste_at < NOW() - INTERVAL '90 days' RETURNING sessie");
  return { done: r.length };
}
