// Kennismaking online boeken (zoals Calendly). Vaste weektijden uit settings.agenda, met uitzonderingen
// (agenda_exceptions: 'dicht' = niet boekbaar, 'open' = extra boekbaar en wint van 'dicht').
// Alles rekent in Europe/Amsterdam; in de database staat UTC.
import crypto from "node:crypto";
import { q, one, str, cleanEmail, EMAIL_RE, sha256, env, fail, escH, OFFER, getSettings, saveSetting, DEFAULT_SETTINGS, publicBase, audit } from "./core.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";

const TZ = "Europe/Amsterdam";
const MIN = 60000;

// ---------------------------------------------------------------- tijd
// Wandklok in Amsterdam → UTC-moment (ook rond de overgang naar zomer-/wintertijd).
const wall = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
};
export function amsToUtc(date, hm = "00:00") {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - (wall(guess) - guess);
  t = guess - (wall(t) - t);
  return t;
}
const dayStr = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: TZ });
const hmStr = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const weekday = (date) => new Date(date + "T12:00:00Z").getUTCDay();
const addDay = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const dagLabel = (ms) => new Date(ms).toLocaleDateString("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
export const momentLabel = (ms, duur) => `${dagLabel(ms)}, ${hmStr(ms)} – ${hmStr(ms + duur * MIN)}`;

// ---------------------------------------------------------------- instellingen
// Videogesprek: doordeweeks 13:00–15:00 en 17:00–18:00, slots van 30 minuten in de agenda (naar de klant noemen we geen duur), het eerste moment ligt nooit ver weg (1 uur vooruit boeken).
// De link stel je in bij HQ › Agenda (videoLink); zolang die leeg is, sturen we hem apart.
export const VIDEO_STANDAARD = { actief: true, duur: 30, interval: 30, minUren: 1, dagenVooruit: 14, maxPerDag: 0,
  week: { 0: [], 1: [["13:00", "15:00"], ["17:00", "18:00"]], 2: [["13:00", "15:00"], ["17:00", "18:00"]], 3: [["13:00", "15:00"], ["17:00", "18:00"]], 4: [["13:00", "15:00"], ["17:00", "18:00"]], 5: [["13:00", "15:00"], ["17:00", "18:00"]], 6: [] } };
export async function agendaConfig(soort) {
  const s = await getSettings();
  const a = { ...DEFAULT_SETTINGS.agenda, ...(s.agenda || {}) };
  a.week = { ...DEFAULT_SETTINGS.agenda.week, ...(a.week || {}) };
  if (soort === "video") {
    const v = { ...VIDEO_STANDAARD, ...(s.agenda_video || {}) };
    return { ...v, week: { ...VIDEO_STANDAARD.week, ...(v.week || {}) }, soort: "video", videoLink: a.videoLink || "" };
  }
  if (soort === "telefoon") return { ...a, soort: "telefoon" };
  return a;
}
export const soortNaam = (soort) => (soort === "video" ? "Videomeeting" : soort === "telefoon" ? "Belafspraak" : "Kennismaking");
const hoeTekst = (soort, link, phone) => (soort === "video" ? (link ? `via een videogesprek: ${link}` : "via een videogesprek (de link sturen we je vooraf per mail)") : `telefonisch: we bellen je op ${phone}`);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function saveAgendaConfig(b, user) {
  const cur = await agendaConfig();
  const n = (v, min, max, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
  const week = {};
  for (let d = 0; d < 7; d++) {
    const ranges = Array.isArray(b.week?.[d]) ? b.week[d] : cur.week[d];
    week[d] = ranges.filter((r) => Array.isArray(r) && HM.test(r[0]) && HM.test(r[1]) && r[0] < r[1]).slice(0, 6).map((r) => [r[0], r[1]]);
  }
  const a = {
    actief: b.actief !== false, duur: n(b.duur, 5, 120, cur.duur), interval: n(b.interval, 5, 240, cur.interval),
    minUren: n(b.minUren, 0, 168, cur.minUren), dagenVooruit: n(b.dagenVooruit, 1, 90, cur.dagenVooruit), maxPerDag: n(b.maxPerDag, 0, 50, cur.maxPerDag),
    soort: b.soort === "video" ? "video" : "telefoon", videoLink: str(b.videoLink, 300), week,
  };
  if (a.soort === "video" && !/^https:\/\//.test(a.videoLink)) fail(400, "Vul de link van je vaste videogesprek in (begint met https://).", { field: "videoLink" });
  if (a.interval < a.duur) a.interval = a.duur;
  await saveSetting("agenda", a);
  await audit(user.id, null, "agenda.instellingen", {});
  return { agenda: a };
}

// ---------------------------------------------------------------- beschikbaarheid
async function load(fromMs, toMs) {
  const [exc, booked] = await Promise.all([
    q("SELECT * FROM agenda_exceptions WHERE ends_at > $1 AND starts_at < $2 ORDER BY starts_at", [new Date(fromMs).toISOString(), new Date(toMs).toISOString()]),
    q("SELECT id, name, company, starts_at, ends_at, status FROM appointments WHERE starts_at IS NOT NULL AND status <> 'geannuleerd' AND starts_at < $2 AND ends_at > $1", [new Date(fromMs).toISOString(), new Date(toMs).toISOString()]),
  ]);
  const t = (x) => new Date(x).getTime();
  return {
    dicht: exc.filter((e) => e.kind === "dicht").map((e) => ({ id: e.id, s: t(e.starts_at), e: t(e.ends_at), note: e.note })),
    open: exc.filter((e) => e.kind === "open").map((e) => ({ id: e.id, s: t(e.starts_at), e: t(e.ends_at), note: e.note })),
    booked: booked.map((b) => ({ id: b.id, name: b.name, company: b.company, s: t(b.starts_at), e: t(b.ends_at) })),
  };
}

// Alle mogelijke momenten per dag met hun status: vrij | geboekt | dicht | voorbij.
export async function grid({ days, from, soort } = {}) {
  const a = await agendaConfig(soort);
  const start = from || dayStr(Date.now());
  const n = days || a.dagenVooruit;
  const fromMs = amsToUtc(start), toMs = amsToUtc(addDay(start, n + 1));
  const data = await load(fromMs, toMs);
  const now = Date.now(), earliest = now + a.minUren * 3600000;
  const overlaps = (list, s, e) => list.filter((x) => x.s < e && x.e > s);
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = addDay(start, i);
    const dayS = amsToUtc(date), dayE = amsToUtc(addDay(date, 1));
    const starts = new Set();
    const addRange = (s, e) => { for (let t = s; t + a.duur * MIN <= e; t += a.interval * MIN) starts.add(t); };
    for (const [f, t] of a.week[weekday(date)] || []) addRange(amsToUtc(date, f), amsToUtc(date, t));
    for (const o of overlaps(data.open, dayS, dayE)) addRange(Math.max(o.s, dayS), Math.min(o.e, dayE));
    for (const b of overlaps(data.booked, dayS, dayE)) starts.add(b.s);
    const slots = [...starts].sort((x, y) => x - y).map((s) => {
      const e = s + a.duur * MIN;
      const b = data.booked.find((x) => x.s < e && x.e > s);
      const openEx = data.open.some((o) => o.s <= s && o.e >= e);
      const dicht = !openEx && data.dicht.some((d) => d.s < e && d.e > s);
      const status = b ? "geboekt" : s < now ? "voorbij" : dicht ? "dicht" : "vrij";
      return { start: new Date(s).toISOString(), tijd: hmStr(s), status, te_vroeg: s < earliest, extra: openEx, ...(b ? { afspraak: { id: b.id, name: b.name, company: b.company } } : {}) };
    });
    const geboekt = slots.filter((x) => x.status === "geboekt").length;
    out.push({ date, label: dagLabel(dayS + 12 * 3600000), dicht: data.dicht.some((d) => d.s <= dayS && d.e >= dayE), geboekt, slots });
  }
  return { agenda: a, days: out };
}

// Wat een bezoeker kan kiezen.
export async function publicSlots(soort) {
  const a = await agendaConfig(soort);
  if (!a.actief) return { actief: false, days: [] };
  const g = await grid({ soort });
  const days = g.days.map((d) => {
    const vrij = d.slots.filter((s) => s.status === "vrij" && !s.te_vroeg);
    const vol = a.maxPerDag > 0 && d.geboekt >= a.maxPerDag;
    return { date: d.date, label: d.label, times: vol ? [] : vrij.map((s) => ({ start: s.start, tijd: s.tijd })) };
  }).filter((d) => d.times.length);
  return { actief: true, duur: a.duur, soort: a.soort, days };
}

// ---------------------------------------------------------------- boeken
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
const fold = (line) => line.match(/.{1,73}/g).join("\r\n ");
function vevent(a, cfg, forStaff) {
  const s = new Date(a.starts_at).getTime(), e = new Date(a.ends_at).getTime();
  const waar = (a.soort || cfg.soort) === "video" ? (cfg.videoLink || "Videogesprek (link volgt)") : forStaff ? `Bellen: ${a.phone}` : `Telefonisch: we bellen je op ${a.phone}`;
  const besch = forStaff
    ? [`${a.name} (${a.company})`, `Telefoon: ${a.phone}`, `E-mail: ${a.email}`, a.message ? `Bericht: ${a.message}` : ""].filter(Boolean).join("\n")
    : `${(a.soort || cfg.soort) === "video" ? "Videomeeting met Sitemaker." : `Belafspraak met Sitemaker (${Math.round((e - s) / MIN)} minuten).`} We bespreken wat je website moet doen en wat het kost.\n${waar}\n\nAnnuleren: ${publicBase()}/api/agenda/annuleren?t=${a.token}`;
  return [
    "BEGIN:VEVENT", `UID:afspraak-${a.id}@sitemaker.nl`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(s)}`, `DTEND:${icsDate(e)}`,
    fold(`SUMMARY:${icsText(forStaff ? `${soortNaam(a.soort || cfg.soort)} ${a.company} (${a.name})` : `${soortNaam(a.soort || cfg.soort)} met Sitemaker`)}`),
    fold(`DESCRIPTION:${icsText(besch)}`), fold(`LOCATION:${icsText(waar)}`),
    a.status === "geannuleerd" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED", "END:VEVENT",
  ].join("\r\n");
}
const calendar = (events, name) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sitemaker//Agenda//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  name ? `X-WR-CALNAME:${name}` : "", "X-WR-TIMEZONE:Europe/Amsterdam", ...events, "END:VCALENDAR"].filter(Boolean).join("\r\n") + "\r\n";

export async function book(b, ip) {
  if (str(b.website_url)) return { ok: true, spam: true };
  if (b.t && Date.now() - Number(b.t) < 2000) return { ok: true, spam: true };
  const soort = b.soort === "video" ? "video" : (b.soort === "telefoon" ? "telefoon" : undefined);
  const a = await agendaConfig(soort);
  if (!a.actief) fail(400, "Online een afspraak maken kan op dit moment niet. Laat je gegevens achter, dan bellen we je.");
  const errors = {};
  const name = str(b.name, 120), company = str(b.company, 160), email = cleanEmail(b.email), phone = str(b.phone, 30), message = str(b.message, 2000);
  if (name.length < 2) errors.name = "Vul je naam in.";
  if (company.length < 2) errors.company = "Vul de naam van je bedrijf in.";
  if (!EMAIL_RE.test(email)) errors.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
  if (!/^[+()\d\s-]{8,20}$/.test(phone)) errors.phone = a.soort === "telefoon" ? "Vul je telefoonnummer in, dan bellen we je op het afgesproken moment." : "Vul je telefoonnummer in.";
  if (Object.keys(errors).length) fail(400, "Controleer de gemarkeerde velden.", { errors });

  const startMs = Date.parse(b.start || "");
  const slots = await publicSlots(soort);
  const ok = Number.isFinite(startMs) && slots.days.some((d) => d.times.some((t) => Date.parse(t.start) === startMs));
  if (!ok) fail(409, "Dit moment is niet (meer) beschikbaar. Kies een ander tijdstip.", { slotGone: true });

  const ipHash = sha256(`${env("AUTH_SECRET", "x")}:${ip}`).slice(0, 32);
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM appointments WHERE (ip_hash = $1 OR email = $2) AND created_at > NOW() - INTERVAL '1 hour'", [ipHash, email]);
  if (n >= 4) fail(429, "Je hebt net al een afspraak gemaakt. Wil je iets wijzigen? Gebruik de link in je bevestigingsmail.");

  const token = crypto.randomBytes(18).toString("base64url");
  let appt;
  try {
    appt = await one(`INSERT INTO appointments (name, company, email, phone, message, ip_hash, starts_at, ends_at, token, source, preference, soort)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'agenda','',$10) RETURNING *`,
      [name, company, email, phone, message, ipHash, new Date(startMs).toISOString(), new Date(startMs + a.duur * MIN).toISOString(), token, a.soort === "video" ? "video" : "telefoon"]);
  } catch (e) {
    if (e.code === "23505") fail(409, "Iemand was je net voor: dit moment is zojuist geboekt. Kies een ander tijdstip.", { slotGone: true });
    throw e;
  }
  const lead = await one("UPDATE leads SET status = 'afspraak', updated_at = NOW() WHERE lower(email) = $1 AND status NOT IN ('klant','afgemeld') RETURNING id", [email]);
  if (lead) await q("UPDATE appointments SET lead_id = $1 WHERE id = $2", [lead.id, appt.id]);
  const viaConcept = await linkConcept(b.concept, appt.id);

  const wanneer = momentLabel(startMs, a.duur);
  const hoe = hoeTekst(a.soort, a.videoLink, phone);
  const annuleer = `${publicBase()}/api/agenda/annuleren?t=${token}`;
  await Promise.allSettled([
    sendMail({
      to: email, kind: "afspraak-bevestiging", ref: `appointment:${appt.id}`, subject: `Je ${soortNaam(a.soort).toLowerCase()} met Sitemaker: ${wanneer}`,
      text: `Hoi ${name},\n\nJe ${soortNaam(a.soort).toLowerCase()} staat vast: ${wanneer}, ${hoe}.\n\n${a.soort === "video" ? "We bespreken" : `In ${a.duur} minuten bespreken we`} wat je website moet doen en wat het kost. Ter info: €299,95 eenmalig + €69,95 per maand, inclusief hosting en ${OFFER.changesPerMonth} wijzigingen per maand, maandelijks opzegbaar en 30 dagen geld-terug-garantie.\n\nKun je toch niet? Annuleer via ${annuleer} en kies gerust een nieuw moment op ${publicBase()}/#kennismaking\n\nTot dan!\nSitemaker`,
      html: brandHtml({
        title: `Je ${soortNaam(a.soort).toLowerCase()} staat vast`,
        intro: [`Hoi ${escH(name)},`, `<b>${escH(wanneer)}</b><br>${escH(hoe.charAt(0).toUpperCase() + hoe.slice(1))}.`,
          `${a.soort === "video" ? "We bespreken" : `In ${a.duur} minuten bespreken we`} wat je website moet doen en wat het kost. Ter info: <b>€299,95 eenmalig + €69,95 per maand</b>, inclusief hosting en ${OFFER.changesPerMonth} wijzigingen per maand, maandelijks opzegbaar en 30 dagen geld-terug-garantie.`],
        after: [`Kun je toch niet? <a href="${annuleer}">Annuleer je afspraak</a> en kies gerust een nieuw moment.`],
      }),
      attachments: [{ filename: "kennismaking-sitemaker.ics", content: calendar([vevent(appt, a, false)]), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
    }),
    notifyStaff(`Nieuwe ${a.soort === "video" ? "videomeeting" : "belafspraak"}: ${company}, ${wanneer}`, [`${name} van ${company} heeft een ${a.soort === "video" ? "videomeeting" : "belafspraak"} geboekt.`, a.soort === "video" && !a.videoLink ? "Let op: er staat nog geen videolink in HQ › Agenda. Stuur de klant zelf een link." : "", `Wanneer: ${wanneer}`, `Telefoon: ${phone} · E-mail: ${email}`,
      message ? `Bericht: ${message}` : "", viaConcept ? `Geboekt vanuit het concept van ${viaConcept}.` : lead ? "Dit bedrijf staat ook in je B2B-leads (status nu: afspraak)." : ""].filter(Boolean), `/hq/#aanvragen`),
  ]);
  return { ok: true, start: new Date(startMs).toISOString(), wanneer, hoe, token };
}

