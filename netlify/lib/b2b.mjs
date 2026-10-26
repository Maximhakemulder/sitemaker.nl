// B2B-acquisitie per mail, naar het voorbeeld van TrueSafe HQ.
// Niets gaat de deur uit zonder goedkeuring in HQ; afmelden werkt altijd met één klik.
import crypto from "node:crypto";
import dns from "node:dns/promises";
import { ImapFlow } from "imapflow";
import { env, q, one, getSettings, str, cleanEmail, EMAIL_RE, domainOf, normUrl, dayKey, hourAms, publicBase, escH, fail, audit } from "./core.mjs";
import { sendMail, mailEnv, mailReady } from "./mail.mjs";
import { conceptUrl, deleteConcept } from "./concepts.mjs";

export const LEAD_STATUSES = ["kandidaat", "nieuw", "goedgekeurd", "verstuurd", "opvolging_goedgekeurd", "opgevolgd", "reactie", "afspraak", "klant", "afgemeld", "overgeslagen", "fout"];
export const scoutReady = () => !!env("OUTSCRAPER_API_KEY");
export const aiReady = () => !!env("ANTHROPIC_API_KEY");

const FREEMAIL = /@(gmail|hotmail|outlook|live|yahoo|icloud|me|ziggo|kpnmail|planet|home|xs4all|kpnplanet|hetnet|casema|chello|upcmail)\./i;
const GENERIC = /^(info|contact|hallo|hello|mail|post|office|welkom|administratie|algemeen|receptie|service|klantenservice|verkoop|sales|praktijk|salon|team|kantoor|offerte|planning)([.\-_]?[a-z0-9]*)?@/i;

