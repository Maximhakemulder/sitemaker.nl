// Netlify-credits bewaken. Bij 100% zet Netlify alles op pauze (sites offline), dus:
// - elke 30 minuten (tick) schatten we het verbruik in de lopende factuurperiode;
// - bij 75% en 90%: één mail aan Maxim + melding bovenaan HQ;
// - vanaf 75% gaat de spaarstand aan: geen leads zoeken, geen concepten scannen, geen AI-briefings, minder vaak controleren.
//   Mail versturen, betalingen, klantvragen, wijzigingen en klantsites lopen gewoon door.
// Bronnen: Netlify-API (capabilities.credits.used, als die iets geeft; vaak 0 door een bug bij Netlify), anders onze schatting:
// productiedeploys van alle projecten × 15 + rekentijd van onze functies (5 credits per GB-uur, 1 GB) + AI Gateway (tokens × tarief).
// Bandbreedte en webverzoeken meten we niet; daarom kan Maxim het echte getal uit Netlify invullen (ijkpunt).
import { q, one, env, getSettings, saveSetting, audit } from "./core.mjs";
import { notifyStaff } from "./mail.mjs";

export const CREDIT_KOSTEN = { deploy: 15, gbUur: 5, perUsd: 180 };
const DREMPELS = [75, 90, 100];
const dag = 86400000;