// Geboekt vanaf een concept-website: koppel aan die lead (ook als het mailadres anders is).
export async function linkConcept(token, apptId) {
  if (!/^[\w-]{8,40}$/.test(token || "")) return null;
  const c = await one("SELECT c.lead_id, l.company FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.token = $1", [token]);
  if (!c) return null;
  await q("UPDATE appointments SET lead_id = $1, source = CASE WHEN source = 'website' THEN 'concept' ELSE source END WHERE id = $2", [c.lead_id, apptId]);
  await q("UPDATE leads SET status = 'afspraak', updated_at = NOW() WHERE id = $1 AND status NOT IN ('klant','afgemeld')", [c.lead_id]);
  return c.company;
}

// ---------------------------------------------------------------- annuleren
export async function apptByToken(token) {
  if (!/^[\w-]{16,40}$/.test(token || "")) return null;
  return one("SELECT * FROM appointments WHERE token = $1", [token]);
}

export async function cancel(appt, by, user = null) {
  if (!appt || appt.status === "geannuleerd") return { ok: true, already: true };
  if (appt.starts_at && new Date(appt.starts_at).getTime() < Date.now() && by === "klant") fail(400, "Deze afspraak is al geweest.");
  await q("UPDATE appointments SET status = 'geannuleerd', canceled_at = NOW(), canceled_by = $2, updated_at = NOW() WHERE id = $1", [appt.id, by]);
  const a = await agendaConfig();
  const wanneer = appt.starts_at ? momentLabel(new Date(appt.starts_at).getTime(), a.duur) : "";
  if (by === "klant") {
    await notifyStaff(`${soortNaam(appt.soort)} geannuleerd: ${appt.company}`, [`${appt.name} van ${appt.company} heeft de ${soortNaam(appt.soort).toLowerCase()} van ${wanneer} geannuleerd. Het moment is weer vrij.`], `/hq/#aanvragen`).catch(() => {});
  } else {
    if (user) await audit(user.id, null, "agenda.geannuleerd", { id: appt.id });
    await sendMail({
      to: appt.email, kind: "afspraak-geannuleerd", ref: `appointment:${appt.id}`, subject: "Je kennismaking met Sitemaker gaat niet door",
      text: `Hoi ${appt.name},\n\nHelaas kan je kennismaking van ${wanneer} niet doorgaan. Excuses daarvoor. Kies gerust een nieuw moment op ${publicBase()}/#kennismaking\n\nMet vriendelijke groet,\nSitemaker`,
      html: brandHtml({ title: "Je kennismaking gaat niet door", intro: [`Hoi ${escH(appt.name)},`, `Helaas kan je kennismaking van <b>${escH(wanneer)}</b> niet doorgaan. Excuses daarvoor.`], button: { label: "Kies een nieuw moment", href: `${publicBase()}/#kennismaking` } }),
    }).catch(() => {});
  }
  return { ok: true };
}

