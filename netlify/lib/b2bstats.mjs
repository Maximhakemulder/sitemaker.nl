// B2B-overzicht voor HQ: waar de scout zoekt, wat er gevonden is, wat er vandaag verstuurd kan worden en wat het oplevert.
import { q, one, getSettings, env, dayKey, hourAms } from "./core.mjs";
import { mailReady } from "./mail.mjs";
import { scoutReady } from "./b2b.mjs";

const T0 = "(date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')";
const VERSTUURD = "('verstuurd','opvolging_goedgekeurd','opgevolgd','reactie','afspraak','klant','afgemeld')";

// Mailprestaties voor mails die sinds `vanaf` zijn verstuurd (per mail: eerste of opvolging).
// Afgeleverd = verstuurd zonder bounce. Geopend is een indicatie (sommige mailapps laden plaatjes vooraf of blokkeren ze).
// Geklikt = op een link geklikt of het concept bekeken. Percentages t.o.v. afgeleverd.
async function mailStats(vanaf) {
  const r = await one(`WITH m AS (
      SELECT DISTINCT ON (ref, kind) substring(ref from 6)::int AS lead_id, replace(kind, 'b2b-', '') AS mail, ok, created_at
      FROM mail_log WHERE kind LIKE 'b2b-%' AND ref LIKE 'lead:%' AND ($1::timestamptz IS NULL OR created_at >= $1) ORDER BY ref, kind, created_at DESC)
    SELECT
      COUNT(*) FILTER (WHERE m.ok)::int AS verstuurd,
      COUNT(*) FILTER (WHERE NOT m.ok)::int AS mislukt,
      COUNT(*) FILTER (WHERE m.ok AND l.bounced_at >= m.created_at)::int AS bounces,
      COUNT(*) FILTER (WHERE m.ok AND EXISTS (SELECT 1 FROM mail_events e WHERE e.lead_id = m.lead_id AND e.mail = m.mail AND e.soort = 'open'))::int AS geopend,
      COUNT(*) FILTER (WHERE m.ok AND (EXISTS (SELECT 1 FROM mail_events e WHERE e.lead_id = m.lead_id AND e.mail = m.mail AND e.soort = 'klik')
        OR (m.mail = 'eerste' AND c.first_view_at >= m.created_at)))::int AS geklikt,
      COUNT(*) FILTER (WHERE m.ok AND l.reply_at >= m.created_at)::int AS reacties,
      COUNT(*) FILTER (WHERE m.ok AND l.unsub_at >= m.created_at)::int AS afmeldingen,
      COUNT(*) FILTER (WHERE m.ok AND l.klacht_at >= m.created_at)::int AS klachten,
      COUNT(*) FILTER (WHERE m.ok AND m.mail = 'eerste')::int AS eerste,
      COUNT(*) FILTER (WHERE m.ok AND m.mail = 'opvolging')::int AS opvolging
    FROM m JOIN leads l ON l.id = m.lead_id LEFT JOIN concepts c ON c.lead_id = m.lead_id`, [vanaf]);
  const afgeleverd = Math.max(0, r.verstuurd - r.bounces);
  const p = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  return { ...r, afgeleverd, pct: { afgeleverd: p(afgeleverd, r.verstuurd), bounce: p(r.bounces, r.verstuurd), geopend: p(r.geopend, afgeleverd), geklikt: p(r.geklikt, afgeleverd), reacties: p(r.reacties, afgeleverd), afmeldingen: p(r.afmeldingen, afgeleverd), klachten: p(r.klachten, afgeleverd) } };
}
export async function mailPrestaties() {
  const T = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const vandaag = (await one(`SELECT ${T0} AS t`)).t;
  const [a, b, c, d] = await Promise.all([mailStats(vandaag), mailStats(T(7)), mailStats(T(30)), mailStats(null)]);
  // Signalen: bij een te hoge bounce of klachten eerst rustiger aan.
  const s = d.verstuurd >= 20 ? c : d;
  const waarschuwingen = [];
  if (s.verstuurd >= 20 && s.pct.bounce > 3) waarschuwingen.push(`Bounce ${s.pct.bounce}% (boven 3%): controleer de mailadressen en verlaag de daglimiet.`);
  if (s.verstuurd >= 20 && s.pct.klachten > 0.3) waarschuwingen.push(`Klachten ${s.pct.klachten}%: pas de tekst aan en verlaag de daglimiet.`);
  if (s.verstuurd >= 20 && s.pct.afmeldingen > 2) waarschuwingen.push(`Afmeldingen ${s.pct.afmeldingen}%: de mail past mogelijk niet bij deze branches.`);
  return { vandaag: a, d7: b, d30: c, alles: d, waarschuwingen };
}

