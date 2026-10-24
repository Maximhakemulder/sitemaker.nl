// Het bedrijf in HQ: per afdeling de cijfers, wat elke medewerker vandaag deed, een logboek,
// een dagelijkse briefing van de manager en de directeur, en vragen aan managers.
// Alles komt uit de echte gegevens in de database; er wordt niets verzonnen.
import crypto from "node:crypto";
import { q, one, env, str, fail, euro, getSettings, saveSetting, publicBase, dayKey, hourAms, OFFER } from "./core.mjs";
import { claude, aiReady } from "./ai.mjs";
import { mailReady } from "./mail.mjs";
import { mollieReady } from "./mollie.mjs";
import { scoutReady } from "./b2b.mjs";

// Managers (zelfde namen als public/hq/org.js).
export const DEPTS = {
  directie: { name: "Directie", manager: "Victor", role: "algemeen directeur" },
  marketing: { name: "Marketing & Design", manager: "Lisa", role: "performance marketeer" },
  b2b: { name: "B2B Verkoop", manager: "Noah", role: "verkoopmanager" },
  projecten: { name: "Projecten", manager: "Iris", role: "projectmanager" },
  klantenservice: { name: "Klantenservice", manager: "Emma", role: "klantenservice-medewerker" },
  incidenten: { name: "Incidenten", manager: "Kees", role: "monitoring-specialist" },
  finance: { name: "Finance", manager: "Bram", role: "controller" },
};

const T0 = "(date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')";
const n = async (sql, p = []) => (await one(sql, p))?.n ?? 0;
const nl = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
const recent = (iso, min = 15) => !!iso && Date.now() - new Date(iso).getTime() < min * 60000;

// Hartslag van de geplande rondes (tick): wie heeft net echt iets gedaan.
export async function pulse(name, result) {
  const done = result && ["added", "done", "started", "sent", "checked", "submitted"].map((k) => Number(result[k] || 0)).reduce((a, b) => a + b, 0);
  if (!done) return;
  const cur = (await one("SELECT value FROM settings WHERE key = 'team_pulse'"))?.value || {};
  cur[name] = { at: new Date().toISOString(), n: done };
  await saveSetting("team_pulse", cur).catch(() => {});
}

