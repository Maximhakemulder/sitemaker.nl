// B2B-overzicht voor HQ: waar de scout zoekt, wat er gevonden is, wat er vandaag verstuurd kan worden en wat het oplevert.
import { q, one, getSettings, env, dayKey, hourAms } from "./core.mjs";
import { mailReady } from "./mail.mjs";
import { scoutReady } from "./b2b.mjs";

const T0 = "(date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')";
const VERSTUURD = "('verstuurd','opvolging_goedgekeurd','opgevolgd','reactie','afspraak','klant','afgemeld')";

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
        (SELECT COUNT(*)::int FROM leads WHERE to_char(reply_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM-DD') = dag.dag) AS reacties
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
    perCategorie: perCat, perPlaats, dagen, inbox,
  };
}
