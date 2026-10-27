// Concept-websites voor leads ("zo kan uw nieuwe website eruitzien").
// 1. De agent bekijkt hun huidige website: teksten, diensten, contact, openingstijden, foto's, kleuren en een paar feiten (https, mobiel, jaartal).
// 2. Claude maakt daarvan een content.json in de Sitemaker-opmaak. Alleen feiten van hun eigen site; telefoon/e-mail/tijden worden nagecontroleerd.
// 3. Het concept staat op sitemaker.nl/voorbeeld/<token> (noindex, verloopt), met een balk en knop naar de kennismaking.
// 4. Wordt het een klant, dan start "Website aanmaken" vanuit dit concept.
import crypto from "node:crypto";
import { q, one, str, env, fail, escH, publicBase, getSettings, audit, OFFER } from "./core.mjs";
import { putFile, getFile, deleteFile } from "./files.mjs";
import { claude, aiReady, parseJson } from "./ai.mjs";
import { notifyStaff } from "./mail.mjs";
import { render } from "../../templates/klantsite/render.mjs";
import { ontwerp, toonOntwerp, sanitize } from "./ontwerp.mjs";
import { BEWEGING } from "./beweging.mjs";

export const ONTWERP = { fonts: ["klassiek", "luxe", "editorial", "warm", "modern", "ambacht", "stoer", "strak", "speels"], hero: ["split", "volbeeld", "kader", "typo", "collage"], diensten: ["kaarten", "rijen", "lijst", "foto"], vorm: ["rond", "zacht", "strak"], sfeer: ["licht", "donker", "merk"], kopstijl: ["lijn", "midden", "groot"] };
export const THEMAS = { elegant: "Elegant (donker, goud)", stoer: "Stoer (geel, zwart)", natuur: "Natuur (crème, groen)", zacht: "Zacht (lila, modern)" };
export const conceptUrl = (token) => `${publicBase()}/voorbeeld/${token}`;
const UA = "Mozilla/5.0 (compatible; SitemakerBot/1.0; +https://sitemaker.nl)";