// ---------------------------------------------------------------- per afdeling
async function b2b(pulseData) {
  const [scout, research, kandidaten, concepten, conceptBezig, beoordelen, bekeken, verstuurd, reacties, wachtrij] = await Promise.all([
    n(`SELECT COUNT(*)::int AS n FROM leads WHERE source = 'scout' AND created_at >= ${T0}`),
    n(`SELECT COUNT(*)::int AS n FROM leads WHERE researched_at >= ${T0}`),
    n("SELECT COUNT(*)::int AS n FROM leads WHERE status = 'kandidaat'"),
    n(`SELECT COUNT(*)::int AS n FROM concepts WHERE ready_at >= ${T0}`),
    n("SELECT COUNT(*)::int AS n FROM concepts WHERE status IN ('wachtrij','bezig')"),
    n("SELECT COUNT(*)::int AS n FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.status = 'klaar' AND l.status = 'nieuw'"),
    n("SELECT COUNT(*)::int AS n FROM concepts WHERE first_view_at > NOW() - INTERVAL '7 days'"),
    n(`SELECT COUNT(*)::int AS n FROM mail_log WHERE kind LIKE 'b2b-%' AND ok AND created_at >= ${T0}`),
    n("SELECT COUNT(*)::int AS n FROM leads WHERE status = 'reactie'"),
    n("SELECT COUNT(*)::int AS n FROM leads WHERE status IN ('goedgekeurd','opvolging_goedgekeurd')"),
  ]);
  const bezig = await one("SELECT 1 AS x FROM concepts WHERE status = 'bezig' LIMIT 1");
  return {
    metrics: [
      { label: "concepten te beoordelen", value: beoordelen, alarm: beoordelen > 0, href: "#concepten" },
      { label: "concepten bekeken (7 dagen)", value: bekeken, alarm: bekeken > 0, href: "#concepten" },
      { label: "mails verstuurd vandaag", value: verstuurd, href: "#b2b" },
      { label: "reacties te beantwoorden", value: reacties, alarm: reacties > 0, href: "#b2b" },
    ],
    people: {
      scout: { text: scoutReady() ? (scout ? `Vond vandaag ${nl(scout, "bedrijf", "bedrijven")}` : "Zoekt de volgende werkdag weer nieuwe bedrijven") : "Wacht op de Outscraper-sleutel", busy: recent(pulseData.scout?.at) },
      researcher: { text: research ? `Onderzocht vandaag ${nl(research, "website", "websites")}${kandidaten ? `, nog ${kandidaten} te doen` : ""}` : kandidaten ? `${nl(kandidaten, "website", "websites")} in de wachtrij` : "Alles onderzocht", busy: recent(pulseData.research?.at) },
      conceptmaker: { text: !aiReady() ? "Wacht op de Claude-koppeling" : concepten ? `Maakte vandaag ${nl(concepten, "concept", "concepten")}${conceptBezig ? `, ${conceptBezig} in de maak` : ""}` : conceptBezig ? `${nl(conceptBezig, "concept", "concepten")} in de maak` : "Geen concepten in de wachtrij", busy: !!bezig || recent(pulseData.concepten?.at) },
      postkamer: { text: !mailReady() ? "Wacht tot de mail is ingesteld" : `${nl(verstuurd, "mail", "mails")} verstuurd vandaag${wachtrij ? `, ${wachtrij} in de wachtrij` : ""}`, busy: recent(pulseData["b2b-send"]?.at) },
      verkoopmanager: { text: beoordelen ? `${beoordelen === 1 ? "1 concept wacht" : `${beoordelen} concepten wachten`} op jouw akkoord` : "Team draait", busy: false },
    },
  };
}

async function projecten() {
  const [open, telaat, voorstellen, bezig, verwerktMaand, bouwen] = await Promise.all([
    n("SELECT COUNT(*)::int AS n FROM change_requests WHERE status IN ('ontvangen','in_behandeling')"),
    n(`SELECT COUNT(*)::int AS n FROM change_requests WHERE status IN ('ontvangen','in_behandeling') AND created_at < NOW() - INTERVAL '${OFFER.changeHours} hours'`),
    n("SELECT COUNT(*)::int AS n FROM change_requests WHERE ai_status = 'voorstel'"),
    n("SELECT COUNT(*)::int AS n FROM change_requests WHERE ai_status IN ('wachtrij','bezig')"),
    n("SELECT COUNT(*)::int AS n FROM change_requests WHERE status = 'verwerkt' AND done_at >= date_trunc('month', NOW())"),
    q("SELECT company, intake_at FROM customers WHERE onboarding AND intake_at IS NOT NULL AND site_status = 'in_aanbouw' ORDER BY intake_at"),
  ]);
  return {
    metrics: [
      { label: "open wijzigingen", value: open, alarm: telaat > 0, sub: telaat ? `${telaat} over de 48 uur` : "", href: "#wijzigingen" },
      { label: "voorstellen om goed te keuren", value: voorstellen, alarm: voorstellen > 0, href: "#wijzigingen/voorstel" },
      { label: "nieuwe sites in aanbouw", value: bouwen.length, alarm: bouwen.length > 0, href: "#klanten" },
      { label: "wijzigingen verwerkt deze maand", value: verwerktMaand, href: "#wijzigingen" },
    ],
    people: {
      projectmanager: { text: telaat ? `${telaat} wijzigingen over de 48 uur!` : open ? `${nl(open, "open wijziging", "open wijzigingen")}, alles binnen de tijd` : "Geen open wijzigingen", busy: false },
      webbouwer: { text: bezig ? `Werkt aan ${nl(bezig, "wijziging", "wijzigingen")}` : voorstellen ? `${nl(voorstellen, "voorstel", "voorstellen")} klaar voor jou` : "Geen wijzigingen in behandeling", busy: bezig > 0 },
      opleveraar: { text: bouwen.length ? `Bouwt ${bouwen.length} nieuwe site${bouwen.length > 1 ? "s" : ""}: ${bouwen.slice(0, 2).map((b) => b.company).join(", ")}` : "Geen nieuwe sites in aanbouw", busy: bouwen.length > 0 },
    },
  };
}