// Begin van de factuurperiode: de laatste keer dat het de periodedag was (Europe/Amsterdam-datum).
export function periodeStart(periodeDag, nu = new Date()) {
  const d = Math.min(28, Math.max(1, Number(periodeDag) || 1));
  const vandaag = new Date(nu.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  let y = vandaag.getFullYear(), m = vandaag.getMonth();
  if (vandaag.getDate() < d) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Meten (rekentijd en AI). Faalt nooit hard. De periodedag wordt even onthouden (scheelt een query per verzoek).
let dagCache = { dag: null, at: 0 };
async function huidigeDag() {
  if (dagCache.dag && Date.now() - dagCache.at < 10 * 60000) return dagCache.dag;
  dagCache = { dag: (await instellingen()).periodeDag, at: Date.now() };
  return dagCache.dag;
}
// Rekentijd van de api-functie: optellen in het geheugen, hooguit eens per minuut wegschrijven.
let opgespaard = 0, laatst = Date.now();
export function meetVerzoek(ms) {
  opgespaard += ms;
  if (Date.now() - laatst < 60000) return null;
  const w = opgespaard; opgespaard = 0; laatst = Date.now();
  return meet("compute_ms", w);
}
export async function meet(soort, waarde, periodeDag) {
  if (!waarde || !Number.isFinite(waarde)) return;
  try {
    const p = periodeStart(periodeDag ?? (await huidigeDag()));
    await q(`INSERT INTO credit_meter (periode, soort, waarde) VALUES ($1, $2, $3)
             ON CONFLICT (periode, soort) DO UPDATE SET waarde = credit_meter.waarde + EXCLUDED.waarde`, [p, soort, waarde]);
  } catch {}
}
// Prijs van AI Gateway in credits per 1M tokens (input, output) volgens Netlify.
const AI_TARIEF = [[/haiku-5/, 18, 90], [/haiku/, 180, 900], [/opus-5-5/, 720, 3600], [/opus/, 900, 4500], [/sonnet-5/, 360, 1800], [/sonnet/, 540, 2700]];
export function aiCredits(model, usage = {}) {
  const [, inp, out] = AI_TARIEF.find(([re]) => re.test(String(model))) || [null, 540, 2700];
  return ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1) * inp / 1e6 + (usage.output_tokens || 0) * out / 1e6;
}

async function instellingen() {
  const s = await getSettings();
  return { periodeDag: 18, inbegrepen: 3000, ...(s.credits || {}) };
}

async function netlify(path) {
  const r = await fetch("https://api.netlify.com/api/v1" + path, { headers: { authorization: `Bearer ${env("NETLIFY_API_TOKEN")}`, "user-agent": "sitemaker-hq" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Netlify ${r.status}`);
  return r.json();
}
// Productiedeploys van alle projecten in het team sinds het begin van de periode (elke deploy = 15 credits).
async function telDeploys(start, budgetMs = 7000) {
  const slug = env("NETLIFY_ACCOUNT_SLUG");
  const sites = await netlify(`/${slug}/sites?per_page=100`);
  const t0 = Date.now(); let n = 0, compleet = true;
  for (let i = 0; i < sites.length; i += 6) {
    if (Date.now() - t0 > budgetMs) { compleet = false; break; }
    const rij = await Promise.all(sites.slice(i, i + 6).map((s) => netlify(`/sites/${s.id}/deploys?production=true&per_page=100`).catch(() => [])));
    for (const deploys of rij) n += deploys.filter((d) => d.state === "ready" && d.context === "production" && d.created_at >= start).length;
  }
  return { n, projecten: sites.length, compleet };
}

export async function controleer({ force = false, budgetMs = 6000 } = {}) {
  const inst = await instellingen();
  const vorige = (await one("SELECT value FROM settings WHERE key = 'credits_status'"))?.value;
  if (!force && vorige?.at && Date.now() - Date.parse(vorige.at) < 30 * 60000) return { skip: true };
  const start = periodeStart(inst.periodeDag);
  // Totaal: wat Maxim invult (na bijkopen of upgraden ziet de Netlify-API dat vaak niet), anders Netlify, anders 3000.
  let inbegrepen = Number(inst.totaalHandmatig) || Number(inst.inbegrepen) || 3000, apiGebruikt = 0;
  const onderdelen = { deploys: null, compute: 0, ai: 0 };
  let deploys = { n: vorige?.periode === start ? vorige.onderdelen?.deploysAantal || 0 : 0, compleet: false };
  if (env("NETLIFY_API_TOKEN") && env("NETLIFY_ACCOUNT_SLUG") && !env("NETLIFY_FAKE")) {
    try {
      const accounts = await netlify("/accounts");
      const acc = accounts.find((a) => a.slug === env("NETLIFY_ACCOUNT_SLUG")) || accounts[0];
      const c = acc?.capabilities?.credits;
      if (c?.included && !inst.totaalHandmatig) inbegrepen = Number(c.included);
      apiGebruikt = Number(c?.used) || 0;
    } catch (e) { console.log("[credits] accounts", e.message); }
    try { deploys = await telDeploys(start, Math.max(1500, budgetMs)); } catch (e) { console.log("[credits] deploys", e.message); }
  }
  const meter = Object.fromEntries((await q("SELECT soort, waarde FROM credit_meter WHERE periode = $1", [start])).map((r) => [r.soort, Number(r.waarde)]));
  onderdelen.deploysAantal = deploys.n;
  onderdelen.deploys = deploys.n * CREDIT_KOSTEN.deploy;
  onderdelen.compute = Math.round(((meter.compute_ms || 0) / 3.6e6) * CREDIT_KOSTEN.gbUur * 10) / 10;
  onderdelen.ai = Math.round((meter.ai_credits || 0) * 10) / 10;
  const schatting = onderdelen.deploys + onderdelen.compute + onderdelen.ai;
  // IJkpunt: het getal dat Maxim in Netlify zag, plus wat er sindsdien bij kwam.
  const ijk = inst.ijkpunt?.periode === start ? inst.ijkpunt : null;
  let gebruikt = schatting, bron = "schatting";
  if (ijk) { gebruikt = Number(ijk.waarde) + Math.max(0, schatting - Number(ijk.schatting || 0)); bron = "ijkpunt"; }
  if (apiGebruikt > gebruikt) { gebruikt = apiGebruikt; bron = "netlify"; }
  const pct = Math.round((gebruikt / inbegrepen) * 1000) / 10;
  const eind = new Date(Date.parse(start + "T00:00:00Z") + 31 * dag); eind.setUTCDate(Number(start.slice(8)));
  const dagenOm = Math.max(0.5, (Date.now() - Date.parse(start + "T00:00:00Z")) / dag);
  const dagenTotaal = (eind - Date.parse(start + "T00:00:00Z")) / dag;
  const prognose = Math.round((gebruikt / dagenOm) * dagenTotaal);
  const gemeld = vorige?.periode === start ? vorige.gemeld || [] : [];
  const status = { at: new Date().toISOString(), periode: start, tot: eind.toISOString().slice(0, 10), inbegrepen, gebruikt: Math.round(gebruikt), pct, prognose, bron, onderdelen, deploysCompleet: deploys.compleet, gemeld };

  // Drempels: mail + spaarstand (één keer per drempel per periode).
  for (const d of DREMPELS) {
    if (pct < d || gemeld.includes(d)) continue;
    gemeld.push(d);
    const spaarAan = inst.spaarstandUitPeriode !== start;
    if (spaarAan && !(await spaarstand())) await zetSpaarstand(true, `automatisch bij ${d}%`, null);
    await notifyStaff(`Let op: ${pct}% van je Netlify-credits is op`, [
      `Je hebt ${status.gebruikt} van de ${inbegrepen} Netlify-credits gebruikt (${pct}%) in de periode vanaf ${start}. Bij 100% zet Netlify al je websites, ook die van klanten, op pauze.`,
      `Waar het in zit: ${onderdelen.deploysAantal} productiedeploys (${onderdelen.deploys} credits), rekentijd ongeveer ${onderdelen.compute}, AI ongeveer ${onderdelen.ai}. Bandbreedte en bezoekers tellen ook mee maar meten we niet zelf.`,
      spaarAan ? "Spaarstand staat aan: HQ zoekt geen nieuwe leads, scant geen concepten en maakt geen AI-briefings. Mail, betalingen, klantvragen en klantsites lopen door." : "Je hebt de spaarstand voor deze periode uitgezet.",
      "Zeker weten dat niets offline gaat: zet in Netlify › Team › Billing 'Auto recharge' aan (1.000 credits voor $20, alleen als het nodig is).",
      "Deploy de komende tijd alleen wat echt moet; elke productiedeploy kost 15 credits.",
    ], "/hq/#kosten").catch(() => {});
    await audit(null, null, "credits.drempel", { drempel: d, pct, gebruikt: status.gebruikt });
  }
  status.gemeld = gemeld;
  await saveSetting("credits_status", status);
  return status;
}

export async function zetSpaarstand(aan, reden, user) {
  const inst = await instellingen();
  const periode = periodeStart(inst.periodeDag);
  await saveSetting("credits", { ...inst, spaarstand: { aan: !!aan, sinds: new Date().toISOString(), reden }, spaarstandUitPeriode: aan ? inst.spaarstandUitPeriode : periode });
  await audit(user?.id || null, null, aan ? "credits.spaarstand_aan" : "credits.spaarstand_uit", { reden });
}
// Spaarstand: geldt alleen in de periode waarin hij aanging; een nieuwe periode begint weer gewoon.
export async function spaarstand() {
  const inst = await instellingen();
  if (!inst.spaarstand?.aan) return false;
  return periodeStart(inst.periodeDag) <= inst.spaarstand.sinds.slice(0, 10);
}

export async function overzicht() {
  const inst = await instellingen();
  const status = (await one("SELECT value FROM settings WHERE key = 'credits_status'"))?.value || null;
  return { status, spaarstand: await spaarstand(), periodeDag: inst.periodeDag, totaal: inst.totaalHandmatig || null, ijkpunt: inst.ijkpunt || null, kosten: CREDIT_KOSTEN };
}

// Maxim vult in wat Netlify zegt (Billing › Credit usage) en/of zet de spaarstand aan/uit.
export async function opslaan(b, user) {
  const inst = await instellingen();
  if (b.periodeDag !== undefined) inst.periodeDag = Math.min(28, Math.max(1, Number(b.periodeDag) || inst.periodeDag));
  if (b.inbegrepen !== undefined && Number(b.inbegrepen) > 0) inst.inbegrepen = Number(b.inbegrepen);
  if (b.totaal !== undefined) inst.totaalHandmatig = Number(b.totaal) > 0 ? Number(b.totaal) : null;
  await saveSetting("credits", inst);
  if (b.gebruikt !== undefined && b.gebruikt !== "") {
    const s = await controleer({ force: true });
    const schatting = (s.onderdelen.deploys || 0) + (s.onderdelen.compute || 0) + (s.onderdelen.ai || 0);
    const nieuw = await instellingen();
    await saveSetting("credits", { ...nieuw, ijkpunt: { waarde: Math.max(0, Number(b.gebruikt) || 0), schatting, periode: s.periode, at: new Date().toISOString() } });
  }
  if (b.spaarstand !== undefined) await zetSpaarstand(!!b.spaarstand, b.spaarstand ? "handmatig" : "handmatig uit", user);
  return { ...(await overzicht()), status: await controleer({ force: true }) };
}
