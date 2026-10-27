// API voor de geplande Claude-taak die concepten maakt (teksten, sfeerfoto's kiezen, ontwerp, zelf bekijken en verbeteren).
// Netlify scant alleen de site; alle AI gebeurt in de taak (Claude-abonnement), dus geen AI-kosten in Netlify.
// Toegang met header x-taak-sleutel (afgeleid van AUTH_SECRET; zichtbaar voor beheerders in HQ).
import crypto from "node:crypto";
import { q, one, str, env, fail, getSettings, audit } from "./core.mjs";
import { putFile, getFile, deleteFile } from "./files.mjs";
import { SYSTEM as CONTENT_SYSTEM, clean, zoekStock, haal, imageSize, conceptUrl } from "./concepts.mjs";
import { SYSTEM as ONTWERP_SYSTEM, sanitize, feitencheck, kleurcheck, VANGNET_CSS } from "./ontwerp.mjs";
import { BEWEGING } from "./beweging.mjs";
import { maakDNA, dnaTekst, lettertypenUit } from "./dna.mjs";
import { sprite, ICOON_NAMEN } from "./iconen.mjs";

export const taakSleutel = () => crypto.createHash("sha256").update(`${env("AUTH_SECRET", "x")}:concept-taak`).digest("hex").slice(0, 40);
export function checkTaak(req) {
  const a = Buffer.from(String(req.headers.get("x-taak-sleutel") || "")), b = Buffer.from(taakSleutel());
  if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) fail(403, "Geen toegang.");
}

// Alles wat de taak moet weten, uit de code (één bron).
export function instructies() {
  return {
    contentRegels: CONTENT_SYSTEM,
    ontwerpRegels: ONTWERP_SYSTEM,
    beweging: BEWEGING,
    vangnet: VANGNET_CSS,
    sprite: sprite(),
    iconen: ICOON_NAMEN,
  };
}