async function klantenservice() {
  const [vandaag, komend, geboekt, vast, starters] = await Promise.all([
    n(`SELECT COUNT(*)::int AS n FROM appointments WHERE status <> 'geannuleerd' AND starts_at >= ${T0} AND starts_at < ${T0} + INTERVAL '1 day'`),
    n("SELECT COUNT(*)::int AS n FROM appointments WHERE status <> 'geannuleerd' AND starts_at >= NOW() AND starts_at < NOW() + INTERVAL '7 days'"),
    n(`SELECT COUNT(*)::int AS n FROM appointments WHERE created_at >= ${T0}`),
    q(`SELECT company, CASE WHEN details_at IS NULL THEN 'gegevens' WHEN started_at IS NULL THEN 'betalen' ELSE 'informatie' END AS stap FROM customers
       WHERE onboarding AND site_status = 'in_aanbouw' AND intake_at IS NULL AND COALESCE(started_at, details_at, created_at) < NOW() - INTERVAL '2 days' ORDER BY created_at LIMIT 10`),
    n("SELECT COUNT(*)::int AS n FROM customers WHERE onboarding AND intake_at IS NULL AND site_status = 'in_aanbouw'"),
  ]);
  return {
    metrics: [
      { label: "kennismakingen vandaag", value: vandaag, href: "#aanvragen" },
      { label: "kennismakingen komende 7 dagen", value: komend, href: "#aanvragen" },
      { label: "klanten die vastlopen in hun start", value: vast.length, alarm: vast.length > 0, href: "#overzicht" },
      { label: "nieuwe klanten in hun start", value: starters, href: "#overzicht" },
    ],
    people: {
      service: { text: vast.length ? `${vast.length} klanten lopen vast (o.a. ${vast[0].company} bij ${vast[0].stap})` : starters ? `${starters} klanten zijn op weg in hun start` : "Geen klanten in hun start", busy: false },
      agenda: { text: vandaag ? `${nl(vandaag, "kennismaking", "kennismakingen")} vandaag` : komend ? `${nl(komend, "kennismaking", "kennismakingen")} deze week` : "Nog geen kennismakingen gepland", busy: geboekt > 0 },
    },
    vast,
  };
}

async function incidenten(pulseData) {
  const [live, offline, laatste] = await Promise.all([
    n("SELECT COUNT(*)::int AS n FROM customers WHERE site_status = 'live' AND site_url <> ''"),
    q("SELECT company, site_url, check_error FROM customers WHERE site_status = 'live' AND check_ok = FALSE AND check_fails >= 2"),
    one("SELECT MAX(check_at) AS at, ROUND(AVG(check_ms) FILTER (WHERE check_ok))::int AS ms FROM customers WHERE site_status = 'live'"),
  ]);
  return {
    metrics: [
      { label: "live sites", value: live, href: "#sites" },
      { label: "offline", value: offline.length, alarm: offline.length > 0, href: "#sites" },
      { label: "gemiddelde laadtijd", value: laatste?.ms ? `${laatste.ms} ms` : "–", href: "#sites" },
    ],
    people: {
      monitor: { text: !live ? "Nog geen live sites om te bewaken" : offline.length ? `${offline.length} site${offline.length > 1 ? "s" : ""} offline: ${offline.map((o) => o.company).join(", ")}` : `Alle ${live} sites online`, busy: recent(pulseData.uptime?.at), at: laatste?.at },
    },
    offline,
  };
}