// ---------------------------------------------------------------- afmelden
const unsubToken = (id) => crypto.createHmac("sha256", env("AUTH_SECRET", "sitemaker-local-dev")).update(`unsub:${id}`).digest("base64url").slice(0, 24);
export const unsubUrl = (id) => `${publicBase()}/api/b2b/afmelden?l=${id}&t=${unsubToken(id)}`;
export function checkUnsub(id, t) {
  const a = Buffer.from(String(t || "")), b = Buffer.from(unsubToken(id));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function unsubscribe(id) {
  const l = await one("UPDATE leads SET status = 'afgemeld', unsub_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *", [id]);
  if (l?.email) await q("INSERT INTO suppressions (email, reason) VALUES ($1, 'afgemeld') ON CONFLICT DO NOTHING", [l.email.toLowerCase()]);
  if (l) await deleteConcept(id).catch(() => {}); // afgemeld = ook het concept weg
  return !!l;
}

// ---------------------------------------------------------------- opstellen
export const conceptReady = (lead) => lead.concept_status === "klaar" && lead.concept_token && (!lead.concept_expires || new Date(lead.concept_expires) > new Date(Date.now() + 7 * 86400000));
export const LEAD_SELECT = `SELECT l.*, c.token AS concept_token, c.status AS concept_status, c.expires_at AS concept_expires, c.created_at AS concept_created FROM leads l LEFT JOIN concepts c ON c.lead_id = l.id`;
export function fillTemplate(tpl, lead, s) {
  const sender = s.b2b.senderName || s.company.name || "Sitemaker";
  const map = {
    bedrijf: lead.company || "jullie bedrijf", plaats: lead.city || "", afzender: sender,
    intro: lead.intro ? lead.intro.trim() + "\n\n" : "", link: `${publicBase()}/#kennismaking`,
    concept: conceptReady(lead) ? `Ik heb alvast een eerste opzet gemaakt van hoe een nieuwe website voor ${lead.company} eruit kan zien, op basis van jullie huidige site. Bekijk hem hier (gratis en vrijblijvend):\n${conceptUrl(lead.concept_token)}\n\n` : "",
    conceptlink: conceptReady(lead) ? conceptUrl(lead.concept_token) : "",
    dagen: String(conceptDagen(s)),
    verloopt: lead.concept_expires ? datumNl(lead.concept_expires) : datumNl(Date.now() + conceptDagen(s) * 86400000),
  };
  // Oudere eigen mailteksten zonder {concept}: zet de conceptregel na de openingszin.
  if (map.concept && !/\{concept(link)?\}/.test(tpl || "") && /\{intro\}/.test(tpl || "")) tpl = tpl.replace("{intro}", "{intro}{concept}");
  return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}
// Hoe lang een voorbeeldwebsite te bekijken is, gerekend vanaf de eerste mail.
export const conceptDagen = (s) => Math.max(7, Number(s.b2b.concepten?.geldigDagen || 30));
const datumNl = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
export function compose(lead, kind, s) {
  // De eerste mail zet de looptijd opnieuw vanaf het versturen (sendBatch schrijft dat ook weg).
  if (kind !== "opvolging" && lead.concept_status === "klaar") lead = { ...lead, concept_expires: new Date(Date.now() + conceptDagen(s) * 86400000).toISOString() };
  const t = s.b2b.templates[kind === "opvolging" ? "opvolging" : "eerste"];
  const subject = fillTemplate(t.subject, lead, s).slice(0, 200);
  const co = s.company;
  const legal = [co.legalName || co.name, co.kvk ? `KvK ${co.kvk}` : "", [co.address, co.postcode, co.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const footer = `\n\n--\nJe ontvangt deze mail omdat je adres openbaar op je website staat. Geen berichten meer van ons? Meld je af: ${unsubUrl(lead.id)}\n${legal}`;
  let body = fillTemplate(t.body, lead, s);
  // Elke eerste mail bevat de voorbeeldwebsite; staat de link niet in de tekst, dan na de aanhef.
  if (kind !== "opvolging" && conceptReady(lead) && !body.includes(conceptUrl(lead.concept_token))) {
    const [aanhef, ...rest] = body.split(/\n\n/);
    const zin = `Ik heb alvast een eerste opzet gemaakt van hoe een nieuwe website voor ${lead.company} eruit kan zien, op basis van jullie huidige site. Bekijk hem hier (gratis en vrijblijvend):\n${conceptUrl(lead.concept_token)}`;
    body = rest.length ? [aanhef, zin, ...rest].join("\n\n") : `${zin}\n\n${aanhef}`;
  }
  body += footer;
  return { subject, body };
}
// Meten (B2B): links lopen via een ondertekende doorstuurlink (/api/t/k), een onzichtbaar plaatje meet het openen (/api/t/o).
// De afmeldlink wordt nooit omgezet. Uit te zetten met settings.b2b.meten { opens, kliks }.
const trackSig = (s) => crypto.createHmac("sha256", env("AUTH_SECRET", "sitemaker-local-dev")).update(`trk:${s}`).digest("base64url").slice(0, 22);
export const trackLink = (leadId, mail, url) => { const u = Buffer.from(url).toString("base64url"); return `${publicBase()}/api/t/k?l=${leadId}&m=${mail}&u=${u}&s=${trackSig(`${leadId}:${mail}:${u}`)}`; };
export const trackPixel = (leadId, mail) => `${publicBase()}/api/t/o?l=${leadId}&m=${mail}&s=${trackSig(`${leadId}:${mail}:o`)}`;
export function checkTrack({ l, m, u, s }) {
  const want = trackSig(u !== undefined ? `${l}:${m}:${u}` : `${l}:${m}:o`);
  const a = Buffer.from(String(s || "")), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function textToHtml(text, meet = null) {
  const linkify = (s) => escH(s).replace(/https?:\/\/[^\s<]+/g, (u) => {
    const echt = u.replace(/&amp;/g, "&");
    const href = meet?.kliks && !echt.includes("/api/b2b/afmelden") ? trackLink(meet.leadId, meet.mail, echt) : echt;
    return `<a href="${escH(href)}" style="color:#1C0747">${u}</a>`;
  });
  const pixel = meet?.opens ? `<img src="${escH(trackPixel(meet.leadId, meet.mail))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">` : "";
  // Visitekaartje van Maxim tussen de mail en de wettelijke voetregel.
  const [hoofd, ...rest] = text.split(/\n\n--\n/);
  const voet = rest.join("\n\n--\n");
  const kaart = `<p style="margin:18px 0 18px"><a href="${escH(publicBase())}" style="text-decoration:none"><img src="${escH(publicBase())}/assets/brand/maxim-visitekaart.png" width="400" height="200" alt="Maxim, websiteadviseur bij Sitemaker · +31 6 19 92 12 22 · www.sitemaker.nl · hallo@sitemaker.nl" style="display:block;border:0;width:100%;max-width:400px;height:auto;border-radius:10px"></a></p>`;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"></head><body style="margin:0;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#1C0747">
${hoofd.split(/\n\n/).map((p) => {
    // Een regel met alleen de link naar de voorbeeldwebsite wordt een duidelijke knop.
    const regels = p.split("\n");
    const knop = regels.findIndex((r) => /^https?:\/\/\S+\/voorbeeld\/\S+$/.test(r.trim()));
    if (knop < 0) return `<p style="margin:0 0 12px">${linkify(p).replace(/\n/g, "<br>")}</p>`;
    const url = regels[knop].trim();
    const href = meet?.kliks ? trackLink(meet.leadId, meet.mail, url) : url;
    const tekst = regels.filter((_, i) => i !== knop).join("\n");
    return `${tekst ? `<p style="margin:0 0 12px">${linkify(tekst).replace(/\n/g, "<br>")}</p>` : ""}<p style="margin:4px 0 18px"><a href="${escH(href)}" style="display:inline-block;background:#FF5757;color:#1C0747;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px">Bekijk jullie nieuwe website</a></p>`;
  }).join("")}${kaart}${voet ? `<p style="margin:0;font-size:12px;line-height:18px;color:#6B6585">${linkify(voet).replace(/\n/g, "<br>")}</p>` : ""}${pixel}</body></html>`;
}
// Opens en klikken registreren. Binnen 60 s na verzenden of van bekende scanners telt niet (virusscanners openen alles meteen).
const SCANNER = /bot|crawl|spider|preview|scanner|safelinks|barracuda|mimecast|proofpoint|curl|python|go-http|headless/i;
export async function recordTrack({ l, m, u, ua = "" }) {
  const lead = Number(l); if (!lead) return false;
  const mail = m === "opvolging" ? "opvolging" : "eerste";
  if (SCANNER.test(ua)) return false;
  const sent = await one("SELECT MAX(created_at) AS at FROM mail_log WHERE ref = $1 AND kind = $2 AND ok", [`lead:${lead}`, `b2b-${mail}`]);
  if (!sent?.at || Date.now() - new Date(sent.at).getTime() < 60000) return false;
  await q("INSERT INTO mail_events (lead_id, mail, soort, url) VALUES ($1,$2,$3,$4)", [lead, mail, u !== undefined ? "klik" : "open", u !== undefined ? str(Buffer.from(String(u), "base64url").toString(), 500) : ""]).catch(() => {});
  return true;
}

// ---------------------------------------------------------------- versturen (vanuit tick)
export async function sendBatch({ max = 3, budgetMs = 9000 } = {}) {
  if (!mailReady()) return { skipped: "mail" };
  const s = await getSettings();
  const now = new Date();
  const wd = new Date(dayKey(now) + "T12:00:00Z").getUTCDay();
  const [from, to] = s.b2b.sendHours || [8, 17];
  if (env("B2B_ANY_TIME") !== "1" && (wd === 0 || wd === 6 || hourAms(now) < from || hourAms(now) >= to)) return { skipped: "buiten verzendtijd" };
  const [{ n: today }] = await q("SELECT COUNT(*)::int AS n FROM mail_log WHERE kind LIKE 'b2b-%' AND ok AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')");
  let room = Math.max(0, Number(s.b2b.dailyMax || 40) - today);
  if (!room) return { skipped: "daglimiet" };
  const started = Date.now();
  // Een eerste mail gaat alleen uit met een klare voorbeeldwebsite (besluit Maxim). Lukt het concept niet, dan gaat de lead terug.
  await q(`UPDATE leads l SET status = CASE WHEN c.status = 'overgeslagen' THEN 'overgeslagen' ELSE 'nieuw' END,
             reject_reason = CASE WHEN c.status = 'overgeslagen' THEN 'Geen voorbeeldwebsite mogelijk: ' || COALESCE(NULLIF(c.reden,''), 'onbekend') ELSE l.reject_reason END,
             error = CASE WHEN c.status = 'fout' THEN 'Voorbeeldwebsite mislukt; maak hem opnieuw en keur daarna goed.' ELSE l.error END, updated_at = NOW()
           FROM concepts c WHERE c.lead_id = l.id AND l.status = 'goedgekeurd' AND c.status IN ('fout','overgeslagen')`);
  await q("UPDATE leads SET status = 'nieuw', error = 'Geen website: zonder voorbeeldwebsite sturen we geen eerste mail.', updated_at = NOW() WHERE status = 'goedgekeurd' AND website = ''");
  const todo = await q(`${LEAD_SELECT} WHERE l.status IN ('goedgekeurd','opvolging_goedgekeurd') AND l.email IS NOT NULL
    AND (l.status = 'opvolging_goedgekeurd' OR c.status = 'klaar')
    ORDER BY l.updated_at LIMIT $1`, [Math.min(max, room)]);
  let sent = 0, failed = 0;
  for (const lead of todo) {
    if (Date.now() - started > budgetMs) break;
    const supp = await one("SELECT 1 FROM suppressions WHERE email = $1", [lead.email.toLowerCase()]);
    if (supp) { await q("UPDATE leads SET status = 'afgemeld', updated_at = NOW() WHERE id = $1", [lead.id]); continue; }
    const kind = lead.status === "opvolging_goedgekeurd" ? "opvolging" : "eerste";
    const { subject, body } = compose(lead, kind, s);
    // Voorbeeld blijft vanaf nu conceptDagen te bekijken (staat zo in de mail).
    if (kind === "eerste") await q("UPDATE concepts SET expires_at = NOW() + ($2 || ' days')::interval, updated_at = NOW() WHERE lead_id = $1", [lead.id, String(conceptDagen(s))]);
    const res = await sendMail({
      to: lead.email, subject, text: body, html: textToHtml(body, { leadId: lead.id, mail: kind, opens: s.b2b.meten?.opens !== false, kliks: s.b2b.meten?.kliks !== false }), kind: `b2b-${kind}`, ref: `lead:${lead.id}`,
      fromName: `${s.b2b.senderName || ""} | Sitemaker`.replace(/^ \| /, ""),
      headers: { "List-Unsubscribe": `<${unsubUrl(lead.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      inReplyTo: kind === "opvolging" ? lead.message_id || undefined : undefined,
      references: kind === "opvolging" ? lead.message_id || undefined : undefined,
    });
    if (res.ok) {
      sent++;
      if (kind === "opvolging") await q("UPDATE leads SET status = 'opgevolgd', followup_at = NOW(), followup_id = $2, error = '', updated_at = NOW() WHERE id = $1", [lead.id, res.messageId]);
      else await q("UPDATE leads SET status = 'verstuurd', sent_at = NOW(), sent_subject = $2, message_id = $3, error = '', updated_at = NOW() WHERE id = $1", [lead.id, subject, res.messageId]);
    } else {
      failed++;
      if (res.code === "EAUTH" || [421, 450, 451, 452].includes(res.responseCode)) { await q("UPDATE leads SET error = $2 WHERE id = $1", [lead.id, res.error]); break; }
      await q("UPDATE leads SET status = 'fout', error = $2, updated_at = NOW() WHERE id = $1", [lead.id, res.error]);
    }
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
  return { sent, failed };
}

// ---------------------------------------------------------------- inbox: reacties, bounces en "stop"
export async function scanInbox({ days = 14, max = 150 } = {}) {
  const m = mailEnv();
  if (!m.user || !m.pass || env("MAIL_TRANSPORT") === "capture") return { skipped: true };
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.user, pass: m.pass }, logger: false, socketTimeout: 15000 });
  const leads = await q("SELECT id, email, message_id, followup_id, status FROM leads WHERE status IN ('verstuurd','opvolging_goedgekeurd','opgevolgd') AND email IS NOT NULL");
  const byEmail = new Map(leads.map((l) => [l.email.toLowerCase(), l]));
  const byMsg = new Map();
  for (const l of leads) { if (l.message_id) byMsg.set(l.message_id, l); if (l.followup_id) byMsg.set(l.followup_id, l); }
  let replies = 0, bounces = 0, tickets = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - days * 86400000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      for await (const msg of client.fetch(uids.slice(-max), { envelope: true, source: { maxLength: 60000 } }, { uid: true })) {
        const from = msg.envelope?.from?.[0]?.address?.toLowerCase() || "";
        const src = msg.source?.toString("utf8") || "";
        const inReply = (msg.envelope?.inReplyTo || "").trim();
        if (/mailer-daemon|postmaster/i.test(from)) {
          const hit = [...byEmail.keys()].find((e) => src.toLowerCase().includes(e));
          if (hit) { await q("UPDATE leads SET status = 'fout', error = 'Mail kwam niet aan (bounce).', bounced_at = COALESCE(bounced_at, NOW()), updated_at = NOW() WHERE id = $1 AND status <> 'fout'", [byEmail.get(hit).id]); bounces++; }
          continue;
        }
        const lead = byMsg.get(inReply) || byEmail.get(from);
        if (!lead) {
          // Geen B2B-reactie: is het een klant, dan wordt het een klantvraag (Emma).
          if (from && from !== (m.user || "").toLowerCase() && !/no-?reply|notifications?@/i.test(from)) {
            try {
              const { simpleParser } = await import("mailparser");
              const { ticketFromMail } = await import("./service.mjs");
              const p = await simpleParser(src);
              const body = String(p.text || "").split(/\n(?:Op .{5,120} schreef|On .{5,120} wrote|-{2,} ?Oorspronkelijk bericht|From: )/)[0].trim();
              const t = await ticketFromMail({ from, naam: msg.envelope?.from?.[0]?.name || "", subject: msg.envelope?.subject || "", body: body || "(lege mail)", messageId: (msg.envelope?.messageId || "").trim(), inReplyTo: inReply });
              if (t) tickets++;
            } catch (e) { console.log("[inbox] klantvraag", e.message); }
          }
          continue;
        }
        const body = src.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/=\r?\n/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
        const stop = /\b(afmelden|uitschrijven|geen interesse|niet meer mailen|stop)\b/i.test(body.slice(0, 200));
        await q(`UPDATE leads SET status = $2, reply_at = $3, reply_snippet = $4, updated_at = NOW() WHERE id = $1 AND status NOT IN ('reactie','afspraak','klant','afgemeld')`,
          [lead.id, stop ? "afgemeld" : "reactie", msg.envelope?.date || new Date(), body]);
        if (/\b(spam|ongevraagd|klacht)\b/i.test(body.slice(0, 300))) await q("UPDATE leads SET klacht_at = COALESCE(klacht_at, NOW()) WHERE id = $1", [lead.id]);
        if (stop) await q("INSERT INTO suppressions (email, reason) VALUES ($1, 'reactie: stop') ON CONFLICT DO NOTHING", [lead.email.toLowerCase()]);
        replies++;
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { client.close(); } catch {}
    return { error: e.authenticationFailed ? "Inloggen op de inbox lukt niet." : `Inbox niet bereikbaar (${e.code || e.message})` };
  }
  return { replies, bounces, tickets };
}

// ---------------------------------------------------------------- scout (Outscraper, Google Maps)
async function osc(path, params) {
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`https://api.app.outscraper.com${path}${qs.toString() ? "?" + qs : ""}`, { headers: { "X-API-KEY": env("OUTSCRAPER_API_KEY") }, signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errorMessage) { const e = new Error(d.errorMessage || `status ${r.status}`); e.status = r.status; throw e; }
  return d;
}

// Eén keer per werkdag: per categorie een zoekopdracht in de volgende plaats.
export async function runScout({ force = false } = {}) {
  const s = await getSettings();
  const sc = s.b2b.scout || {};
  if (!scoutReady()) return { skipped: true };
  const st = (await one("SELECT value FROM settings WHERE key = 'scout_state'"))?.value || {};
  // Lopende zoekopdrachten altijd ophalen, ook als de scout (nog) uit staat (bijv. na "Scout nu zoeken").
  if (!sc.active && !force) return st.pending?.length ? collect(st) : { skipped: true };
  const day = dayKey();
  const wd = new Date(day + "T12:00:00Z").getUTCDay();
  if (!force && (st.lastDay === day || wd === 0 || wd === 6 || hourAms() < 7)) return collect(st);
  const cats = (sc.categories || []).filter(Boolean), places = (sc.places || []).filter(Boolean);
  if (!cats.length || !places.length) return { skipped: "geen categorieën of plaatsen" };
  st.pending = st.pending || [];
  const per = Math.max(5, Math.min(60, Math.ceil(Number(sc.perDay || 20) / cats.length) * 2));
  for (const cat of cats) {
    const i = (st.cursor?.[cat] || 0) % places.length;
    const d = await osc("/maps/search-v3", { query: `${cat}, ${places[i]}, Nederland`, organizationsPerQueryLimit: per, language: "nl", region: "NL", async: true });
    st.pending.push({ id: d.id, cat, place: places[i], at: new Date().toISOString() });
    st.history = [{ cat, place: places[i], at: new Date().toISOString(), status: "bezig" }, ...(st.history || [])].slice(0, 60);
    st.cursor = { ...(st.cursor || {}), [cat]: i + 1 };
  }
  st.lastDay = day;
  await q(`INSERT INTO settings (key, value) VALUES ('scout_state', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(st)]);
  return { submitted: cats.length };
}

async function collect(st) {
  if (!st.pending?.length) return { idle: true };
  const still = []; let added = 0;
  const hist = (p, upd) => { const h = (st.history || []).find((x) => x.at === p.at && x.cat === p.cat && x.place === p.place); if (h) Object.assign(h, upd); };
  for (const p of st.pending) {
    let d; try { d = await osc(`/requests/${p.id}`); } catch { still.push(p); continue; }
    if (String(d.status).toLowerCase() !== "success") { if (Date.now() - Date.parse(p.at) < 6 * 3600000) still.push(p); else hist(p, { status: "mislukt" }); continue; }
    const rows = (Array.isArray(d.data) ? d.data : []).flat();
    let nieuw = 0;
    for (const r of rows) {
      const site = r.site || r.website || "";
      const dom = domainOf(site);
      if (/permanently|closed/i.test(String(r.business_status || ""))) continue;
      if (dom && /facebook\.|instagram\.|linkedin\.|google\.|wix\.com|business\.site/i.test(dom)) continue;
      // Bedrijven zonder website zijn juist interessant: die hebben er nog geen.
      const res = await one(`INSERT INTO leads (company, website, domain, city, category, phone, source, status)
                             VALUES ($1,$2,$3,$4,$5,$6,'scout','kandidaat') ON CONFLICT DO NOTHING RETURNING id`,
        [str(r.name, 200), dom ? normUrl(site) : "", dom || "", str(r.city, 100), p.cat, str(r.phone, 40)]).catch(() => null);
      if (res) { added++; nieuw++; }
    }
    hist(p, { status: "klaar", gevonden: rows.length, nieuw, klaarOp: new Date().toISOString() });
  }
  st.pending = still;
  await q(`INSERT INTO settings (key, value) VALUES ('scout_state', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(st)]);
  return { added };
}

// ---------------------------------------------------------------- research: mailadres en openingszin
async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Sitemaker research)" }, redirect: "follow", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { html: "", text: "" };
    const html = (await r.text()).slice(0, 400000);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#64;|&commat;/g, "@").replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();
    return { html, text };
  } catch { return { html: "", text: "" }; }
}
function findEmails(html, text, dom) {
  const set = new Set();
  for (const m of (html + " " + text).matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) set.add(m[0].toLowerCase().replace(/\.$/, ""));
  return [...set].filter((e) => EMAIL_RE.test(e) && !FREEMAIL.test(e) && !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/sentry|wixpress|example|domain\.|email\.com/.test(e))
    .sort((a, b) => (b.endsWith("@" + dom) ? 1 : 0) - (a.endsWith("@" + dom) ? 1 : 0));
}
async function hasMx(domain) {
  try { return (await dns.resolveMx(domain)).length > 0; } catch (e) { return e.code === "ETIMEOUT"; }
}