// Pak tot max concepten op die op een ontwerp wachten.
export async function claim(max = 5) {
  const n = Math.min(10, Math.max(1, Number(max) || 5));
  const rows = await q(`UPDATE concepts SET status = 'ontwerpen', taak_at = NOW(), pogingen = pogingen + 1, updated_at = NOW()
                        WHERE id IN (SELECT id FROM concepts WHERE status = 'ontwerp' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [n]);
  const out = [];
  // ontwerp-DNA: elke site een andere opbouw, en niet wat de laatste concepten al hadden
  const recent = (await q("SELECT bron->'dna' AS dna FROM concepts WHERE bron ? 'dna' ORDER BY COALESCE(taak_at, updated_at) DESC LIMIT 12")).map((r) => r.dna);
  const recentHtml = await q("SELECT html FROM concepts WHERE status = 'klaar' AND html IS NOT NULL AND html <> '' ORDER BY ready_at DESC NULLS LAST LIMIT 10");
  const telF = {};
  for (const r of recentHtml) for (const f of new Set(lettertypenUit(r.html))) telF[f] = (telF[f] || 0) + 1;
  const vermijdFonts = Object.keys(telF).sort((a, b) => telF[b] - telF[a]);
  for (const c of rows) {
    const l = await one("SELECT company, category, city, website, phone, email FROM leads WHERE id = $1", [c.lead_id]);
    const dna = maakDNA(recent, c.id);
    recent.unshift(dna);
    await q("UPDATE concepts SET bron = COALESCE(bron, '{}'::jsonb) || jsonb_build_object('dna', $2::jsonb) WHERE id = $1", [c.id, JSON.stringify(dna)]);
    const tekst = dnaTekst(dna) + (vermijdFonts.length ? `\nLettertypen: deze zijn recent veel gebruikt: ${vermijdFonts.join(", ")}. Kies liever iets anders op Bunny Fonts dat bij de richting past; gebruik er één alleen als die echt het beste bij dit bedrijf past (bijv. hun eigen huisletter), en schrijf in plan.md waarom.` : "");
    out.push({ id: c.id, token: c.token, bedrijf: l, instructie: c.instructie || "", ontwerpDNA: tekst, dna, bron: c.bron || {}, analyse: c.analysis || {},
      afbeeldingen: (c.images || []).map((i) => ({ naam: i.name, w: i.w, h: i.h, logo: !!i.logo, alt: i.alt || "", sfeerbeeld: !!i.stock })) });
  }
  return { concepten: out };
}

async function eigen(id, statussen = ["ontwerpen"]) {
  const c = await one("SELECT * FROM concepts WHERE id = $1", [id]);
  if (!c) fail(404, "Concept niet gevonden.");
  if (!statussen.includes(c.status)) fail(409, `Concept staat op '${c.status}', niet op ${statussen.join("/")}.`);
  return c;
}

export async function afbeelding(id, naam) {
  const c = await one("SELECT images FROM concepts WHERE id = $1", [id]);
  const i = (c?.images || []).find((x) => x.name === naam);
  const key = i ? i.key : /^kandidaat-\d+\.(jpg|png|webp)$/.test(naam) ? `concepts/${id}/${naam}` : "";
  const buf = key && await getFile(key);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  return new Response(buf, { headers: { "content-type": imageSize(buf)?.type || "application/octet-stream", "cache-control": "no-store" } });
}

// Sfeerfoto's zoeken (Pexels/Pixabay, sleutels staan in Netlify). Kandidaten worden als kandidaat-N opgeslagen zodat de taak ze kan bekijken.
export async function stockZoeken(id, termen) {
  await eigen(id);
  const lijst = (Array.isArray(termen) ? termen : []).map((t) => str(t, 60)).filter(Boolean).slice(0, 5);
  if (!lijst.length) fail(400, "Geef zoektermen.");
  if (!env("PEXELS_API_KEY") && !env("PIXABAY_API_KEY")) fail(400, "Geen sleutel voor sfeerfoto's (PEXELS_API_KEY of PIXABAY_API_KEY).");
  const gezien = new Set(), kand = [];
  for (const t of lijst) for (const p of await zoekStock(t, 6)) if (p.src && !gezien.has(p.url || p.src)) { gezien.add(p.url || p.src); kand.push({ ...p, term: t }); }
  const out = [];
  for (const p of kand.slice(0, 18)) {
    const r = p.klein && await haal(p.klein, { binary: true, max: 800000, timeout: 5000 });
    const t = r?.buf && imageSize(r.buf);
    if (!t) continue;
    const n = out.length + 1, ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[t.type] || "jpg";
    await putFile(`concepts/${id}/kandidaat-${n}.${ext}`, r.buf, { type: t.type, name: `kandidaat-${n}.${ext}` });
    out.push({ n, naam: `kandidaat-${n}.${ext}`, term: p.term, alt: str(p.alt, 120), src: p.src, url: p.url, door: str(p.door, 80) });
  }
  await q("UPDATE concepts SET bron = COALESCE(bron, '{}'::jsonb) || jsonb_build_object('kandidaten', $2::jsonb), updated_at = NOW() WHERE id = $1", [id, JSON.stringify(out)]);
  return { kandidaten: out.map(({ src, ...k }) => k) };
}

// De taak kiest kandidaten (beste eerst); wij halen de grote versie op en voegen ze toe als foto's.
export async function stockKiezen(id, nummers) {
  const c = await eigen(id);
  const kand = c.bron?.kandidaten || [];
  const images = c.images || [];
  let start = images.filter((i) => !i.logo).length;
  const toegevoegd = [];
  for (const n of (Array.isArray(nummers) ? nummers : []).map(Number).slice(0, 8)) {
    const k = kand.find((x) => x.n === n);
    if (!k) continue;
    const r = await haal(k.src, { binary: true, max: 3500000, timeout: 7000 });
    const size = r?.buf && imageSize(r.buf);
    if (!size) continue;
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[size.type];
    const name = `foto-${++start}.${ext}`, key = `concepts/${id}/${name}`;
    await putFile(key, r.buf, { type: size.type, name });
    const img = { name, key, type: size.type, w: size.w, h: size.h, size: r.buf.length, alt: k.alt, logo: false, stock: true, bron: k.url, fotograaf: k.door };
    images.push(img); toegevoegd.push({ naam: name, w: size.w, h: size.h, alt: k.alt });
  }
  await q("UPDATE concepts SET images = $2, updated_at = NOW() WHERE id = $1", [id, JSON.stringify(images)]);
  // kandidaten opruimen
  for (const k of kand) await deleteFile(`concepts/${id}/${k.naam}`).catch(() => {});
  return { toegevoegd };
}

// Eigen beeld van de lead ophalen (logo of foto) van hun eigen domein of de CDN van hun websitebouwer (Wix, Squarespace, …),
// voor sites waar de scan geen foto's vond (bijv. Wix laadt ze via script).
const CDN = /(^|\.)(wixstatic\.com|squarespace-cdn\.com|squarespace\.com|jimdocdn\.com|jimstatic\.com|webnode\.page|wp\.com|shopify\.com|cdn\.website-editor\.net|strikinglycdn\.com)$/i;
export async function eigenAfbeelding(id, { url, logo = false, alt = "" } = {}) {
  const c = await eigen(id);
  const lead = await one("SELECT website FROM leads WHERE id = $1", [c.lead_id]);
  let u; try { u = new URL(String(url)); } catch { fail(400, "Ongeldige URL."); }
  const host = u.hostname.replace(/^www\./, "");
  let eigenHost = ""; try { eigenHost = new URL(/^https?:/.test(lead?.website || "") ? lead.website : `https://${lead?.website}`).hostname.replace(/^www\./, ""); } catch {}
  if (u.protocol !== "https:" || !(host === eigenHost || host.endsWith("." + eigenHost) || CDN.test(host))) fail(400, `Alleen afbeeldingen van ${eigenHost || "hun eigen site"} of de CDN van hun websitebouwer.`);
  const r = await haal(u.href, { binary: true, max: 4000000, timeout: 8000 });
  const size = r?.buf && imageSize(r.buf);
  if (!size) fail(400, "Geen geldige afbeelding (jpg, png, webp, svg).");
  const images = c.images || [];
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" }[size.type] || "jpg";
  const name = logo ? `logo.${ext}` : `foto-${images.filter((i) => !i.logo).length + 1}.${ext}`;
  const key = `concepts/${id}/${name}`;
  await putFile(key, r.buf, { type: size.type, name });
  const rest = logo ? images.filter((i) => !i.logo) : images;
  rest.push({ name, key, type: size.type, w: size.w, h: size.h, size: r.buf.length, alt: str(alt, 120), logo: !!logo, bron: u.href });
  await q("UPDATE concepts SET images = $2, updated_at = NOW() WHERE id = $1", [id, JSON.stringify(rest)]);
  return { naam: name, w: size.w, h: size.h, logo: !!logo };
}

// Resultaat opslaan: content.json (zelfde eerlijkheidscontrole als altijd) + ontwerp-HTML (zelfde veiligheidsfilter).
export async function opslaan(id, { content, html }) {
  const c = await eigen(id);
  const lead = await one("SELECT * FROM leads WHERE id = $1", [c.lead_id]);
  const images = c.images || [];
  const tekst = c.bron?.tekst || "";
  const schoon = clean(content || {}, { text: tekst, images, lead });
  if (!schoon) fail(400, "content.json is onvolledig (hero.titel en minstens één dienst zijn verplicht).");
  if (content?.kleuren?.kleurBron === "logo" || content?.kleuren?.bron === "logo") schoon.kleuren.bron = "logo";
  if (images.some((i) => i.stock)) schoon.sfeerbeelden = true;
  const namen = new Set(images.map((i) => i.name));
  const h = sanitize(String(html || ""), { imgBase: "afbeeldingen/", namen });
  if (!h || h.length < 4000) fail(400, "Het ontwerp is geen geldig of volledig HTML-document (of bevatte <script>/javascript:).");
  const fouten = feitencheck(h, schoon);
  if (fouten.length) fail(400, `Feitencontrole: ${fouten.slice(0, 6).join(", ")}. Haal dit weg of neem het exact over uit content.json.`);
  const s = await getSettings();
  const dagen = Number(s.b2b.concepten?.geldigDagen || 30);
  await q(`UPDATE concepts SET status = 'klaar', content = $2, html = $3, ontwerp_fout = '', reden = '', ready_at = NOW(), expires_at = NOW() + ($4 || ' days')::interval, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(schoon), h, String(dagen)]);
  await audit(null, "concept_taak_klaar", "concept", id, { bytes: h.length });
  return { ok: true, url: `${conceptUrl(c.token)}?hq=1`, waarschuwingen: kleurcheck(h, [schoon.kleuren?.primair, schoon.kleuren?.accent].filter(Boolean)) };
}

// Niet geschikt (webshop, te weinig info) of mislukt.
export async function afmelden(id, { reden, overslaan }) {
  await eigen(id, ["ontwerpen", "ontwerp"]);
  await q("UPDATE concepts SET status = $2, reden = $3, updated_at = NOW() WHERE id = $1", [id, overslaan ? "overgeslagen" : "fout", str(reden, 300) || (overslaan ? "Niet geschikt voor een concept." : "De ontwerper kon het niet afmaken.")]);
  return { ok: true };
}

export async function status() {
  const rows = await q("SELECT status, COUNT(*)::int AS n FROM concepts GROUP BY status");
  const [{ n: vandaag }] = await q("SELECT COUNT(*)::int AS n FROM concepts WHERE status = 'klaar' AND ready_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')");
  return { perStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])), vandaagKlaar: vandaag };
}