async function finance() {
  const [mrr, actief, maand, open, mislukt] = await Promise.all([
    n("SELECT COALESCE(SUM(monthly_cents),0)::int AS n FROM customers WHERE billing_status IN ('actief','handmatig')"),
    n("SELECT COUNT(*)::int AS n FROM customers WHERE billing_status IN ('actief','handmatig')"),
    n("SELECT COALESCE(SUM(amount_cents),0)::int AS n FROM invoices WHERE status = 'betaald' AND paid_at >= date_trunc('month', NOW())"),
    one("SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents),0)::int AS bedrag FROM invoices WHERE status IN ('open','vervallen')"),
    n("SELECT COUNT(*)::int AS n FROM customers WHERE billing_status = 'betaling_mislukt'"),
  ]);
  return {
    metrics: [
      { label: "abonnementen per maand (MRR)", value: euro(mrr), href: "#betalingen" },
      { label: "actieve abonnementen", value: actief, href: "#klanten" },
      { label: "ontvangen deze maand", value: euro(maand), href: "#facturen" },
      { label: "openstaande facturen", value: `${open.n} · ${euro(open.bedrag)}`, alarm: open.n > 0, href: "#facturen" },
      { label: "mislukte betalingen", value: mislukt, alarm: mislukt > 0, href: "#betalingen" },
    ],
    people: {
      controller: { text: !mollieReady() ? "Wacht op de Mollie-koppeling voor automatische betalingen" : mislukt ? `${nl(mislukt, "mislukte betaling", "mislukte betalingen")} om op te volgen` : `MRR ${euro(mrr)} uit ${actief} abonnementen`, busy: false },
    },
  };
}

async function marketing() {
  const meta = await one("SELECT * FROM team_reports WHERE dept = 'marketing' AND kind = 'meta' ORDER BY created_at DESC LIMIT 1");
  const ads = await q("SELECT * FROM team_reports WHERE dept = 'marketing' AND kind = 'statics' ORDER BY created_at DESC LIMIT 1");
  const m = meta?.data || {};
  return {
    live: !!meta || ads.length > 0,
    metrics: meta ? [
      { label: "uitgegeven (7 dagen)", value: m.spend != null ? euro(Math.round(m.spend * 100)) : "–" },
      { label: "kliks (7 dagen)", value: m.clicks ?? "–" },
      { label: "afspraken via ads (7 dagen)", value: m.leads ?? "–" },
    ] : [{ label: "Meta-rapport", value: "nog niet", sub: "Wacht op de geplande taak" }],
    people: {
      marketeer: { text: meta ? `Laatste Meta-rapport: ${meta.title || new Date(meta.created_at).toLocaleDateString("nl-NL")}` : "Wacht op de koppeling met Meta via Windsor", busy: recent(meta?.created_at, 60) },
      designer: { text: ads.length ? `${(ads[0].data.ads || []).length} statics gemaakt (${new Date(ads[0].created_at).toLocaleDateString("nl-NL")})` : "Maakt elke maandag 5 statics zodra de taak loopt", busy: recent(ads[0]?.created_at, 60) },
    },
    meta, statics: ads[0] || null,
  };
}