// ---------------------------------------------------------------- ophalen en ontleden
async function get(url, { max = 600000, timeout = 6000, binary = false } = {}) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: binary ? "image/*" : "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > max) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) return null;
    return { url: r.url || url, type: (r.headers.get("content-type") || "").toLowerCase(), buf, text: binary ? "" : buf.toString("utf8") };
  } catch { return null; }
}
const decode = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&[a-z]+;/gi, " ");
function textOf(html) {
  return decode(html.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : ""; };
const abs = (u, base) => { try { const x = new URL(u, base); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

function imageCandidates(html, base) {
  const out = [];
  const add = (u, alt = "", hint = "") => { const a = abs(u, base); if (a && !out.some((x) => x.url === a)) out.push({ url: a, alt: str(alt, 120), hint }); };
  for (const m of html.matchAll(/<meta[^>]+>/gi)) if (/property=["']og:image["']/i.test(m[0])) add(attr(m[0], "content"), "", "og");
  // Logo: plaatjes in de kop of in de link naar de homepage, of met "logo" in naam/alt/class. Score bepaalt de volgorde.
  const kopEind = Math.max(0, html.search(/<\/header>/i));
  const thuis = [...html.matchAll(/<a\b[^>]*href=["'](\/|\.\/|https?:\/\/[^"'\/]+\/?)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi)].map((m) => m[2]).join(" ");
  // Logo uit gestructureerde data (schema.org) of het site-icoon in de kop.
  for (const m of html.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+\.(?:png|jpe?g|webp|svg)[^"]*)"/gi)) { const a = abs(m[1].replace(/\\\//g, "/"), base); if (a && !out.some((x) => x.url === a)) out.push({ url: a, alt: "", hint: "logo", score: 4 }); }
  let eersteInKop = true;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    const srcset = attr(t, "srcset") || attr(t, "data-srcset");
    let src = attr(t, "data-src") || attr(t, "data-lazy-src") || attr(t, "src");
    if (srcset) { const best = srcset.split(",").map((x) => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || "0") - parseInt(a[1] || "0"))[0]; if (best?.[0]) src = best[0]; }
    if (!src || src.startsWith("data:")) continue;
    const naamLogo = /logo/i.test(src + " " + attr(t, "alt") + " " + attr(t, "class") + " " + attr(t, "id"));
    const inKop = kopEind && m.index < kopEind, inThuis = thuis.includes(t);
    const eerste = inKop && eersteInKop; if (inKop) eersteInKop = false;
    const score = (naamLogo ? 3 : 0) + (inThuis ? 3 : 0) + (inKop ? 2 : 0) + (eerste ? 1 : 0) - (/award|badge|keurmerk|review|rating|partner|sponsor|certific/i.test(src + " " + attr(t, "alt")) ? 6 : 0);
    if (score >= 3) { const a = abs(src, base); if (a && !out.some((x) => x.url === a)) out.push({ url: a, alt: str(attr(t, "alt"), 120), hint: "logo", score }); continue; }
    add(src, attr(t, "alt"), "");
  }
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) add(m[2], "", "bg");
  return out.filter((x) => !(x.hint !== "logo" && /\.svg(\?|$)/i.test(x.url)) && !/\.(gif|ico)(\?|$)/i.test(x.url) && !/(pixel|tracking|spinner|loader|icon|sprite|emoji|avatar|gravatar|badge|flag|facebook|instagram|twitter|linkedin|whatsapp|google|maps|cookie|payment|ideal|visa|mastercard)/i.test(x.url));
}

// Afmetingen uit de eerste bytes (JPEG, PNG, WebP).
export function imageSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return { type: "image/png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const mk = buf[i + 1];
        if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { type: "image/jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const f = buf.toString("ascii", 12, 16);
      if (f === "VP8 ") return { type: "image/webp", w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === "VP8L") { const b = buf.readUInt32LE(21); return { type: "image/webp", w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      if (f === "VP8X") return { type: "image/webp", w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    }
  } catch {}
  return null;
}

const THEMA_STANDAARD = new Set(["#2ea3f2", "#0073aa", "#21759b", "#007bff", "#0d6efd", "#337ab7", "#1e73be", "#0274be", "#3858e9", "#2271b1", "#135e96", "#00a0d2", "#46b450", "#dc3232", "#ffb900", "#e74c3c", "#3498db", "#7ad03a", "#a46497", "#96588a", "#0693e3", "#cf2e2e", "#ff6900", "#fcb900", "#7bdcb5", "#00d084", "#8ed1fc", "#9b51e0", "#f78da7", "#abb8c3", "#6c757d", "#17a2b8", "#28a745", "#dc3545", "#ffc107",
  // standaardkleuren van websitebouwers (Hostinger, Elementor, Astra, Kadence, Wix, Squarespace, Bootstrap 5)
  "#673de6", "#5025d1", "#8c85ff", "#d5dfff", "#2f1c6a", "#1f1346", "#ebe4ff", "#22a857", "#fc5185", "#ffcd35", "#00b090",
  "#6ec1e4", "#54595f", "#7a7a7a", "#61ce70", "#4054b2", "#23a455", "#0170b9", "#3a3a3a", "#2b6cb0", "#215387", "#3182ce", "#2c5282",
  "#116dff", "#3899ec", "#4eb7f5", "#0f62fe", "#6610f2", "#6f42c1", "#d63384", "#fd7e14", "#20c997", "#0dcaf0", "#198754"]);
function colorsOf(css) {
  const count = {};
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase(); if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40 || max < 40 || min > 225) continue; // grijs, bijna zwart of bijna wit
    if (THEMA_STANDAARD.has("#" + h)) continue; // standaardkleuren van WordPress-thema's en frameworks, niet hun huisstijl
    count["#" + h] = (count["#" + h] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
}

function analyse(home, html, text) {
  const jaren = [...text.matchAll(/(?:©|copyright|\(c\))\s*(?:[\w&.\- ]{0,40}?)?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)].map((m) => Number(m[2] || m[1]));
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]*>/i) || [""])[0];
  return {
    url: home.url,
    https: home.url.startsWith("https://"),
    mobiel: /<meta[^>]+name=["']viewport["']/i.test(html),
    jaartal: jaren.length ? Math.max(...jaren) : null,
    platform: str(attr(gen, "content"), 60) || (/wp-content/.test(html) ? "WordPress" : /wix\.com|wixstatic/.test(html) ? "Wix" : /jimdo/.test(html) ? "Jimdo" : ""),
    titel: str(decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""), 120),
    omschrijving: !!(html.match(/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{20,}/i)),
    formulier: /<form\b/i.test(html),
    belknop: /href=["']tel:/i.test(html),
  };
}
export function verbeterpunten(a) {
  if (!a || !a.url) return [];
  const p = [];
  if (!a.https) p.push("Geen beveiligde verbinding (https)");
  if (!a.mobiel) p.push("Niet ingericht voor mobiel");
  if (a.jaartal && a.jaartal < new Date().getFullYear() - 1) p.push(`Jaartal in de voettekst: ${a.jaartal}`);
  if (!a.omschrijving) p.push("Geen omschrijving voor Google");
  if (!a.belknop) p.push("Geen bel-knop");
  if (!a.formulier) p.push("Geen contactformulier");
  return p;
}

// Haalt de site op: home + een paar relevante subpagina's, beelden en kleuren.
export async function scan(website) {
  const home = await get(website);
  if (!home || !/html/.test(home.type || "text/html")) return { error: "Website niet bereikbaar" };
  const html = home.text;
  const host = new URL(home.url).host;
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ url: abs(m[1], home.url), label: textOf(m[2]).toLowerCase() }))
    .filter((l) => l.url && new URL(l.url).host === host && l.url !== home.url && !/\.(pdf|jpe?g|png|zip)$/i.test(l.url))
    .filter((l) => /(dienst|behandel|prijs|tarie|over|wie|team|contact|werkwijze|aanbod|specialis|praktijk|salon|menu|openingstijd|offerte|aanvra|intake|afspra|aanmeld|inschrijv)/.test(l.url.toLowerCase() + " " + l.label))
    // pagina's met een formulier (offerte, intake, afspraak, contact) eerst, die nemen we over
    .sort((a, b) => Number(/(offerte|aanvra|intake|afspra|aanmeld|inschrijv|contact)/.test(b.url.toLowerCase() + " " + b.label)) - Number(/(offerte|aanvra|intake|afspra|aanmeld|inschrijv|contact)/.test(a.url.toLowerCase() + " " + a.label)));
  const seen = new Set(), sub = [];
  for (const l of links) { const k = l.url.replace(/\/$/, ""); if (!seen.has(k)) { seen.add(k); sub.push(l.url); } if (sub.length >= 3) break; }
  const pages = [{ url: home.url, html }];
  for (const p of await Promise.all(sub.map((u) => get(u)))) if (p?.text) pages.push({ url: p.url, html: p.text });
  const text = pages.map((p) => `### ${p.url}\n${textOf(p.html)}`).join("\n\n").slice(0, 16000);
  // kleuren: inline CSS + eerste stylesheet
  let css = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join("\n") + (html.match(/style="[^"]*"/gi) || []).join(" ");
  const sheet = (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/i) || [""])[0];
  if (sheet) { const s = await get(abs(attr(sheet, "href"), home.url), { max: 400000, timeout: 4000 }); if (s?.text) css += s.text; }
  const cands = pages.flatMap((p) => imageCandidates(p.html, p.url));
  return { home, html, text, analysis: { ...analyse(home, html, textOf(html)), formulieren: formulierenUit(pages), boeken: boekingUit(pages) }, kleuren: colorsOf(css), cands };
}

// Formulieren op hun site (offerte, intake, afspraak, contact): de vragen en keuzes nemen we over in het nieuwe ontwerp.
// Zoek-, nieuwsbrief- en inlogformulieren tellen niet.
export function formulierenUit(pages) {
  const uit = [];
  for (const p of pages) {
    for (const m of p.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
      const [, fattr, f] = m;
      if (/type=["']?(search|password)/i.test(f) || /role=["']search|search|zoek|login|inlog|newsletter|nieuwsbrief|mailchimp|subscribe/i.test(fattr)) continue;
      const labels = {};
      for (const l of f.matchAll(/<label\b[^>]*for=["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi)) labels[l[1]] = textOf(l[2]);
      const velden = [], groepen = {};
      for (const v of f.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>|<(input|textarea)\b([^>]*)>/gi)) {
        const tag = v[3] ? v[3].toLowerCase() : "select", a = v[3] ? v[4] : v[1], inhoud = v[3] ? "" : v[2];
        const type = tag === "input" ? (attr(`<x ${a}>`, "type") || "text").toLowerCase() : tag;
        if (["hidden", "submit", "button", "image", "reset", "password", "file"].includes(type)) continue;
        const naam = attr(`<x ${a}>`, "name"), id = attr(`<x ${a}>`, "id");
        if (/(captcha|honeypot|recaptcha|_wp|nonce|website_url|^hp)/i.test(naam + " " + id) || /display:\s*none/i.test(a)) continue;
        const label = str(labels[id] || attr(`<x ${a}>`, "aria-label") || attr(`<x ${a}>`, "placeholder") || naam.replace(/[_\-[\]]+/g, " "), 80).replace(/\s*\*\s*$/, "");
        const verplicht = /\brequired\b|aria-required=["']true/i.test(a) || /\*\s*$/.test(labels[id] || "");
        if (type === "radio" || type === "checkbox") {
          const g = groepen[naam] || (groepen[naam] = { label: str(naam.replace(/[_\-[\]]+/g, " "), 60), type, opties: [], verplicht });
          if (g.opties.length < 12) g.opties.push(label || attr(`<x ${a}>`, "value"));
          if (g.opties.length === 1) velden.push(g);
          continue;
        }
        const opties = tag === "select" ? [...inhoud.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => str(textOf(o[1]), 60)).filter((o) => o && !/^(-+|kies|selecteer|maak een keuze)/i.test(o)).slice(0, 15) : undefined;
        if (label) velden.push({ label, type, ...(opties ? { opties } : {}), ...(verplicht ? { verplicht } : {}) });
      }
      if (velden.length < 2) continue;
      const knop = str(textOf((f.match(/<button\b[^>]*>([\s\S]*?)<\/button>/i) || [])[1] || "") || attr((f.match(/<input\b[^>]*type=["']submit["'][^>]*>/i) || [""])[0], "value"), 40);
      const sleutel = velden.map((v) => v.label).join("|");
      if (uit.some((x) => x.velden.map((v) => v.label).join("|") === sleutel)) continue;
      uit.push({ pagina: p.url, velden: velden.slice(0, 16), knop: knop || "" });
      if (uit.length >= 3) return uit;
    }
  }
  return uit;
}

// Online boeken via een extern systeem (Salonized, Treatwell, Calendly …): de afspraakknop linkt daarheen.
const BOEKSYSTEMEN = /(salonized\.com|treatwell\.nl|calendly\.com|fresha\.com|planity\.com|zenchef\.com|bookings?\.|afspraak\.|onlineafspraken\.nl|timely\.|setmore\.com|simplybook\.|acuityscheduling\.com|booksy\.com|wix\.com\/booking|shore\.com|clinicminds|phorest\.com|mijnafspraak|reserveren\.)/i;
export function boekingUit(pages) {
  const uit = [];
  for (const p of pages) for (const m of p.html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!BOEKSYSTEMEN.test(m[1]) || uit.some((u) => u.url === m[1])) continue;
    uit.push({ url: m[1].slice(0, 300), tekst: str(textOf(m[2]), 60) });
    if (uit.length >= 2) return uit;
  }
  return uit;
}

// Kleuren uit een SVG-logo (betrouwbaarder dan de CSS van de site).
export function svgKleuren(buf) {
  const t = buf.toString("utf8");
  const tel = {};
  for (const m of t.matchAll(/(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase(); if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (Math.max(r, g, b) - Math.min(r, g, b) < 30 && (Math.max(r, g, b) < 50 || Math.min(r, g, b) > 220)) continue; // zwart/wit
    tel["#" + h] = (tel["#" + h] || 0) + 1;
  }
  return Object.entries(tel).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
}

// Download de bruikbare foto's (en logo) naar Blobs.
async function saveImages(conceptId, cands) {
  const out = [];
  const logos = cands.filter((c) => c.hint === "logo").sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  const photos = cands.filter((c) => c.hint !== "logo").slice(0, 16);
  const got = await Promise.all([...logos, ...photos].map(async (c) => ({ c, r: await get(c.url, { binary: true, max: 3500000, timeout: 5000 }) })));
  const hashes = new Set();
  let logoGehad = false;
  for (const { c, r } of got) {
    if (!r?.buf?.length) continue;
    const isLogo = c.hint === "logo";
    if (isLogo && logoGehad) continue;
    const size = imageSize(r.buf) || (isLogo ? svgSize(r.buf) : null);
    if (!size) continue;
    if (!isLogo && (size.w < 500 || size.h < 300 || size.w / size.h > 3 || size.h / size.w > 2.2)) continue;
    // Geen echte foto: een (bijna) egaal vlak of simpele afbeelding comprimeert extreem klein.
    if (!isLogo && r.buf.length / (size.w * size.h) < 0.035) continue;
    // Een echt logo: niet te klein en geen lange strook (zoals een rij keurmerken).
    if (isLogo && (size.w < 60 || size.h < 16 || size.w / size.h > 5.5)) continue;
    if (isLogo) logoGehad = true;
    const hash = crypto.createHash("sha1").update(r.buf).digest("hex");
    if (hashes.has(hash)) continue; hashes.add(hash);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" }[size.type];
    const name = isLogo ? `logo.${ext}` : `foto-${out.filter((x) => !x.logo).length + 1}.${ext}`;
    const key = `concepts/${conceptId}/${name}`;
    await putFile(key, r.buf, { type: size.type, name });
    out.push({ name, key, type: size.type, w: size.w, h: size.h, size: r.buf.length, alt: c.alt, logo: isLogo, bron: c.url });
    if (isLogo) Object.defineProperty(out, "logoBuf", { value: { buf: r.buf, type: size.type }, enumerable: false });
    if (out.filter((x) => !x.logo).length >= 10) break;
  }
  return out;
}

// SVG-logo: afmetingen uit viewBox/width/height. Alleen als het echt een SVG is.
function svgSize(buf) {
  const t = buf.slice(0, 4000).toString("utf8");
  if (!/<svg\b/i.test(t) || buf.length > 300000) return null;
  const vb = t.match(/viewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  const w = Number(vb?.[1] || (t.match(/\bwidth=["']([\d.]+)/i) || [])[1] || 0), h = Number(vb?.[2] || (t.match(/\bheight=["']([\d.]+)/i) || [])[1] || 0);
  return w && h ? { type: "image/svg+xml", w: Math.round(w * (w < 60 ? 10 : 1)), h: Math.round(h * (w < 60 ? 10 : 1)) } : null;
}

// Sfeerbeelden (stock) als hun eigen site te weinig goede foto's heeft. Pexels: gratis te gebruiken, ook commercieel.
// Alleen met PEXELS_API_KEY. In het concept en in HQ staat welke foto's sfeerbeelden zijn.
// Of Pixabay (PIXABAY_API_KEY): ook gratis en commercieel te gebruiken; we downloaden de foto's zelf (geen hotlinken).
export const stockReady = () => !!(env("PEXELS_API_KEY") || env("PIXABAY_API_KEY"));
export async function zoekStock(zoek, aantal) {
  try {
    if (env("PEXELS_API_KEY")) {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(zoek)}&per_page=${aantal}&orientation=landscape`, { headers: { authorization: env("PEXELS_API_KEY") }, signal: AbortSignal.timeout(6000) });
      if (r.ok) return ((await r.json()).photos || []).map((p) => ({ src: p.src?.large2x || p.src?.large, klein: p.src?.medium, alt: p.alt, url: p.url, door: p.photographer }));
    }
    if (env("PIXABAY_API_KEY")) {
      const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(env("PIXABAY_API_KEY"))}&q=${encodeURIComponent(zoek)}&lang=en&image_type=photo&safesearch=true&min_width=1200&per_page=${Math.max(3, aantal)}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) return ((await r.json()).hits || []).map((p) => ({ src: p.largeImageURL || p.webformatURL, klein: p.webformatURL, alt: p.tags, url: p.pageURL, door: p.user }));
    }
  } catch {}
  return [];
}

// Claude kijkt naar de kandidaten en kiest alleen foto's die echt bij hun werk passen (geen zonnepanelen bij een CV-installateur).
async function keurStock(kandidaten, { bedrijf, vak, diensten }) {
  const metBeeld = [];
  for (const k of kandidaten) {
    const r = k.klein && await get(k.klein, { binary: true, max: 600000, timeout: 5000 });
    const t = r?.buf && imageSize(r.buf);
    if (t && /^image\/(jpeg|png|webp)$/.test(t.type)) metBeeld.push({ ...k, b64: r.buf.toString("base64"), type: t.type });
  }
  if (!metBeeld.length) return [];
  if (env("AI_FAKE") && !globalThis.__aiFake) return metBeeld;
  const antwoord = await claude({
    system: "Je beoordeelt sfeerfoto's voor de website van een Nederlands bedrijf. Een foto is alleen goed als een klant hem direct herkent als HUN soort werk of omgeving. Twijfel = afkeuren. Afkeuren: ander vakgebied, buitenlands ogende winkels/borden, tekst of watermerken, overdreven poserende stockmodellen, lage kwaliteit.",
    prompt: `Bedrijf: ${bedrijf}${vak ? ` (${vak})` : ""}. Diensten: ${diensten.join(", ") || "onbekend"}.\nDe foto's hierboven zijn genummerd 1 t/m ${metBeeld.length} (in volgorde). Welke passen echt bij dit bedrijf? Antwoord alleen met JSON: {"goed":[nummers, beste eerst]}`,
    images: metBeeld.map((k) => ({ type: k.type, data: k.b64 })), maxTokens: 400, timeoutMs: 60000,
  }).catch(() => "");
  const goed = parseJson(antwoord)?.goed;
  if (!Array.isArray(goed)) return [];
  return [...new Set(goed.map(Number))].filter((n) => n >= 1 && n <= metBeeld.length).map((n) => metBeeld[n - 1]);
}

async function stockFotos(conceptId, termen, nodig, start, info = {}) {
  if (!stockReady() || !termen.length || nodig <= 0) return [];
  const gezien = new Set(), kandidaten = [];
  for (const t of termen.slice(0, 4)) for (const p of await zoekStock(t, 6)) if (p.src && !gezien.has(p.url || p.src)) { gezien.add(p.url || p.src); kandidaten.push(p); }
  const gekozen = await keurStock(kandidaten.slice(0, 14), info);
  const out = [];
  for (const p of gekozen) {
    if (out.length >= nodig) break;
    const r = await get(p.src, { binary: true, max: 3500000, timeout: 6000 });
    const size = r?.buf && imageSize(r.buf);
    if (!size) continue;
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[size.type];
    const name = `foto-${start + out.length + 1}.${ext}`;
    const key = `concepts/${conceptId}/${name}`;
    await putFile(key, r.buf, { type: size.type, name });
    out.push({ name, key, type: size.type, w: size.w, h: size.h, size: r.buf.length, alt: str(p.alt, 120), logo: false, stock: true, bron: p.url, fotograaf: str(p.door, 80) });
  }
  return out;
}

// ---------------------------------------------------------------- Claude
export const SYSTEM = `Je bent webredacteur bij Sitemaker. Je maakt een eerste opzet ("concept") van een nieuwe website voor een Nederlands bedrijf, op basis van de tekst van hun huidige website.
Regels:
- Gebruik ALLEEN feiten die in de aangeleverde tekst staan: diensten, werkwijze, plaats, telefoon, e-mail, adres, openingstijden, prijzen. Verzin niets: geen jaartallen, aantallen, reviews, keurmerken, prijzen of beloftes die er niet staan.
- Schrijf de teksten wél beter: helder, warm, concreet, actief, in de stijl van het bedrijf (je- of u-vorm zoals hun site). Korte zinnen. Geen clichés als "uw partner in" of "kwaliteit staat voorop".
- Hero-titel: krachtig, max. 8 woorden, over wat de klant krijgt. Hero-tekst: 1-2 zinnen. Knop: een duidelijke actie (bijv. "Maak een afspraak", "Vraag een offerte aan").
- 3 tot 6 diensten, elk met een korte uitleg (max. 25 woorden). Prijs alleen als die letterlijk op hun site staat.
- "over": 2-4 zinnen over het bedrijf, alleen uit hun tekst.
- Foto's: kies alleen uit de lijst met beschikbare afbeeldingen (pad "afbeeldingen/…"). Hero = de mooiste, sfeervolle foto. Gebruik een foto maar één keer. Geen foto's beschikbaar = laat foto-velden leeg.
- Het concept moet herkenbaar voelen als HUN bedrijf: neem de sfeer en huisstijl van hun huidige site over. Kies het thema dat daar het dichtst bij ligt: elegant (luxe, beauty, donker), stoer (bouw, installatie, techniek), natuur (tuin, zorg, ambacht, lokaal), zacht (modern, praktijk, coaching, zakelijk).
- kleuren: de huisstijl komt uit hun LOGO. Zit het logo als afbeelding bij dit bericht, kijk er dan goed naar en neem de kleuren daaruit over (als hex, zo exact mogelijk). "Kleuren uit het logo" in het bericht zijn betrouwbaar. "Kleuren uit de CSS" zijn ONBETROUWBAAR: vaak standaardkleuren van de websitebouwer (bijv. paars van Hostinger of blauw van WordPress); gebruik die alleen als ze duidelijk bij het logo passen. kleuren.primair = hoofdkleur van het logo, kleuren.accent = tweede logokleur als die er is. Zwart/wit logo of geen logo: kies een rustige kleur die bij hun vak en foto's past en zet "kleurBron":"gekozen" in kleuren; anders "kleurBron":"logo".
- Openingstijden alleen als ze in de tekst staan.
- "ontwerp": maak elke site anders en passend bij HUN merk. Kies:
  fonts: klassiek (verfijnd, schoonheid), luxe (high-end, mode, juwelen), editorial (stijlvol, horeca, makelaar), warm (ambacht, bakker, zorg), modern (creatief, eigentijds), ambacht (bouw, timmerman, garage), stoer (installatie, sloop, sport), strak (techniek, zakelijk, advies), speels (kinderen, coaching, hobby, dieren).
  hero: volbeeld (sterke sfeerfoto, groot en meeslepend), split (tekst + foto naast elkaar), kader (grote kop, brede foto eronder), collage (veel mooie foto's), typo (grote typografie).
  diensten: lijst (prijslijst of behandelingen), rijen (een paar grote diensten), kaarten (diensten met uitleg), foto (elke dienst met een foto).
  kopstijl: lijn, midden of groot. Varieer: twee bedrijven in dezelfde branche horen er duidelijk anders uit te zien.
  vorm: rond (zacht, vriendelijk), zacht (modern), strak (zakelijk, luxe, stoer). sfeer: licht, donker (luxe, avond, horeca, beauty met donkere site), merk (vrolijk, hun kleur overal).
- "stock": geef altijd 3 of 4 ENGELSE zoektermen (2-4 woorden) voor sfeerfoto's die precies hun belangrijkste diensten laten zien, bijv. voor een klimaatinstallateur ["heating boiler technician", "air conditioning indoor unit installation", "ventilation duct building", "radiator thermostat"], voor een kapper ["hair salon stylist cutting", "balayage hair coloring", "barber shop interior"]. Concreet en vakspecifiek, niet algemeen ("installer", "worker"). Die gebruiken we als hun eigen foto's niet genoeg zijn.
- Is het een webshop (online producten verkopen is de hoofdzaak), staat er te weinig informatie, of is het geen bedrijf: geef {"kan": false, "reden": "..."}.
Antwoord ALLEEN met JSON: {"kan": true, "content": { ...content.json... }} met exact deze opbouw:
{"thema":"natuur","ontwerp":{"fonts":"","hero":"","diensten":"","vorm":"","sfeer":""},"stock":[],"kleuren":{"primair":"","accent":"","kleurBron":""},"bedrijf":{"naam":"","telefoon":"","email":"","whatsapp":"","adres":"","plaats":"","kvk":"","logo":""},
 "seo":{"titel":"","omschrijving":""},"hero":{"label":"","titel":"","tekst":"","knop":{"tekst":"","link":"#contact"},"foto":""},
 "diensten":{"titel":"","items":[{"titel":"","tekst":"","prijs":""}]},"over":{"titel":"","tekst":"","foto":""},"fotos":[],
 "openingstijden":[{"dag":"","tijd":""}],"contact":{"titel":"","tekst":"","knop":{"tekst":"","link":""}}}`;

const digits = (s) => String(s || "").replace(/\D/g, "");
const HEX = /^#[0-9a-f]{6}$/i;
// Houdt Claude eerlijk: contactgegevens en tijden moeten echt op hun site staan; afbeeldingen alleen uit de lijst.
export function clean(c, { text, images, lead }) {
  const plain = text.toLowerCase(), plainDigits = digits(text);
  const names = new Set(images.map((i) => `afbeeldingen/${i.name}`));
  const img = (p) => (names.has(p) ? p : "");
  const s = (v, n) => str(v, n);
  const b = c.bedrijf || {};
  const tel = s(b.telefoon, 30), mail = s(b.email, 120).toLowerCase();
  const out = {
    thema: THEMAS[c.thema] ? c.thema : "natuur",
    ontwerp: Object.fromEntries(Object.entries(ONTWERP).map(([k, opties]) => [k, opties.includes(c.ontwerp?.[k]) ? c.ontwerp[k] : ""]).filter(([, v]) => v)),
    kleuren: { primair: HEX.test(c.kleuren?.primair || "") ? c.kleuren.primair : "", accent: HEX.test(c.kleuren?.accent || "") ? c.kleuren.accent : "", bron: c.kleuren?.kleurBron === "logo" ? "logo" : "gekozen" },
    bedrijf: {
      naam: s(b.naam, 80) || lead.company,
      telefoon: tel && digits(tel).length >= 9 && plainDigits.includes(digits(tel).slice(-9)) ? tel : "",
      email: mail && plain.includes(mail) ? mail : "",
      whatsapp: b.whatsapp && plainDigits.includes(digits(b.whatsapp).slice(-9)) ? s(b.whatsapp, 30) : "",
      adres: s(b.adres, 120), plaats: s(b.plaats, 60) || lead.city || "", kvk: "",
      logo: img(b.logo || (images.find((i) => i.logo) ? `afbeeldingen/${images.find((i) => i.logo).name}` : "")),
    },
    seo: { titel: s(c.seo?.titel, 70), omschrijving: s(c.seo?.omschrijving, 160) },
    hero: { label: s(c.hero?.label, 60), titel: s(c.hero?.titel, 90), tekst: s(c.hero?.tekst, 260), knop: { tekst: s(c.hero?.knop?.tekst, 40) || "Neem contact op", link: "#contact" }, foto: img(c.hero?.foto) },
    diensten: { titel: s(c.diensten?.titel, 60) || "Wat we doen", items: (c.diensten?.items || []).slice(0, 6).map((i) => ({ titel: s(i.titel, 60), tekst: s(i.tekst, 220), prijs: i.prijs && plainDigits.includes(digits(i.prijs)) ? s(i.prijs, 40) : "" })).filter((i) => i.titel) },
    over: { titel: s(c.over?.titel, 60) || "Over ons", tekst: s(c.over?.tekst, 900), foto: img(c.over?.foto) },
    fotos: [...new Set((c.fotos || []).map(img).filter(Boolean))].slice(0, 9),
    openingstijden: (c.openingstijden || []).slice(0, 8).map((r) => ({ dag: s(r.dag, 40), tijd: s(r.tijd, 40) })).filter((r) => r.dag && r.tijd),
    contact: { titel: s(c.contact?.titel, 80) || "Contact", tekst: s(c.contact?.tekst, 260), knop: { tekst: s(c.contact?.knop?.tekst, 40), link: "" } },
  };
  // Tijden en adres moeten in de bron staan (anders liever niets dan iets verkeerds).
  const tijdOk = (t) => (t.match(/\d{1,2}[:.]\d{2}|\d{1,2}/g) || []).every((x) => plainDigits.includes(digits(x).replace(/^0+(?=\d)/, "")));
  if (out.openingstijden.some((r) => !tijdOk(r.tijd))) out.openingstijden = [];
  if (out.bedrijf.adres && !plain.includes(out.bedrijf.adres.toLowerCase().slice(0, 8))) out.bedrijf.adres = "";
  // Geen foto's gebruikt maar wel beschikbaar: vul aan.
  const vrij = images.filter((i) => !i.logo).map((i) => `afbeeldingen/${i.name}`);
  if (!out.hero.foto && vrij.length) out.hero.foto = vrij[0];
  if (!out.over.foto && vrij.length > 1) out.over.foto = vrij.find((p) => p !== out.hero.foto) || "";
  // Alle bruikbare eigen foto's gebruiken (meer beeld = beter), niet alleen wat Claude koos.
  out.fotos = [...new Set([...out.fotos, ...vrij])].filter((p) => p !== out.hero.foto && p !== out.over.foto).slice(0, 9);
  // Hero: liever een grote liggende foto dan een kleine of staande.
  const info = (p) => images.find((i) => `afbeeldingen/${i.name}` === p);
  const goed = (i) => i && i.w >= 1000 && i.w / i.h >= 1.2;
  if (out.hero.foto && !goed(info(out.hero.foto))) { const beter = images.find((i) => !i.logo && goed(i) && `afbeeldingen/${i.name}` !== out.over.foto); if (beter) { const oud = out.hero.foto; out.hero.foto = `afbeeldingen/${beter.name}`; out.fotos = [oud, ...out.fotos.filter((p) => p !== out.hero.foto && p !== oud)].slice(0, 6); } }
  if (out.ontwerp.hero === "volbeeld" && !goed(info(out.hero.foto))) out.ontwerp.hero = "split";
  if (!out.hero.titel || !out.diensten.items.length) return null;
  return out;
}

// ---------------------------------------------------------------- verwerken
export async function processConcept(conceptId) {
  const c = await one(`UPDATE concepts SET status = 'bezig', started_at = NOW(), pogingen = pogingen + 1, updated_at = NOW()
                       WHERE id = $1 AND status IN ('wachtrij','fout') AND pogingen < 3 RETURNING *`, [conceptId]);
  if (!c) return { skipped: true };
  const lead = await one("SELECT * FROM leads WHERE id = $1", [c.lead_id]);
  const klaar = async (status, fields = {}) => {
    const s = await getSettings();
    const dagen = Number(s.b2b.concepten?.geldigDagen || 30);
    await q(`UPDATE concepts SET status = $2, content = COALESCE($3::jsonb, content), images = COALESCE($4::jsonb, images), analysis = COALESCE($5::jsonb, analysis), reden = $6,
             ready_at = CASE WHEN $2 = 'klaar' THEN NOW() ELSE ready_at END, expires_at = CASE WHEN $2 = 'klaar' THEN NOW() + ($7 || ' days')::interval ELSE expires_at END, updated_at = NOW() WHERE id = $1`,
      [c.id, status, fields.content ? JSON.stringify(fields.content) : null, fields.images ? JSON.stringify(fields.images) : null, fields.analysis ? JSON.stringify(fields.analysis) : null, fields.reden || "", String(dagen)]);
    return { status, ...fields };
  };
  try {
    if (!lead?.website) return await klaar("overgeslagen", { reden: "Geen website om naar te kijken." });
    const taak = await perTaak();
    if (!taak && !aiReady()) return await klaar("fout", { reden: "Claude is nog niet gekoppeld (ANTHROPIC_API_KEY of AI Gateway)." });
    // Met een wens/informatie van Maxim (Opnieuw maken) gaat het concept ook door als hun site weinig tekst heeft of niet te lezen is.
    const handmatig = taak && String(c.instructie || "").trim().length >= 40;
    let site = await scan(lead.website);
    if (site.error && handmatig) site = { home: { url: lead.website }, text: "", analysis: { url: lead.website }, kleuren: [], cands: [] };
    if (site.error) return await klaar("overgeslagen", { reden: site.error });
    if (site.text.length < 300 && !handmatig) return await klaar("overgeslagen", { reden: "Te weinig tekst op hun site om een goed concept te maken. Tip: Opnieuw maken met de informatie over het bedrijf als wens.", analysis: site.analysis });
    if (handmatig) site.text = `${site.text}\n\n### Informatie van Sitemaker (Maxim)\n${c.instructie}`.trim();
    // oude afbeeldingen van een eerdere poging opruimen
    for (const i of c.images || []) await deleteFile(i.key).catch(() => {});
    const images = await saveImages(c.id, site.cands);
    // Geplande Claude-taak: alleen scannen en opslaan; teksten, foto's en ontwerp doet de taak (geen AI-kosten hier).
    if (taak) {
      const lb = images.logoBuf, logoKleuren = lb?.type === "image/svg+xml" ? svgKleuren(lb.buf) : [];
      await q("UPDATE concepts SET status = 'ontwerp', images = $2, analysis = $3, bron = $4, reden = '', updated_at = NOW() WHERE id = $1",
        [c.id, JSON.stringify(images), JSON.stringify(site.analysis), JSON.stringify({ url: site.home.url, tekst: site.text, kleurenCss: site.kleuren, kleurenLogo: logoKleuren })]);
      return { status: "ontwerp" };
    }
    // Logo meesturen zodat Claude de echte huisstijlkleuren ziet (SVG: kleuren uitlezen).
    const lb = images.logoBuf, logoKleuren = lb?.type === "image/svg+xml" ? svgKleuren(lb.buf) : [];
    const beeld = lb && /^image\/(png|jpeg|webp)$/.test(lb.type) && lb.buf.length < 3000000 ? [{ type: lb.type, data: lb.buf.toString("base64") }] : [];
    const prompt = `Bedrijf: ${lead.company}${lead.category ? ` (${lead.category})` : ""}${lead.city ? `, ${lead.city}` : ""}. Website: ${site.home.url}
${beeld.length ? "Het logo zit als afbeelding bij dit bericht: haal de huisstijlkleuren daaruit.\n" : ""}Kleuren uit het logo: ${logoKleuren.join(", ") || (beeld.length ? "zie afbeelding" : "geen logo gevonden")}
Kleuren uit de CSS (onbetrouwbaar, vaak standaard van de websitebouwer): ${site.kleuren.join(", ") || "geen"}
Beschikbare afbeeldingen:
${images.length ? images.map((i) => `- afbeeldingen/${i.name} (${i.w}x${i.h}${i.logo ? ", LOGO" : ""}${i.alt ? `, alt: "${i.alt}"` : ""})`).join("\n") : "- geen"}
${c.instructie ? `\nExtra wens van Sitemaker voor dit concept: ${c.instructie}\n` : ""}
Tekst van hun website (ingekort):
"""
${site.text}
"""`;
    const out = parseJson(await claude({ system: SYSTEM, prompt, images: beeld, maxTokens: 6000, timeoutMs: 240000 }));
    if (!out) return await klaar("fout", { reden: "Claude gaf geen bruikbaar antwoord.", images, analysis: site.analysis });
    if (out.kan === false) return await klaar("overgeslagen", { reden: str(out.reden, 300) || "Niet geschikt voor een concept.", images, analysis: site.analysis });
    const content = clean(out.content || {}, { text: site.text, images, lead });
    if (!content) return await klaar("fout", { reden: "Het concept was onvolledig.", images, analysis: site.analysis });
    // Te weinig eigen foto's: aanvullen met sfeerbeelden die bij het bedrijf passen.
    const eigen = images.filter((i) => !i.logo);
    if (eigen.length < 8) {
      const st = out.content?.stock;
      const termen = (Array.isArray(st) ? st : [st]).map((t) => str(t, 60)).filter(Boolean);
      if (!termen.length && lead.category) termen.push(lead.category);
      const stock = await stockFotos(c.id, termen, Math.min(7, 8 - eigen.length), eigen.length, { bedrijf: lead.company, vak: lead.category, diensten: content.diensten.items.map((i) => i.titel) }).catch(() => []);
      if (stock.length) {
        images.push(...stock);
        const pad = (i) => `afbeeldingen/${i.name}`;
        const groot = (p) => { const i = images.find((x) => pad(x) === p); return i && i.w >= 1000; };
        if (!content.hero.foto || !groot(content.hero.foto)) { if (content.hero.foto) content.fotos.unshift(content.hero.foto); content.hero.foto = pad(stock[0]); }
        if (!content.over.foto) content.over.foto = pad(stock[1] || stock[0]);
        content.fotos = [...new Set([...content.fotos, ...stock.map(pad)])].filter((p) => p !== content.hero.foto && p !== content.over.foto).slice(0, 9);
        content.sfeerbeelden = true;
      }
    }
    // Ontwerp-agent: een volledig eigen ontwerp voor dit bedrijf. Lukt dat niet, dan de vaste opmaak als vangnet.
    let html = "", ontwerpFout = "";
    try {
      const r = await ontwerp(content, images, { category: lead.category, kleuren: logoKleuren, platform: site.analysis?.platform, instructie: c.instructie, model: env("AI_MODEL_ONTWERP") || undefined });
      html = r.html || ""; ontwerpFout = r.fout || "";
    } catch (e) { ontwerpFout = str(e.message, 200); }
    await q("UPDATE concepts SET html = $2, ontwerp_fout = $3 WHERE id = $1", [c.id, html, ontwerpFout]);
    return await klaar("klaar", { content, images, analysis: site.analysis });
  } catch (e) {
    console.log("[concept]", c.id, e.message);
    return await klaar("fout", { reden: str(e.message, 300) });
  }
}

const triggerKey = (id) => crypto.createHash("sha256").update(`${env("AUTH_SECRET", "x")}:concept:${id}`).digest("hex");
export const checkTriggerKey = (id, key) => { const a = Buffer.from(String(key || "")), b = Buffer.from(triggerKey(id)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
async function trigger(id) {
  if (env("SM_INLINE_AI") === "1") return processConcept(id).catch((e) => console.log("[concept]", e.message));
  const base = env("URL") || publicBase();
  await fetch(`${base}/.netlify/functions/concept-background`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, key: triggerKey(id) }), signal: AbortSignal.timeout(5000) }).catch((e) => console.log("[concept] trigger", e.message));
}

// Concept (opnieuw) in de wachtrij zetten.
export async function queueConcept(leadId, { instructie = "", direct = false } = {}) {
  const lead = await one("SELECT id, website, status FROM leads WHERE id = $1", [leadId]);
  if (!lead) fail(404, "Lead niet gevonden.");
  if (!lead.website) fail(400, "Deze lead heeft geen website.");
  if (lead.status === "afgemeld") fail(400, "Deze lead heeft zich afgemeld.");
  const c = await one(`INSERT INTO concepts (lead_id, token, instructie) VALUES ($1, $2, $3)
                       ON CONFLICT (lead_id) DO UPDATE SET status = 'wachtrij', pogingen = 0, instructie = EXCLUDED.instructie, reden = '', updated_at = NOW()
                       WHERE concepts.status <> 'bezig' RETURNING *`, [leadId, crypto.randomBytes(9).toString("base64url"), str(instructie, 500)]);
  if (!c) fail(409, "Er wordt al aan dit concept gewerkt.");
  if (direct) await trigger(c.id);
  return { id: c.id, status: c.status };
}

// tick: nieuwe leads met een website automatisch in de wachtrij, en een paar starten (binnen de daglimiet).
// Concepten die al gescand waren voordat we formulieren en boekingssystemen bekeken: één per ronde aanvullen.
export async function vulFormulierenAan() {
  const c = await one(`SELECT c.id, c.analysis, l.website FROM concepts c JOIN leads l ON l.id = c.lead_id
                       WHERE c.status = 'ontwerp' AND NOT (COALESCE(c.analysis, '{}'::jsonb) ? 'formulieren') AND l.website <> '' ORDER BY c.id LIMIT 1`);
  if (!c) return { klaar: true };
  const s = await scan(c.website).catch(() => null);
  const extra = { formulieren: s?.analysis?.formulieren || [], boeken: s?.analysis?.boeken || [] };
  await q("UPDATE concepts SET analysis = COALESCE(analysis, '{}'::jsonb) || $2::jsonb WHERE id = $1", [c.id, JSON.stringify(extra)]);
  return { id: c.id, formulieren: extra.formulieren.length, boeken: extra.boeken.length };
}

export async function runConcepts({ max = 2 } = {}) {
  const s = await getSettings();
  const cfg = s.b2b.concepten || {};
  const taak = cfg.maker !== "netlify";
  if (!taak && !aiReady()) return { skipped: "ai" };
  const [{ n: vandaag }] = await q("SELECT COUNT(*)::int AS n FROM concepts WHERE started_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')");
  const room = Math.max(0, Number(cfg.perDag ?? 20) - vandaag);
  if (cfg.auto !== false && room) {
    await q(`INSERT INTO concepts (lead_id, token) SELECT l.id, md5(random()::text || l.id::text || clock_timestamp()::text) FROM leads l
             WHERE l.website <> '' AND l.status IN ('nieuw','goedgekeurd') AND NOT EXISTS (SELECT 1 FROM concepts c WHERE c.lead_id = l.id)
             ORDER BY l.created_at LIMIT $1 ON CONFLICT DO NOTHING`, [room]);
  }
  // taak pakte een concept op maar maakte het niet af (na drie uur): terug naar de wachtrij van de taak
  await q("UPDATE concepts SET status = 'ontwerp', updated_at = NOW() WHERE status = 'ontwerpen' AND taak_at < NOW() - INTERVAL '3 hours'");
  // vastgelopen (> 20 min bezig) opnieuw
  await q("UPDATE concepts SET status = 'wachtrij', updated_at = NOW() WHERE status = 'bezig' AND started_at < NOW() - INTERVAL '20 minutes' AND pogingen < 3");
  const todo = await q("SELECT id FROM concepts WHERE status = 'wachtrij' ORDER BY created_at LIMIT $1", [Math.min(max, room)]);
  for (const t of todo) await trigger(t.id);
  return { started: todo.length };
}

// ---------------------------------------------------------------- de voorbeeldpagina
export async function conceptByToken(token) {
  if (!/^[\w-]{8,40}$/.test(token || "")) return null;
  return one("SELECT c.*, l.company, l.email AS lead_email, l.status AS lead_status FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.token = $1", [token]);
}

const page = (title, body) => new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escH(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#E7F4FF;color:#1C0747;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}main{background:#fff;border-radius:18px;padding:30px;max-width:460px}h1{font-size:24px;margin:0 0 12px}p{line-height:1.55}a.k{display:inline-block;background:#D93636;color:#fff;font-weight:700;padding:13px 20px;border-radius:12px;text-decoration:none}</style></head>
<body><main>${body}</main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });

// "Wat is er beter dan jullie huidige site": eerlijk, uit wat de agent op hun site zag, plus wat dit voorbeeld standaard doet.
function beter(a) {
  const p = [];
  if (a && a.url) {
    if (!a.https) p.push(["Beveiligde verbinding (https)", "Jullie huidige site heeft geen https; browsers waarschuwen bezoekers daarvoor."]);
    if (!a.mobiel) p.push(["Gemaakt voor mobiel", "Jullie huidige site is niet ingericht voor telefoons, terwijl de meeste bezoekers daarop kijken."]);
    if (a.jaartal && a.jaartal < new Date().getFullYear() - 1) p.push(["Actueel en verzorgd", `Jullie huidige site toont nog ${a.jaartal} onderaan.`]);
    if (!a.omschrijving) p.push(["Beter vindbaar in Google", "Jullie huidige site mist een omschrijving voor zoekmachines."]);
    if (!a.belknop) p.push(["Bellen met één tik", "Op jullie huidige site kun je niet direct bellen."]);
  }
  p.push(["Altijd een knop in beeld", "Op mobiel staan bellen en een afspraak maken onderin altijd klaar."]);
  return `<h3>Wat dit voorbeeld beter doet</h3><ul class="sm-beter">${p.slice(0, 5).map(([t, u]) => `<li>${escH(t)}<small>${escH(u)}</small></li>`).join("")}</ul>`;
}

export async function conceptPage(token, { hq = false } = {}) {
  const c = await conceptByToken(token);
  // "Ik heb interesse": kiezen tussen direct starten, videomeeting of belafspraak.
  const kennis = `${publicBase()}/interesse?concept=${encodeURIComponent(token)}${c?.company ? `&bedrijf=${encodeURIComponent(c.content?.bedrijf?.naam || c.company)}` : ""}`;
  if (!c || c.status !== "klaar" || c.lead_status === "afgemeld") return page("Voorbeeld niet beschikbaar", `<h1>Dit voorbeeld is niet (meer) beschikbaar</h1><p>Benieuwd hoe jouw nieuwe website eruit kan zien? Plan een kennismaking van 15 minuten.</p><a class="k" href="${publicBase()}/#kennismaking">Plan een kennismaking</a>`);
  if (c.expires_at && new Date(c.expires_at) < new Date() && !hq) return page("Voorbeeld verlopen", `<h1>Dit voorbeeld is verlopen</h1><p>We maken graag een nieuw voorbeeld voor ${escH(c.company)}. Plan een kennismaking van 15 minuten.</p><a class="k" href="${kennis}">Plan een kennismaking</a>`);
  const naam = c.content?.bedrijf?.naam || c.company;
  const balk = `<style>.sm-balk{position:sticky;top:0;z-index:99;background:#1C0747;color:#fff;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 16px;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap}
.sm-balk b{color:#0CC0DF}.sm-balk a{background:#D93636;color:#fff;font-weight:700;padding:8px 14px;border-radius:9px;text-decoration:none;white-space:nowrap}
.sm-kort{display:none}@media(max-width:700px){.sm-balk{justify-content:space-between;flex-wrap:nowrap;font-size:13px;padding:8px 12px}.sm-lang{display:none}.sm-kort{display:inline}.sm-balk a{padding:7px 11px;font-size:13px}}
.sm-eind{background:#1C0747;color:#fff;padding:48px 20px;text-align:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.sm-eind h2{font-size:28px;margin:0 0 10px;font-family:inherit;color:#fff}.sm-eind p{max-width:560px;margin:0 auto 20px;color:#E3DDF5}
.sm-beter{list-style:none;padding:0;margin:0 auto 26px;max-width:560px;text-align:left;display:grid;gap:8px}.sm-beter li{background:rgba(255,255,255,.07);border-radius:10px;padding:10px 14px 10px 40px;position:relative;color:#fff}.sm-beter li::before{content:"✓";position:absolute;left:14px;color:#0CC0DF;font-weight:700}.sm-beter small{display:block;margin:2px 0 0;color:#B8AEDB}
.sm-eind h3{font-size:18px;margin:6px 0 12px;color:#fff}
.sm-jason{margin:0 auto 22px;display:flex;align-items:flex-end;justify-content:center;gap:14px;max-width:560px}.sm-jason img{width:150px;height:auto;display:block}
.sm-jason figcaption{background:#fff;color:#1C0747;border-radius:20px 20px 20px 6px;padding:14px 18px 12px;text-align:left;box-shadow:0 14px 40px rgba(0,0,0,.25);margin-bottom:70px}.sm-ballon{display:block;font-size:19px;font-weight:700;line-height:1.25}.sm-jason small{display:block;margin-top:6px;font-size:13px;color:#6B6585}.sm-jason small b{color:#1C0747}
.sm-eind{padding-top:56px;overflow:hidden}@media(max-width:520px){.sm-jason img{width:110px}.sm-ballon{font-size:17px}.sm-jason figcaption{margin-bottom:46px}}
.sm-eind a{display:inline-block;background:#D93636;color:#fff;font-weight:700;padding:14px 22px;border-radius:12px;text-decoration:none}.sm-eind small{display:block;margin-top:16px;color:#B8AEDB}</style>
<div class="sm-balk" role="note"><span><b>Voorbeeld</b><span class="sm-lang"> · Een eerste opzet voor ${escH(naam)}. Mooi? Dan maken we hem samen helemaal af, naar jullie wensen.</span><span class="sm-kort"> · Mooi? Wij maken hem helemaal af</span></span><a href="${kennis}">Ik heb interesse</a></div>`;
  // De balk staat vast bovenaan; vaste/plakkende koppen van het ontwerp schuiven eronder (nooit eroverheen).
  const balkScript = `<script>(function(){var b=document.querySelector(".sm-balk");if(!b)return;var r=document.createElement("div");r.className="sm-balk-ruimte";b.after(r);var H=0,lijst=[];
function hoog(){H=b.offsetHeight;r.style.height=H+"px";document.documentElement.style.setProperty("--sm-balk",H+"px")}
function zet(el){if(el===b||b.contains(el)||el.closest(".sm-actiebalk"))return;var cs=getComputedStyle(el);var abs=cs.position==="absolute"&&(!el.offsetParent||el.offsetParent===document.body||el.offsetParent===document.documentElement);if(cs.position!=="fixed"&&cs.position!=="sticky"&&!abs)return;if(cs.top==="auto"){return}
var o=el.dataset.smTop;if(o===undefined){o=String(parseFloat(cs.top)||0);if(parseFloat(o)>H+40)return;el.dataset.smTop=o;if(lijst.indexOf(el)<0)lijst.push(el)}el.style.setProperty("top",(parseFloat(o)+H)+"px","important")}
function alles(){hoog();var a=document.body.getElementsByTagName("*");for(var i=0;i<a.length;i++)zet(a[i]);var m=0;lijst.forEach(function(e){var ps=getComputedStyle(e).position;if(ps==="fixed"||ps==="sticky")m=Math.max(m,e.offsetHeight)});document.documentElement.style.scrollPaddingTop=(H+Math.min(m,140)+12)+"px"}
var kop=[];function koppen(){kop=Array.prototype.slice.call(document.querySelectorAll("header,nav,[class*=header],[class*=kop],[class*=nav],[class*=menu],[class*=balk]"))}
var t=0;addEventListener("scroll",function(){if(t)return;t=requestAnimationFrame(function(){t=0;kop.forEach(zet)})},{passive:true});
addEventListener("resize",function(){lijst.forEach(function(e){delete e.dataset.smTop;e.style.removeProperty("top")});lijst=[];alles()});
koppen();alles();addEventListener("load",function(){koppen();alles()});setTimeout(alles,1200)})()</script>`;
  const eind = `<section class="sm-eind"><figure class="sm-jason"><img src="/assets/brand/jason.webp" alt="Jason, webdesigner bij Sitemaker" width="502" height="720"><figcaption><span class="sm-ballon">&ldquo;Zullen we jouw ontwerp afronden?&rdquo;</span><small><b>Jason</b>, jouw webdesigner</small></figcaption></figure><h2>Zo kan de website van ${escH(naam)} eruitzien</h2>
<p>Dit is een eerste opzet op basis van jullie huidige website. Mooi? Dan maken we hem samen helemaal af, naar jullie wensen: jullie eigen teksten, foto's, kleuren en pagina's. Hij staat binnen ${OFFER.deliveryText} online, voor €299,95 eenmalig en €69,95 per maand, inclusief hosting en ${OFFER.changesPerMonth} wijzigingen per maand. Maandelijks opzegbaar, en de eerste 30 dagen na livegang niet tevreden? Dan krijg je je geld terug.</p>
${beter(c.analysis)}<a href="${kennis}">Ik heb interesse</a><small>${c.content?.sfeerbeelden ? "Teksten komen van jullie eigen website; een deel van de foto's zijn sfeerbeelden, die vervangen we graag door jullie eigen foto's." : "Teksten en foto's komen van jullie eigen website."} Dit voorbeeld is alleen via deze link te zien.</small></section>
${hq ? "" : `<script>setTimeout(function(){try{fetch(${JSON.stringify(`/api/voorbeeld/${token}/gezien`)},{method:"POST",headers:{"x-sm":"1"},keepalive:true})}catch(e){}},2500)</script>`}`;
  // Versie in het pad: bij een nieuw concept met dezelfde bestandsnamen geen oude foto's uit de cache.
  const imgBase = `/api/voorbeeld/${token}/a${c.ready_at ? new Date(c.ready_at).getTime().toString(36) : "0"}/`;
  if (c.html) {
    // Eigen ontwerp: zonder scripts van de agent; alleen ons eigen script (met nonce) mag draaien.
    const nonce = crypto.randomBytes(16).toString("base64");
    const eigen = `<script nonce="${nonce}">${ONTWERP_SCRIPT}</script><script nonce="${nonce}">${BEWEGING}</script>`;
    const html = toonOntwerp(c.html, { imgBase, bodyStart: balk.replace("<style>", `<style nonce="${nonce}">`).replace("position:sticky;top:0;", "position:fixed;top:0;left:0;right:0;").replace("z-index:99;", "z-index:2147483000;") + balkScript.replace("<script>", `<script nonce="${nonce}">`), bodyEnd: eind.replace(/<script>/g, `<script nonce="${nonce}">`).replace(/<style>/g, `<style nonce="${nonce}">`) + eigen });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
  }
  const html = render(c.content, { imgBase, robots: "noindex,nofollow", bodyStart: balk.replace("position:sticky;top:0;", "position:fixed;top:0;left:0;right:0;").replace("z-index:99;", "z-index:2147483000;") + balkScript, bodyEnd: eind });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" } });
}

// Klein script voor eigen ontwerpen: "vandaag" bij de openingstijden en het logo altijd zichtbaar.
export const ONTWERP_SCRIPT = `(function(){function L(r,g,b){return(0.2126*r+0.7152*g+0.0722*b)/255}
function bgL(el){var n=el;while(n&&n!==document.documentElement){var c=getComputedStyle(n).backgroundColor,m=c.match(/[\\d.]+/g);if(m&&(m.length<4||+m[3]>0.5))return L(+m[0],+m[1],+m[2]);n=n.parentElement}return 1}
function check(img){try{var w=Math.min(120,img.naturalWidth),h=Math.max(1,Math.round(w*img.naturalHeight/img.naturalWidth)),cv=document.createElement("canvas");cv.width=w;cv.height=h;var x=cv.getContext("2d");x.drawImage(img,0,0,w,h);var d=x.getImageData(0,0,w,h).data,s=0,n=0,v=0;for(var i=0;i<d.length;i+=4){if(d[i+3]>40){s+=L(d[i],d[i+1],d[i+2]);n++}if(d[i+3]>240)v++}if(!n||v>d.length/4*0.9)return;var lg=s/n;if(Math.abs(lg-bgL(img.parentElement))<0.28){img.style.background=lg>0.5?"#16151a":"#ffffff";img.style.padding="8px 12px";img.style.borderRadius="10px";img.style.boxSizing="content-box"}}catch(e){}}
document.querySelectorAll("img.logo-img").forEach(function(i){i.complete&&i.naturalWidth?check(i):i.addEventListener("load",function(){check(i)})});
var D=["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"],vd=new Date().getDay(),hit=false;
document.querySelectorAll(".sm-tijden > div").forEach(function(el){if(hit)return;var t=(el.querySelector("dt")||el).textContent.toLowerCase(),r=[],m=t.match(/(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)\\s*(?:t\\/m|tot en met|-|–)\\s*(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)/);
if(m){for(var a=D.indexOf(m[1]),i=a;;i=(i+1)%7){r.push(i);if(i===D.indexOf(m[2])||r.length>7)break}}else D.forEach(function(d,i){if(t.indexOf(d)>-1)r.push(i)});
if(r.indexOf(vd)>-1){hit=true;el.style.fontWeight="700";var dt=el.querySelector("dt");if(dt)dt.insertAdjacentText("beforeend"," · vandaag")}});

})();`;

export async function conceptImage(token, name) {
  const c = await conceptByToken(token);
  const i = c && (c.images || []).find((x) => x.name === name);
  if (!i) return new Response("Niet gevonden", { status: 404 });
  const buf = await getFile(i.key);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  return new Response(buf, { headers: { "content-type": i.type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } });
}

// Bekeken (via een klein script na 2,5 s, zodat mailscanners niet meetellen). Eerste keer: seintje aan Maxim.
export async function markViewed(token) {
  const c = await one(`UPDATE concepts SET views = views + 1, first_view_at = COALESCE(first_view_at, NOW()), last_view_at = NOW() WHERE token = $1 AND status = 'klaar'
                       RETURNING id, lead_id, views, (SELECT company FROM leads WHERE id = lead_id) AS company, (SELECT phone FROM leads WHERE id = lead_id) AS phone`, [token]);
  if (c && c.views === 1) {
    await audit(null, null, "concept.bekeken", { lead: c.lead_id });
    await notifyStaff(`${c.company} bekijkt nu het concept`, [`${c.company} heeft zojuist het concept van hun nieuwe website geopend.`, c.phone ? `Goed moment om te bellen: ${c.phone}` : "Goed moment om contact op te nemen."], `/hq/#b2b`).catch(() => {});
  }
  return { ok: true };
}

// ---------------------------------------------------------------- HQ
export function publicConcept(c) {
  if (!c || !c.status) return null;
  return {
    id: c.id, status: c.status, reden: c.reden, url: c.token ? conceptUrl(c.token) : "", views: c.views || 0, firstViewAt: c.first_view_at, lastViewAt: c.last_view_at,
    readyAt: c.ready_at, expiresAt: c.expires_at, thema: c.content?.thema || "", uniek: !!c.html, ontwerpFout: c.ontwerp_fout || "", instructie: c.instructie, punten: verbeterpunten(c.analysis), fotos: (c.images || []).filter((i) => !i.logo).length,
  };
}
export async function setTheme(leadId, thema, user) {
  if (!THEMAS[thema]) fail(400, "Onbekend thema.");
  const c = await one("UPDATE concepts SET content = jsonb_set(content, '{thema}', to_jsonb($2::text)), updated_at = NOW() WHERE lead_id = $1 AND status = 'klaar' RETURNING id", [leadId, thema]);
  if (!c) fail(400, "Er is nog geen klaar concept.");
  await audit(user.id, null, "concept.thema", { lead: leadId, thema });
  return { ok: true };
}
// Maxim wijst het concept af: geen mail, de voorbeeldpagina gaat dicht, de lead wordt overgeslagen (komt niet terug).
export async function rejectConcept(leadId, user) {
  const c = await one("UPDATE concepts SET status = 'overgeslagen', reden = 'Afgewezen in HQ', expires_at = NOW(), updated_at = NOW() WHERE lead_id = $1 RETURNING id", [leadId]);
  const l = await one(`UPDATE leads SET status = 'overgeslagen', reject_reason = 'Concept afgewezen in HQ', updated_at = NOW()
                       WHERE id = $1 AND status IN ('kandidaat','nieuw','goedgekeurd','fout') RETURNING id`, [leadId]);
  if (!c && !l) fail(404, "Dit concept bestaat niet (meer) of de mail is al verstuurd.");
  await audit(user?.id || null, null, "concept.afgewezen", { lead: leadId });
  return { ok: true };
}
export async function deleteConcept(leadId) {
  const c = await one("DELETE FROM concepts WHERE lead_id = $1 RETURNING images", [leadId]);
  for (const i of c?.images || []) await deleteFile(i.key).catch(() => {});
  return { ok: !!c };
}
// Voor "Website aanmaken": content en afbeeldingen van het concept van deze klant.
export async function conceptForCustomer(customer) {
  if (!customer.lead_id) return null;
  const c = await one("SELECT * FROM concepts WHERE lead_id = $1 AND status = 'klaar'", [customer.lead_id]);
  if (!c) return null;
  const files = [];
  for (const i of c.images || []) { const buf = await getFile(i.key); if (buf) files.push({ path: `afbeeldingen/${i.name}`, content: buf }); }
  return { content: c.content, files };
}

// Galerij in HQ.
export async function listConcepts({ filter = "" } = {}) {
  const where = { beoordelen: "c.status = 'klaar' AND l.status = 'nieuw'", klaar: "c.status = 'klaar'", bekeken: "c.views > 0", bezig: "c.status IN ('wachtrij','bezig','ontwerp','ontwerpen')", overgeslagen: "c.status IN ('overgeslagen','fout')" }[filter] || "TRUE";
  const rows = await q(`SELECT c.*, l.company, l.city, l.category, l.status AS lead_status, l.website, l.phone, l.email FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE ${where}
                        ORDER BY (c.views > 0) DESC, c.last_view_at DESC NULLS LAST, COALESCE(c.ready_at, c.created_at) DESC LIMIT 300`);
  const counts = (await q("SELECT status, COUNT(*)::int AS n, SUM(CASE WHEN views > 0 THEN 1 ELSE 0 END)::int AS b FROM concepts GROUP BY status"));
  const tel = { alle: 0, klaar: 0, bekeken: 0, bezig: 0, overgeslagen: 0, beoordelen: (await one("SELECT COUNT(*)::int AS n FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.status = 'klaar' AND l.status = 'nieuw'")).n };
  for (const r of counts) { tel.alle += r.n; tel.bekeken += r.b; if (r.status === "klaar") tel.klaar += r.n; else if (["wachtrij", "bezig", "ontwerp", "ontwerpen"].includes(r.status)) tel.bezig += r.n; else tel.overgeslagen += r.n; }
  return {
    counts: tel,
    concepts: rows.map((c) => {
      const hero = (c.content?.hero?.foto || "").replace(/^afbeeldingen\//, "");
      return { ...publicConcept(c), leadId: c.lead_id, email: c.email, company: c.company, city: c.city, category: c.category, leadStatus: c.lead_status, website: c.website, phone: c.phone,
        titel: c.content?.hero?.titel || "", heroImg: hero && c.token ? `/api/voorbeeld/${c.token}/afbeeldingen/${hero}` : "", hqUrl: c.token ? `/voorbeeld/${c.token}?hq=1` : "" };
    }),
  };
}

// Beheer: een (handmatig verbeterd) ontwerp plaatsen bij een concept. Zelfde veiligheidsfilter als de ontwerp-agent.
export async function setConceptHtml(conceptId, html, user) {
  const c = await one("SELECT * FROM concepts WHERE id = $1", [conceptId]);
  if (!c) fail(404, "Concept niet gevonden.");
  const namen = new Set((c.images || []).map((i) => i.name));
  const schoon = sanitize(String(html || ""), { imgBase: "afbeeldingen/", namen });
  if (!schoon || schoon.length < 2000) fail(400, "Geen geldig HTML-document.");
  await q("UPDATE concepts SET html = $2, ontwerp_fout = '', ready_at = NOW(), updated_at = NOW() WHERE id = $1", [conceptId, schoon]);
  await audit(user, "concept_ontwerp", "concept", conceptId, { bytes: schoon.length });
  return { ok: true, bytes: schoon.length };
}

// Wie maakt de concepten: "taak" (geplande Claude-taak, standaard) of "netlify" (AI via Netlify, kost credits).
export const perTaak = async () => ((await getSettings()).b2b.concepten?.maker || "taak") !== "netlify";
export { get as haal };