export async function apptIcs(token) {
  const appt = await apptByToken(token);
  if (!appt || !appt.starts_at) return null;
  return calendar([vevent(appt, await agendaConfig(), false)]);
}

// ---------------------------------------------------------------- agenda-abonnement voor Maxim (Google/Apple Agenda)
export const feedKey = () => crypto.createHmac("sha256", env("AUTH_SECRET", "x")).update("agenda-feed").digest("hex").slice(0, 32);
export const feedUrl = () => `${publicBase()}/api/agenda/feed.ics?k=${feedKey()}`;
export async function feed(k) {
  if (!k || k.length !== 32 || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(feedKey()))) return null;
  const a = await agendaConfig();
  const rows = await q("SELECT * FROM appointments WHERE starts_at IS NOT NULL AND starts_at > NOW() - INTERVAL '60 days' ORDER BY starts_at");
  return calendar(rows.map((r) => vevent(r, a, true)), "Sitemaker kennismakingen");
}

// ---------------------------------------------------------------- herinnering (tick)
export async function sendReminders() {
  const a = await agendaConfig();
  const rows = await q(`SELECT * FROM appointments WHERE starts_at BETWEEN NOW() AND NOW() + INTERVAL '3 hours' AND reminder_at IS NULL
                        AND status NOT IN ('geannuleerd') AND created_at < starts_at - INTERVAL '3 hours' LIMIT 10`);
  for (const r of rows) {
    await q("UPDATE appointments SET reminder_at = NOW() WHERE id = $1", [r.id]);
    const s = new Date(r.starts_at).getTime();
    const hoe = r.soort === "video" ? (a.videoLink ? `Je kunt deelnemen via ${a.videoLink}` : "Je ontvangt de link voor het videogesprek van ons") : `We bellen je op ${r.phone}`;
    await sendMail({
      to: r.email, kind: "afspraak-herinnering", ref: `appointment:${r.id}`, subject: `Vandaag om ${hmStr(s)}: je ${soortNaam(r.soort).toLowerCase()} met Sitemaker`,
      text: `Hoi ${r.name},\n\nEven ter herinnering: vandaag om ${hmStr(s)} hebben we onze kennismaking. ${hoe}.\n\nKun je toch niet? Annuleer via ${publicBase()}/api/agenda/annuleren?t=${r.token}\n\nTot straks!\nSitemaker`,
      html: brandHtml({ title: `Vandaag om ${hmStr(s)}`, intro: [`Hoi ${escH(r.name)},`, `Even ter herinnering: vandaag om <b>${hmStr(s)}</b> hebben we onze kennismaking. ${escH(hoe)}.`],
        after: [`Kun je toch niet? <a href="${publicBase()}/api/agenda/annuleren?t=${r.token}">Annuleer je afspraak</a>.`] }),
    }).catch(() => {});
  }
  return { sent: rows.length };
}