// ---------------------------------------------------------------- logboek
const FEED_ACTIONS = {
  "concept.bekeken": ["b2b", "Sam", "{lead} bekeek het concept"],
  "site.aangemaakt": ["projecten", "Lotte", "Repo en site aangemaakt voor {klant}"],
  "start.informatie": ["projecten", "Lotte", "{klant} leverde de informatie aan: bouwen"],
  "start.betaald": ["finance", "Bram", "Eerste betaling binnen van {klant}"],
  "start.gegevens": ["klantenservice", "Emma", "{klant} vulde de bedrijfsgegevens in"],
  "start.akkoord": ["klantenservice", "Emma", "{klant} ging akkoord en gaat betalen"],
  "wijziging.ingediend": ["projecten", "Iris", "Nieuwe wijziging van {klant}"],
  "wijziging.goedgekeurd": ["projecten", "Daan", "Wijziging van {klant} staat live"],
  "abonnement.gestart": ["finance", "Bram", "Abonnement gestart voor {klant}"],
  "abonnement.opgezegd": ["finance", "Bram", "Abonnement opgezegd: {klant}"],
  "factuur.aangemaakt": ["finance", "Bram", "Factuur {nummer} gemaakt voor {klant}"],
  "incident.offline": ["incidenten", "Kees", "{klant} is offline"],
  "incident.online": ["incidenten", "Kees", "{klant} is weer online"],
  "klant.aangemaakt": ["klantenservice", "Emma", "Nieuwe klant: {klant}"],
};
export async function feed(limit = 60) {
  const audit = await q(`SELECT a.action, a.detail, a.created_at, c.company FROM audit_log a LEFT JOIN customers c ON c.id = a.customer_id
                         WHERE a.action = ANY($1) ORDER BY a.created_at DESC LIMIT 80`, [Object.keys(FEED_ACTIONS)]);
  const leadIds = audit.filter((a) => a.action === "concept.bekeken").map((a) => a.detail?.lead).filter(Boolean);
  const leadNames = leadIds.length ? Object.fromEntries((await q("SELECT id, company FROM leads WHERE id = ANY($1)", [leadIds])).map((l) => [l.id, l.company])) : {};
  const items = audit.map((a) => {
    const [dept, wie, tpl] = FEED_ACTIONS[a.action];
    return { dept, wie, at: a.created_at, text: tpl.replace("{klant}", a.company || "een klant").replace("{lead}", leadNames[a.detail?.lead] || "Een lead").replace("{nummer}", a.detail?.number || "") };
  });
  const [concepten, mails, research, afspraken, voorstellen, betalingen] = await Promise.all([
    q("SELECT l.company, COALESCE(c.ready_at, c.updated_at) AS at, c.status, c.reden FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.updated_at > NOW() - INTERVAL '7 days' AND c.status IN ('klaar','overgeslagen') ORDER BY c.updated_at DESC LIMIT 15"),
    q("SELECT to_email, kind, created_at AS at FROM mail_log WHERE kind LIKE 'b2b-%' AND ok ORDER BY created_at DESC LIMIT 15"),
    q("SELECT company, email, researched_at AS at, status FROM leads WHERE researched_at > NOW() - INTERVAL '7 days' ORDER BY researched_at DESC LIMIT 15"),
    q("SELECT company, starts_at, created_at AS at, status FROM appointments WHERE created_at > NOW() - INTERVAL '14 days' ORDER BY created_at DESC LIMIT 15"),
    q("SELECT c.company, cr.ai_updated_at AS at FROM change_requests cr JOIN customers c ON c.id = cr.customer_id WHERE cr.ai_status = 'voorstel' ORDER BY cr.ai_updated_at DESC LIMIT 10"),
    q("SELECT c.company, p.amount_cents, p.kind, p.paid_at AS at FROM payments p JOIN customers c ON c.id = p.customer_id WHERE p.status = 'paid' AND p.paid_at IS NOT NULL ORDER BY p.paid_at DESC LIMIT 10"),
  ]);
  concepten.forEach((c) => c.at && items.push({ dept: "b2b", wie: "Sam", at: c.at, text: c.status === "klaar" ? `Concept-website gemaakt voor ${c.company}` : `${c.company} overgeslagen: ${c.reden}` }));
  mails.forEach((m) => items.push({ dept: "b2b", wie: "Ties", at: m.at, text: `${m.kind === "b2b-opvolging" ? "Opvolgmail" : "Mail"} verstuurd naar ${m.to_email}` }));
  research.forEach((r) => r.at && items.push({ dept: "b2b", wie: "Fleur", at: r.at, text: r.status === "overgeslagen" ? `${r.company} onderzocht: niet bruikbaar` : `${r.company} onderzocht${r.email ? `: ${r.email}` : ""}` }));
  afspraken.forEach((a) => items.push({ dept: "klantenservice", wie: "Ruben", at: a.at, text: a.starts_at ? `Kennismaking geboekt door ${a.company}${a.status === "geannuleerd" ? " (geannuleerd)" : ""}` : `Terugbelverzoek van ${a.company}` }));
  voorstellen.forEach((v) => v.at && items.push({ dept: "projecten", wie: "Daan", at: v.at, text: `Voorstel klaar voor ${v.company}` }));
  betalingen.forEach((p) => items.push({ dept: "finance", wie: "Bram", at: p.at, text: `${euro(p.amount_cents)} ontvangen van ${p.company}` }));
  const mk = await q("SELECT agent, title, created_at AS at FROM team_reports WHERE dept = 'marketing' ORDER BY created_at DESC LIMIT 10");
  mk.forEach((r) => items.push({ dept: "marketing", wie: r.agent === "designer" ? "Milo" : "Lisa", at: r.at, text: r.title }));
  return items.filter((i) => i.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}

// ---------------------------------------------------------------- alles samen (voor HQ)
export async function teamState() {
  const pulseData = (await one("SELECT value FROM settings WHERE key = 'team_pulse'"))?.value || {};
  const [B, P, K, I, F, M, lijst, briefings] = await Promise.all([b2b(pulseData), projecten(), klantenservice(), incidenten(pulseData), finance(), marketing(), feed(80),
    q(`SELECT dept, text, ai, created_at FROM team_briefings WHERE day = $1`, [dayKey()])]);
  const depts = { b2b: B, projecten: P, klantenservice: K, incidenten: I, finance: F, marketing: M };
  const busy = {};
  for (const d of Object.values(depts)) for (const [k, v] of Object.entries(d.people)) busy[k] = !!v.busy;
  const brief = Object.fromEntries(briefings.map((b) => [b.dept, { text: b.text, ai: b.ai, at: b.created_at }]));
  const beslissingen = [
    B.metrics[0].value && { text: `${B.metrics[0].value === 1 ? "1 concept wacht" : `${B.metrics[0].value} concepten wachten`} op jouw akkoord`, href: "#concepten" },
    P.metrics[1].value && { text: `${P.metrics[1].value} voorstellen voor wijzigingen goedkeuren`, href: "#wijzigingen/voorstel" },
    P.metrics[0].alarm && { text: P.metrics[0].sub, href: "#wijzigingen" },
    B.metrics[3].value && { text: `${B.metrics[3].value} reacties op B2B-mails beantwoorden`, href: "#b2b" },
    K.vast.length && { text: `${K.vast.length} nieuwe klanten lopen vast in hun start`, href: "#overzicht" },
    I.offline.length && { text: `${I.offline.length} klantsites offline`, href: "#sites" },
    F.metrics[4].value && { text: `${F.metrics[4].value} mislukte betalingen`, href: "#betalingen" },
  ].filter(Boolean);
  const pd = (k) => ({ ...depts[k], briefing: brief[k] || null, feed: lijst.filter((f) => f.dept === k).slice(0, 25) });
  return {
    depts: { b2b: pd("b2b"), projecten: pd("projecten"), klantenservice: pd("klantenservice"), incidenten: pd("incidenten"), finance: pd("finance"), marketing: pd("marketing"),
      directie: { metrics: [], people: { directeur: { text: brief.directie ? "Briefing van vandaag staat klaar" : "Schrijft de briefing elke ochtend na 8:00", busy: false }, jij: { text: beslissingen.length ? `${beslissingen.length} dingen wachten op jou` : "Niets dat op je wacht", busy: true } }, briefing: brief.directie || null, feed: lijst.slice(0, 25) } },
    busy, beslissingen, feed: lijst.slice(0, 30), marketingLive: M.live, ai: aiReady(),
  };
}

// ---------------------------------------------------------------- briefings
const STIJL = `Je bent een medewerker van Sitemaker (websitebouwer voor het mkb: €299,95 eenmalig + €69,95 per maand, ${OFFER.changesPerMonth} wijzigingen per maand binnen 48 uur, nieuwe site binnen ${OFFER.deliveryText}). Je schrijft voor Maxim, de eigenaar.
Schrijf in het Nederlands, kort en concreet, in de jij-vorm. Gebruik ALLEEN de cijfers en feiten die je krijgt; verzin niets en geef geen schattingen alsof het feiten zijn. Geen opsmuk, geen emoji's.`;

function fallbackBriefing(key, d) {
  const regels = (d.metrics || []).map((m) => `- ${m.label}: ${m.value}${m.sub ? ` (${m.sub})` : ""}`);
  const mensen = Object.values(d.people || {}).map((p) => `- ${p.text}`);
  return [...regels, ...mensen].join("\n");
}

async function managerBriefing(key, d) {
  const info = DEPTS[key];
  const data = { cijfers: d.metrics, team: d.people, logboekLaatste24u: (d.feed || []).filter((f) => Date.now() - new Date(f.at) < 86400000).slice(0, 20).map((f) => `${f.wie}: ${f.text}`) };
  if (!aiReady()) return { text: fallbackBriefing(key, d), ai: false };
  const text = await claude({
    system: `${STIJL}\nJij bent ${info.manager}, ${info.role} van de afdeling ${info.name}.`,
    prompt: `Schrijf je ochtendbriefing voor Maxim over jouw afdeling (max. 6 korte regels): hoe staat het ervoor, wat ging er goed, wat vraagt aandacht. Eindig met "Voor jou:" en de concrete acties die alleen Maxim kan doen (of "niets"). Gegevens:\n${JSON.stringify(data)}`,
    maxTokens: 1500, timeoutMs: 90000,
  });
  return { text: str(text, 3000), ai: true };
}

export async function runBriefings({ force = false } = {}) {
  const day = dayKey();
  const st = await teamState();
  const done = Object.fromEntries((await q("SELECT dept FROM team_briefings WHERE day = $1", [day])).map((r) => [r.dept, true]));
  const keys = ["b2b", "projecten", "klantenservice", "incidenten", "finance"].concat(st.marketingLive ? ["marketing"] : []);
  const teksten = {};
  for (const k of keys) {
    if (done[k] && !force) continue;
    try {
      const b = await managerBriefing(k, st.depts[k]);
      teksten[k] = b.text;
      await q("INSERT INTO team_briefings (dept, day, text, ai) VALUES ($1,$2,$3,$4) ON CONFLICT (dept, day) DO UPDATE SET text = EXCLUDED.text, ai = EXCLUDED.ai, created_at = NOW()", [k, day, b.text, b.ai]);
    } catch (e) { console.log("[team] briefing", k, e.message); }
  }
  // Directeur: leest alle briefings van vandaag.
  const alle = await q("SELECT dept, text FROM team_briefings WHERE day = $1 AND dept <> 'directie'", [day]);
  let text = "", ai = false;
  if (aiReady() && alle.length) {
    try {
      text = str(await claude({
        system: `${STIJL}\nJij bent Victor, algemeen directeur van Sitemaker.`,
        prompt: `Lees de briefings van je managers en schrijf de directiebriefing voor Maxim (max. 8 korte regels). Begin met één zin over hoe het bedrijf ervoor staat. Dan "Vandaag voor jou:" met maximaal 3 beslissingen of acties, belangrijkste eerst. Dan eventueel "Let op:" voor risico's.\nOpenstaande beslissingen volgens HQ: ${JSON.stringify(st.beslissingen.map((b) => b.text))}\n\nBriefings:\n${alle.map((b) => `## ${DEPTS[b.dept]?.name || b.dept}\n${b.text}`).join("\n\n")}`,
        maxTokens: 1500, timeoutMs: 90000,
      }), 3000);
      ai = true;
    } catch (e) { console.log("[team] directeur", e.message); }
  }
  if (!text) text = st.beslissingen.length ? `Vandaag voor jou:\n${st.beslissingen.map((b) => `- ${b.text}`).join("\n")}` : "Er wacht vandaag niets op jou. Alle afdelingen draaien.";
  await q("INSERT INTO team_briefings (dept, day, text, ai) VALUES ('directie',$1,$2,$3) ON CONFLICT (dept, day) DO UPDATE SET text = EXCLUDED.text, ai = EXCLUDED.ai, created_at = NOW()", [day, text, ai]);
  return { done: keys.length + 1 };
}

// ---------------------------------------------------------------- vragen aan managers
export async function askQuestion(user, b) {
  const dept = DEPTS[b.dept] ? b.dept : "directie";
  const question = str(b.vraag, 1000);
  if (question.length < 3) fail(400, "Stel een vraag.", { field: "vraag" });
  const r = await one("INSERT INTO team_questions (dept, question, user_id) VALUES ($1,$2,$3) RETURNING id", [dept, question, user.id]);
  await trigger({ kind: "vraag", id: r.id });
  return { id: r.id };
}
export async function answerQuestion(id) {
  const v = await one("SELECT * FROM team_questions WHERE id = $1 AND status = 'open'", [id]);
  if (!v) return;
  try {
    if (!aiReady()) throw new Error("Claude is nog niet gekoppeld (ANTHROPIC_API_KEY of AI Gateway).");
    const st = await teamState();
    const info = DEPTS[v.dept];
    const ctx = v.dept === "directie" ? { beslissingen: st.beslissingen, afdelingen: Object.fromEntries(Object.entries(st.depts).map(([k, d]) => [k, { cijfers: d.metrics, team: d.people }])) } : { cijfers: st.depts[v.dept].metrics, team: st.depts[v.dept].people, logboek: st.depts[v.dept].feed.slice(0, 20).map((f) => `${new Date(f.at).toLocaleString("nl-NL")} ${f.wie}: ${f.text}`), briefing: st.depts[v.dept].briefing?.text };
    const answer = await claude({ system: `${STIJL}\nJij bent ${info.manager}, ${info.role} (${info.name}). Weet je iets niet uit de gegevens, zeg dat eerlijk en zeg wat Maxim kan doen om het te weten.`, prompt: `Vraag van Maxim: ${v.question}\n\nGegevens van je afdeling:\n${JSON.stringify(ctx)}`, maxTokens: 1500, timeoutMs: 90000 });
    await q("UPDATE team_questions SET answer = $2, status = 'klaar', answered_at = NOW() WHERE id = $1", [id, str(answer, 4000)]);
  } catch (e) {
    await q("UPDATE team_questions SET answer = $2, status = 'fout', answered_at = NOW() WHERE id = $1", [id, str(e.message, 500)]);
  }
}
export async function listQuestions(dept) {
  const rows = await q("SELECT * FROM team_questions WHERE dept = $1 ORDER BY created_at DESC LIMIT 10", [DEPTS[dept] ? dept : "directie"]);
  return rows.map((r) => ({ id: r.id, vraag: r.question, antwoord: r.answer, status: r.status, at: r.created_at }));
}

// ---------------------------------------------------------------- achtergrond
const triggerKey = (s) => crypto.createHash("sha256").update(`${env("AUTH_SECRET", "x")}:team:${s}`).digest("hex");
export const checkTeamKey = (s, key) => { const a = Buffer.from(String(key || "")), b = Buffer.from(triggerKey(s)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
export async function runJob(job) {
  if (job.kind === "vraag") return answerQuestion(Number(job.id));
  if (job.kind === "briefings") return runBriefings({ force: !!job.force });
}
async function trigger(job) {
  if (env("SM_INLINE_AI") === "1") return runJob(job).catch((e) => console.log("[team]", e.message));
  const s = JSON.stringify(job);
  await fetch(`${env("URL") || publicBase()}/.netlify/functions/team-background`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job, key: triggerKey(s) }), signal: AbortSignal.timeout(5000) })
    .catch((e) => console.log("[team] trigger", e.message));
}
export async function refreshBriefings() { await trigger({ kind: "briefings", force: true }); return { ok: true }; }

// tick: elke dag na 8:00 de briefings (één keer).
export async function maybeBriefings() {
  const day = dayKey();
  if (hourAms() < 8) return { skipped: true };
  const st = (await one("SELECT value FROM settings WHERE key = 'team_briefing_day'"))?.value;
  if (st?.day === day) return { skipped: true };
  await saveSetting("team_briefing_day", { day, at: new Date().toISOString() });
  await trigger({ kind: "briefings" });
  return { started: 1 };
}