export async function b2bDashboard() {
  const s = await getSettings();
  const sc = s.b2b.scout || {};
  const st = (await one("SELECT value FROM settings WHERE key = 'scout_state'"))?.value || {};
  const inbox = (await one("SELECT value FROM settings WHERE key = 'inbox_scan'"))?.value || null;
  const [tot, vandaag, perCat, perPlaats, dagen, wachtrij, bron] = await Promise.all([
    one(`SELECT COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS met_mail,
        COUNT(*) FILTER (WHERE website = '')::int AS zonder_site,
        COUNT(*) FILTER (WHERE status = 'kandidaat')::int AS te_onderzoeken,
        COUNT(*) FILTER (WHERE status = 'nieuw')::int AS klaar,
        COUNT(*) FILTER (WHERE status IN ${VERSTUURD})::int AS verstuurd,
        COUNT(*) FILTER (WHERE reply_at IS NOT NULL OR status IN ('reactie','afspraak','klant'))::int AS reacties,
        COUNT(*) FILTER (WHERE status IN ('afspraak','klant'))::int AS afspraken,
        COUNT(*) FILTER (WHERE status = 'klant')::int AS klanten,
        COUNT(*) FILTER (WHERE status = 'afgemeld')::int AS afgemeld,
        COUNT(*) FILTER (WHERE status = 'fout' AND error ILIKE '%bounce%')::int AS bounces,
        COUNT(*) FILTER (WHERE status = 'overgeslagen')::int AS overgeslagen
      FROM leads`),
    one(`SELECT
        (SELECT COUNT(*)::int FROM leads WHERE created_at >= ${T0}) AS gevonden,
        (SELECT COUNT(*)::int FROM leads WHERE researched_at >= ${T0}) AS onderzocht,
        (SELECT COUNT(*)::int FROM concepts WHERE ready_at >= ${T0}) AS concepten,
        (SELECT COUNT(*)::int FROM mail_log WHERE kind LIKE 'b2b-%' AND ok AND created_at >= ${T0}) AS verstuurd,
        (SELECT COUNT(*)::int FROM mail_log WHERE kind = 'b2b-opvolging' AND ok AND created_at >= ${T0}) AS opvolgingen,
        (SELECT COUNT(*)::int FROM leads WHERE reply_at >= ${T0}) AS reacties,
        (SELECT COUNT(*)::int FROM concepts WHERE first_view_at >= ${T0}) AS bekeken`),
    q(`SELECT COALESCE(NULLIF(l.category,''),'(geen)') AS naam, COUNT(*)::int AS gevonden,
        COUNT(*) FILTER (WHERE l.email IS NOT NULL)::int AS met_mail,
        COUNT(*) FILTER (WHERE l.status IN ${VERSTUURD})::int AS verstuurd,
        COUNT(*) FILTER (WHERE c.views > 0)::int AS bekeken,
        COUNT(*) FILTER (WHERE l.reply_at IS NOT NULL OR l.status IN ('reactie','afspraak','klant'))::int AS reacties,
        COUNT(*) FILTER (WHERE l.status IN ('afspraak','klant'))::int AS afspraken
      FROM leads l LEFT JOIN concepts c ON c.lead_id = l.id GROUP BY 1 ORDER BY gevonden DESC LIMIT 30`),
    q(`SELECT COALESCE(NULLIF(city,''),'(onbekend)') AS naam, COUNT(*)::int AS gevonden, COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS met_mail,
        COUNT(*) FILTER (WHERE status IN ${VERSTUURD})::int AS verstuurd, COUNT(*) FILTER (WHERE reply_at IS NOT NULL OR status IN ('reactie','afspraak','klant'))::int AS reacties
      FROM leads GROUP BY 1 ORDER BY gevonden DESC LIMIT 15`),
    q(`WITH d AS (SELECT generate_series(0, 13) AS i), dag AS (SELECT to_char((NOW() AT TIME ZONE 'Europe/Amsterdam')::date - i, 'YYYY-MM-DD') AS dag FROM d)
       SELECT dag.dag,
        (SELECT COUNT(*)::int FROM leads WHERE to_char(created_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD') = dag.dag) AS gevonden,
        (SELECT COUNT(*)::int FROM mail_log WHERE kind LIKE 'b2b-%' AND ok AND to_char(created_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD') = dag.dag) AS verstuurd,
        (SELECT COUNT(*)::int FROM leads WHERE to_char(reply_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD') = dag.dag) AS reacties,
        (SELECT COUNT(DISTINCT lead_id)::int FROM mail_events WHERE soort = 'open' AND to_char(created_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD') = dag.dag) AS geopend
       FROM dag ORDER BY dag.dag`),
    one("SELECT COUNT(*) FILTER (WHERE status = 'goedgekeurd')::int AS eerste, COUNT(*) FILTER (WHERE status = 'opvolging_goedgekeurd')::int AS opvolging FROM leads"),
    q("SELECT source, COUNT(*)::int AS n FROM leads GROUP BY source"),
  ]);
  const max = Number(s.b2b.dailyMax || 40);
  const [van, tot2] = s.b2b.sendHours || [8, 17];
  const now = new Date();
  const wd = new Date(dayKey(now) + "T12:00:00Z").getUTCDay();
  const h = hourAms(now);
  const weekend = wd === 0 || wd === 6;
  const venster = env("B2B_ANY_TIME") === "1" || (!weekend && h >= van && h < tot2);
  const rest = Math.max(0, max - vandaag.verstuurd);
  const cats = (sc.categories || []).filter(Boolean), places = (sc.places || []).filter(Boolean);
  const plan = cats.map((cat) => {
    const i = (st.cursor?.[cat] || 0);
    return { categorie: cat, volgende: places.length ? places[i % places.length] : "", gedaan: places.length ? i % places.length : 0, rondes: places.length ? Math.floor(i / places.length) : 0 };
  });
  return {
    scout: { klaar: scoutReady(), actief: !!sc.active, perDag: sc.perDay || 20, categorieen: cats, plaatsen: places, plan, laatsteDag: st.lastDay || null, bezig: (st.pending || []).length, geschiedenis: (st.history || []).slice(0, 25) },
    verzenden: { mail: mailReady(), max, vandaag: vandaag.verstuurd, opvolgingen: vandaag.opvolgingen, rest, wachtrij, uren: [van, tot2], open: venster && mailReady(), weekend,
      nogTeVersturenVandaag: venster ? Math.min(rest, wachtrij.eerste + wachtrij.opvolging) : 0 },
    vandaag, totaal: tot, bron: Object.fromEntries(bron.map((b) => [b.source, b.n])),
    perCategorie: perCat, perPlaats, dagen, inbox, mail: await mailPrestaties(), meten: { opens: s.b2b.meten?.opens !== false, kliks: s.b2b.meten?.kliks !== false },
  };
}