// ---------------------------------------------------------------- HQ: slots open/dicht
export async function setSlot({ start, dicht }, user) {
  const a = await agendaConfig();
  const s = Date.parse(start || "");
  if (!Number.isFinite(s)) fail(400, "Onbekend moment.");
  const e = s + a.duur * MIN, S = new Date(s).toISOString(), E = new Date(e).toISOString();
  if (dicht) {
    await q("DELETE FROM agenda_exceptions WHERE kind = 'open' AND starts_at = $1 AND ends_at = $2", [S, E]);
    await q("INSERT INTO agenda_exceptions (kind, starts_at, ends_at, note) VALUES ('dicht', $1, $2, '')", [S, E]);
  } else {
    await q("DELETE FROM agenda_exceptions WHERE kind = 'dicht' AND starts_at = $1 AND ends_at = $2", [S, E]);
    // Valt het moment nog in een groter dicht blok (bijv. vakantie) of buiten de vaste tijden: los openzetten.
    const g = await grid({ from: dayStr(s), days: 1 });
    const slot = g.days[0]?.slots.find((x) => Date.parse(x.start) === s);
    if (!slot || slot.status !== "vrij") await q("INSERT INTO agenda_exceptions (kind, starts_at, ends_at, note) VALUES ('open', $1, $2, '')", [S, E]);
  }
  await audit(user.id, null, dicht ? "agenda.slot_dicht" : "agenda.slot_open", { start: S });
  return { ok: true };
}