async function claude({ system, prompt }) {
  const base = (env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/+$/, "");
  const r = await fetch(base + "/v1/messages", {
    method: "POST", headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("AI_MODEL_LICHT", "claude-haiku-5-5"), max_tokens: 3000, system, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `status ${r.status}`);
  if (env("ANTHROPIC_BASE_URL") && d.usage) { const { meet, aiCredits } = await import("./credits.mjs"); await meet("ai_credits", aiCredits(d.model || env("AI_MODEL_LICHT", "claude-haiku-5-5"), d.usage)); }
  return (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

const SITEMAKER = `Sitemaker (sitemaker.nl) bouwt professionele websites voor bedrijven (geen webshops): €299,95 eenmalig + €69,95 per maand, binnen 48 uur (2 werkdagen) online, hosting en 4 wijzigingen per maand inbegrepen via een eigen klantenportaal. Toon: zakelijk, kort, eerlijk, je-vorm. Nooit iets verzinnen.`;

export async function researchLead(lead) {
  if (!lead.website) {
    // Geen website: dan is ook geen algemeen mailadres te vinden. Handmatig benaderen (telefoon) of overslaan.
    await q("UPDATE leads SET status = 'overgeslagen', reject_reason = 'geen website (bel ze eventueel)', researched_at = NOW(), updated_at = NOW() WHERE id = $1", [lead.id]);
    return { skipped: true };
  }
  const home = await fetchText(lead.website);
  let contact = { html: "", text: "" };
  const link = (home.html.match(/href=["']([^"']*contact[^"']*)["']/i) || [])[1];
  try { contact = await fetchText(new URL(link || "/contact", lead.website).href); } catch {}
  const text = (home.text + " " + contact.text).slice(0, 30000);
  const emails = findEmails(home.html + contact.html, text, lead.domain);
  const generic = emails.filter((e) => GENERIC.test(e));
  let reason = "";
  if (!home.text) reason = "website niet bereikbaar";
  else if (!generic.length) reason = emails.length ? "alleen persoonlijke adressen" : "geen mailadres op de site";
  const email = generic[0];
  if (!reason && !(await hasMx(email.split("@")[1]))) reason = "domein ontvangt geen mail";
  if (!reason && (await one("SELECT 1 FROM suppressions WHERE email = $1", [email]))) reason = "eerder afgemeld";
  if (!reason && (await one("SELECT 1 FROM leads WHERE lower(email) = $1 AND id <> $2", [email, lead.id]))) reason = "adres staat al bij een andere lead";
  if (reason) {
    await q("UPDATE leads SET status = 'overgeslagen', reject_reason = $2, researched_at = NOW(), updated_at = NOW() WHERE id = $1", [lead.id, reason]);
    return { reason };
  }
  let intro = "", note = "";
  const s = await getSettings();
  if (aiReady() && s.b2b.ai?.research !== false && text.length > 200) {
    try {
      const out = await claude({
        system: SITEMAKER + "\nJe bent researcher bij Sitemaker en bereidt een eerste zakelijke mail voor.",
        prompt: `Bedrijf: ${lead.company} (${lead.category}, ${lead.city}). Website: ${lead.website}\nTekst van hun site (ingekort):\n"""${text.slice(0, 6000)}"""\n\nSchrijf één openingszin (max. 30 woorden, je-vorm: je/jullie, nooit u) die verwijst naar iets concreets en waars van hun bedrijf. Geen complimenten over hun huidige website en geen kritiek erop. Niets verzinnen; is er niets bruikbaars, laat intro leeg.\nGeef ook een notitie (max. 20 woorden): wat voor bedrijf, en is hun huidige site verouderd, ontbreekt er iets (bijv. geen contactformulier, niet mobielvriendelijk)? Alleen wat uit de tekst blijkt.\nAntwoord alleen met JSON: {"intro":"...","notitie":"..."}`,
      });
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      intro = str(j.intro, 300); note = str(j.notitie, 200);
    } catch (e) { console.log("[b2b] ai", e.message); }
  }
  await q("UPDATE leads SET email = $2, status = 'nieuw', intro = $3, research_note = $4, researched_at = NOW(), reject_reason = '', updated_at = NOW() WHERE id = $1",
    [lead.id, email, intro, note]);
  return { email };
}

export async function runResearch({ max = 2, budgetMs = 8000 } = {}) {
  const started = Date.now();
  const todo = await q("SELECT * FROM leads WHERE status = 'kandidaat' ORDER BY created_at LIMIT $1", [max]);
  let done = 0;
  for (const l of todo) { if (Date.now() - started > budgetMs) break; await researchLead(l).catch((e) => console.log("[b2b] research", e.message)); done++; }
  return { done };
}

// ---------------------------------------------------------------- beheer vanuit HQ
export async function addLead(b, userId) {
  const email = b.email ? cleanEmail(b.email) : null;
  if (email && !EMAIL_RE.test(email)) fail(400, `Ongeldig e-mailadres: ${b.email}`);
  const website = normUrl(b.website || "");
  const company = str(b.company, 200) || domainOf(website) || (email ? email.split("@")[1] : "");
  if (!company) fail(400, "Vul minimaal een bedrijfsnaam, website of e-mailadres in.");
  if (email && (await one("SELECT 1 FROM suppressions WHERE email = $1", [email]))) fail(400, `${email} heeft zich eerder afgemeld en wordt niet opnieuw toegevoegd.`);
  const status = email ? "nieuw" : website ? "kandidaat" : "nieuw";
  const row = await one(`INSERT INTO leads (company, email, website, domain, city, category, phone, source, status, notes)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *`,
    [company, email, website, website ? domainOf(website) : "", str(b.city, 100), str(b.category, 80), str(b.phone, 40), b.source || "handmatig", status, str(b.notes, 1000)]);
  if (!row) return { duplicate: true };
  await audit(userId, null, "lead.toegevoegd", { id: row.id });
  return { lead: row };
}

export function parseCsv(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (l) => { const out = []; let cur = "", inQ = false; for (const ch of l) { if (ch === '"') inQ = !inQ; else if (ch === sep && !inQ) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const col = { company: idx(["bedrijf", "bedrijfsnaam", "company", "naam", "name"]), email: idx(["email", "e-mail", "mail"]), website: idx(["website", "site", "url"]), city: idx(["plaats", "stad", "city"]), category: idx(["categorie", "branche", "category"]), phone: idx(["telefoon", "phone", "tel"]) };
  if (col.company < 0 && col.email < 0 && col.website < 0) fail(400, "Ik herken de kolommen niet. Gebruik een kopregel met bijvoorbeeld: bedrijf;email;website;plaats;categorie");
  return lines.slice(1, 2001).map(split).map((r) => Object.fromEntries(Object.entries(col).filter(([, i]) => i >= 0).map(([k, i]) => [k, r[i] || ""])));
}

export function mailPreview(lead, kind, s) { return compose(lead, kind, s); }