export async function addException(b, user) {
  const kind = b.kind === "open" ? "open" : "dicht";
  const van = str(b.van, 10), tot = str(b.tot, 10) || van;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(van) || !/^\d{4}-\d{2}-\d{2}$/.test(tot) || tot < van) fail(400, "Kies een geldige datum (tot en met mag niet voor de begindatum liggen).", { field: "van" });
  let s, e;
  if (kind === "dicht" && !b.vanTijd) { s = amsToUtc(van); e = amsToUtc(addDay(tot, 1)); }
  else {
    if (!HM.test(b.vanTijd || "") || !HM.test(b.totTijd || "") || b.vanTijd >= b.totTijd) fail(400, "Vul een begin- en eindtijd in, bijvoorbeeld 18:00 en 20:00.", { field: "vanTijd" });
    if (van !== tot) fail(400, "Kies voor losse tijden één dag.", { field: "tot" });
    s = amsToUtc(van, b.vanTijd); e = amsToUtc(van, b.totTijd);
  }
  const r = await one("INSERT INTO agenda_exceptions (kind, starts_at, ends_at, note) VALUES ($1,$2,$3,$4) RETURNING id", [kind, new Date(s).toISOString(), new Date(e).toISOString(), str(b.note, 200)]);
  await audit(user.id, null, `agenda.${kind}`, { van, tot });
  const geraakt = kind === "dicht" ? await q("SELECT id, name, company, starts_at FROM appointments WHERE starts_at >= $1 AND starts_at < $2 AND status <> 'geannuleerd'", [new Date(s).toISOString(), new Date(e).toISOString()]) : [];
  return { id: r.id, bestaandeAfspraken: geraakt.length };
}
export async function deleteException(id, user) {
  await q("DELETE FROM agenda_exceptions WHERE id = $1", [id]);
  await audit(user.id, null, "agenda.uitzondering_weg", { id });
  return { ok: true };
}
export async function listExceptions() {
  const rows = await q("SELECT * FROM agenda_exceptions WHERE ends_at > NOW() AND (ends_at - starts_at) > INTERVAL '1 hour' ORDER BY starts_at LIMIT 50");
  return rows.map((r) => ({ id: r.id, kind: r.kind, start: r.starts_at, end: r.ends_at, note: r.note,
    label: r.kind === "dicht" && hmStr(new Date(r.starts_at).getTime()) === "00:00" && hmStr(new Date(r.ends_at).getTime()) === "00:00"
      ? `${dagLabel(new Date(r.starts_at).getTime() + 3600000)}${new Date(r.ends_at) - new Date(r.starts_at) > 86400000 * 1.5 ? ` t/m ${dagLabel(new Date(r.ends_at).getTime() - 3600000)}` : ""}`
      : `${dagLabel(new Date(r.starts_at).getTime())}, ${hmStr(new Date(r.starts_at).getTime())} – ${hmStr(new Date(r.ends_at).getTime())}` }));
}
