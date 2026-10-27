// Opdrachten: de echte website van een betalende klant.
// Na "Informatie aanleveren" maken we automatisch een opdracht. De ontwerper (geplande Claude-taak) pakt hem op:
// - kwam de klant via een concept, dan past hij DAT concept aan met de informatie van de klant (geen nieuw ontwerp);
// - anders maakt hij een nieuw ontwerp (met ontwerp-DNA).
// Maxim bekijkt het voorbeeld (/api/opdracht/<token>), geeft eventueel feedback, en zet hem live (repo + Netlify-project).
import crypto from "node:crypto";
import { q, one, str, fail, audit, escH, publicBase, portalUrl, OFFER } from "./core.mjs";
import { getFile } from "./files.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";
import { clean, imageSize, ONTWERP_SCRIPT } from "./concepts.mjs";
import { sanitize, feitencheck, toonOntwerp, VANGNET_CSS } from "./ontwerp.mjs";
import { BEWEGING } from "./beweging.mjs";
import { vulFormulierActie } from "./formulieren.mjs";
import { sprite } from "./iconen.mjs";
import { maakDNA, dnaTekst } from "./dna.mjs";
import { deliveryDue, HOOFDACTIES } from "./start.mjs";
import { provisionSite } from "./sites.mjs";
import { commitFiles } from "./github.mjs";
import { githubReady } from "./github.mjs";

const ext = (type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" }[type] || "");

// Afbeeldingen van de opdracht: die van het concept (zelfde namen, zodat het concept-ontwerp blijft kloppen)
// plus wat de klant zelf uploadde (klant-logo.*, klant-foto-N.*).
async function verzamelAfbeeldingen(customerId, concept) {
  const out = (concept?.images || []).map((i) => ({ name: i.name, key: i.key, type: i.type, w: i.w, h: i.h, logo: !!i.logo, stock: !!i.stock, alt: i.alt || "", bron: "concept" }));
  const files = await q("SELECT * FROM intake_files WHERE customer_id = $1 ORDER BY id", [customerId]);
  let n = 0, logo = 0;
  for (const f of files) {
    const e = ext(f.type);
    if (!e) continue; // pdf of ander bestand: alleen in HQ te downloaden
    const buf = await getFile(f.key);
    const size = buf && imageSize(buf);
    const isLogo = f.kind === "logo";
    // foto's die al uit het concept kwamen (vooraf ingevuld) niet dubbel
    if (/-van-je-site-\d+\./.test(f.name) && concept) continue;
    const name = isLogo ? `klant-logo${logo++ ? "-" + logo : ""}.${e}` : `klant-foto-${++n}.${e}`;
    out.push({ name, key: f.key, type: f.type, w: size?.w || 0, h: size?.h || 0, logo: isLogo, stock: false, alt: str(f.name, 120), bron: "klant" });
  }
  return out;
}

// Na het versturen van de informatie (en vanuit HQ voor oudere klanten).
export async function maakOpdracht(customerId, { user = null } = {}) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  const concept = c.lead_id ? await one("SELECT * FROM concepts WHERE lead_id = $1 AND status = 'klaar'", [c.lead_id]) : null;
  const images = await verzamelAfbeeldingen(c.id, concept);
  const o = await one(`INSERT INTO opdrachten (customer_id, concept_id, token, images) VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (customer_id) DO UPDATE SET status = 'wacht', concept_id = EXCLUDED.concept_id, images = EXCLUDED.images, reden = '', updated_at = NOW()
    WHERE opdrachten.status NOT IN ('ontwerpen','live') RETURNING *`, [c.id, concept?.id || null, crypto.randomBytes(12).toString("base64url"), JSON.stringify(images)]);
  if (user) await audit(user.id, c.id, "opdracht.gestart", { concept: !!concept });
  return o;
}

const publiek = (o) => ({
  id: o.id, customerId: o.customer_id, status: o.status, opBasisVanConcept: !!o.concept_id, feedback: o.feedback, reden: o.reden,
  voorbeeldUrl: `${publicBase()}/api/opdracht/${o.token}`, klaarAt: o.klaar_at, liveAt: o.live_at, taakAt: o.taak_at, createdAt: o.created_at,
  fotos: (o.images || []).filter((i) => !i.logo).length,
});

export async function lijst() {
  const rows = await q(`SELECT o.*, c.company, c.intake_at, c.site_repo, c.site_netlify_name, c.site_url, c.email
    FROM opdrachten o JOIN customers c ON c.id = o.customer_id ORDER BY (o.status = 'live'), COALESCE(c.intake_at, o.created_at)`);
  // klanten die al informatie stuurden maar (nog) geen opdracht hebben
  const zonder = await q(`SELECT id, company, intake_at FROM customers c WHERE onboarding AND intake_at IS NOT NULL AND site_status = 'in_aanbouw'
    AND NOT EXISTS (SELECT 1 FROM opdrachten o WHERE o.customer_id = c.id) ORDER BY intake_at`);
  return {
    opdrachten: await Promise.all(rows.map(async (o) => {
      const dom = await one("SELECT naam, status FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [o.customer_id]);
      return { ...publiek(o), company: o.company, intakeAt: o.intake_at, dueAt: deliveryDue(o.intake_at), site: o.site_netlify_name || "", siteUrl: o.site_url || "", repo: o.site_repo || "",
        domein: dom ? { naam: dom.naam, status: dom.status } : null };
    })),
    zonderOpdracht: zonder.map((c) => ({ customerId: c.id, company: c.company, intakeAt: c.intake_at, dueAt: deliveryDue(c.intake_at) })),
  };
}
export const teDoen = async () => (await one("SELECT COUNT(*)::int AS n FROM opdrachten WHERE status IN ('wacht','ontwerpen','controle','fout')")).n;

// Maxim wil iets anders: terug naar de ontwerper met feedback.
export async function opnieuw(id, feedback, user) {
  const o = await one("UPDATE opdrachten SET status = 'wacht', feedback = $2, reden = '', updated_at = NOW() WHERE id = $1 AND status <> 'live' RETURNING *", [id, str(feedback, 3000)]);
  if (!o) fail(409, "Deze opdracht staat al live of bestaat niet.");
  await audit(user.id, o.customer_id, "opdracht.feedback", {});
  return publiek(o);
}

// Taak: opdracht van een klant zelf weer oppakken (feedback van Maxim via de chat). Status → ontwerpen.
export async function taakHeropen(customerId, feedback) {
  const o = await one("SELECT * FROM opdrachten WHERE customer_id = $1 ORDER BY id DESC LIMIT 1", [customerId]);
  if (!o) fail(404, "Geen opdracht voor deze klant.");
  if (o.status === "live") fail(409, "Deze opdracht staat al live.");
  await q("UPDATE opdrachten SET status = 'wacht', feedback = COALESCE(NULLIF($2, ''), feedback), updated_at = NOW() WHERE id = $1", [o.id, str(feedback, 3000)]);
  return { ok: true, id: o.id };
}
export async function claimEen(id) {
  const r = await one("UPDATE opdrachten SET status = 'ontwerpen', taak_at = NOW(), pogingen = pogingen + 1, updated_at = NOW() WHERE id = $1 AND status = 'wacht' RETURNING id", [id]);
  if (!r) fail(409, "Deze opdracht wacht niet.");
  return r;
}

// ---------------------------------------------------------------- voor de ontwerper (taak-API)
export async function claimOpdrachten(max = 3, id = 0) {
  if (id) await claimEen(id);
  await q("UPDATE opdrachten SET status = 'wacht', updated_at = NOW() WHERE status = 'ontwerpen' AND taak_at < NOW() - INTERVAL '3 hours'");
  const rows = id ? await q("SELECT * FROM opdrachten WHERE id = $1", [id]) : await q(`UPDATE opdrachten SET status = 'ontwerpen', taak_at = NOW(), pogingen = pogingen + 1, updated_at = NOW()
    WHERE id IN (SELECT id FROM opdrachten WHERE status = 'wacht' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [Math.min(5, Math.max(1, Number(max) || 3))]);
  const out = [];
  const recent = (await q("SELECT bron->'dna' AS dna FROM concepts WHERE bron ? 'dna' ORDER BY COALESCE(taak_at, updated_at) DESC LIMIT 12")).map((r) => r.dna);
  for (const o of rows) {
    const c = await one("SELECT * FROM customers WHERE id = $1", [o.customer_id]);
    const concept = o.concept_id ? await one("SELECT * FROM concepts WHERE id = $1", [o.concept_id]) : null;
    let dna = o.dna;
    if (!concept && !dna) { dna = maakDNA(recent, `o${o.id}`); await q("UPDATE opdrachten SET dna = $2 WHERE id = $1", [o.id, JSON.stringify(dna)]); }
    out.push({
      id: o.id,
      bedrijf: { naam: c.company, contactpersoon: c.contact_name || "", email: c.email || "", telefoon: c.phone || "", kvk: c.kvk || "", adres: c.address || "" },
      intake: { ...(c.intake || {}), hoofdactieTekst: HOOFDACTIES[c.intake?.hoofdactie] || "" },
      feedback: o.feedback || "",
      basis: concept ? "concept" : "nieuw",
      concept: concept ? { html: concept.html || "", content: concept.content || {}, bron: { url: concept.bron?.url || "", tekst: concept.bron?.tekst || "" } } : null,
      ontwerpDNA: concept ? "" : dnaTekst(dna),
      vorigeVersie: o.html ? { html: o.html, content: o.content, paginas: o.paginas || {} } : null,
      afbeeldingen: (o.images || []).map((i) => ({ naam: i.name, w: i.w, h: i.h, logo: i.logo, alt: i.alt, sfeerbeeld: i.stock, van: i.bron })),
    });
  }
  return { opdrachten: out };
}

async function eigen(id) {
  const o = await one("SELECT * FROM opdrachten WHERE id = $1", [id]);
  if (!o) fail(404, "Opdracht niet gevonden.");
  return o;
}
export async function afbeelding(id, naam, { token = "" } = {}) {
  const o = token ? await one("SELECT * FROM opdrachten WHERE token = $1", [token]) : await one("SELECT * FROM opdrachten WHERE id = $1", [id]);
  const i = (o?.images || []).find((x) => x.name === naam);
  const buf = i && await getFile(i.key);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  return new Response(buf, { headers: { "content-type": i.type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" } });
}

// Toegestane extra pagina's (naam → bestand op de site).
export const PAGINAS = ["algemene-voorwaarden.html", "privacy.html"];
export async function opslaan(id, { content, html, paginas }) {
  const o = await eigen(id);
  if (o.status !== "ontwerpen") fail(409, `Opdracht staat op '${o.status}', niet op ontwerpen.`);
  const c = await one("SELECT * FROM customers WHERE id = $1", [o.customer_id]);
  const concept = o.concept_id ? await one("SELECT content, bron FROM concepts WHERE id = $1", [o.concept_id]) : null;
  // Feiten mogen komen uit: wat de klant invulde, zijn klantgegevens en (als basis) het concept en de tekst van zijn oude site.
  const bronTekst = [JSON.stringify(c.intake || {}), c.company, c.email, c.phone, c.address, c.kvk, concept ? JSON.stringify(concept.content) : "", concept?.bron?.tekst || ""].join("\n");
  const images = o.images || [];
  const schoon = clean(content || {}, { text: bronTekst, images, lead: { company: c.company, city: "" } });
  if (!schoon) fail(400, "content.json is onvolledig (hero.titel en minstens één dienst zijn verplicht).");
  const namen = new Set(images.map((i) => i.name));
  const h = sanitize(String(html || ""), { imgBase: "afbeeldingen/", namen, formulieren: true });
  if (!h || h.length < 4000) fail(400, "Het ontwerp is geen geldig of volledig HTML-document (of bevatte <script>/javascript:).");
  const fouten = feitencheck(h, { ...schoon, extraTekst: bronTekst });
  if (fouten.length) fail(400, `Feitencontrole: ${fouten.slice(0, 6).join(", ")}. Haal dit weg of neem het exact over uit wat de klant aanleverde.`);
  const extra = {};
  for (const [naam, inhoud] of Object.entries(paginas || {})) {
    if (!PAGINAS.includes(naam)) fail(400, `Onbekende pagina ${naam} (toegestaan: ${PAGINAS.join(", ")}).`);
    const p = sanitize(String(inhoud || ""), { imgBase: "afbeeldingen/", namen });
    if (!p || p.length < 1500) fail(400, `Pagina ${naam} is geen geldig HTML-document.`);
    extra[naam] = p;
  }
  await q("UPDATE opdrachten SET status = 'controle', html = $2, content = $3, paginas = $4, klaar_at = NOW(), reden = '', updated_at = NOW() WHERE id = $1", [id, h, JSON.stringify(schoon), JSON.stringify(extra)]);
  await notifyStaff(`Website klaar om te controleren: ${c.company}`, [`De ontwerper heeft de website van ${c.company} gemaakt${o.concept_id ? " (op basis van het concept)" : ""}.`, `Bekijk hem op mobiel en desktop en zet hem live in HQ › Opdrachten.`, `Uiterlijk online: ${new Date(deliveryDue(c.intake_at) || Date.now()).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`], "/hq/#opdrachten").catch(() => {});
  return { ok: true, url: `${publicBase()}/api/opdracht/${o.token}` };
}
export async function afmelden(id, { reden }) {
  await eigen(id);
  await q("UPDATE opdrachten SET status = 'fout', reden = $2, updated_at = NOW() WHERE id = $1 AND status = 'ontwerpen'", [id, str(reden, 300) || "De ontwerper kon het niet afmaken."]);
  return { ok: true };
}

// ---------------------------------------------------------------- voorbeeld (Maxim, en eventueel de klant)
export async function voorbeeldPagina(token, naam, { nonce }) {
  const o = await one("SELECT * FROM opdrachten WHERE token = $1", [token]);
  const p = PAGINAS.includes(naam) && o?.paginas?.[naam];
  if (!p) return new Response("Niet gevonden", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const html = toonOntwerp(p, { imgBase: `${publicBase()}/api/opdracht/${o.token}/afbeeldingen/`, bodyStart: "", bodyEnd: `<script nonce="${nonce}">${ONTWERP_SCRIPT}</script><script nonce="${nonce}">${BEWEGING}</script>` })
    .replace(/href="\/(algemene-voorwaarden|privacy)\.html"/g, (m, n) => `href="${publicBase()}/api/opdracht/${o.token}/pagina/${n}.html"`).replace(/href="\/(#[^"]*)?"/g, (m, h) => `href="${publicBase()}/api/opdracht/${o.token}${h || ""}"`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
    "content-security-policy": `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'` } });
}
export async function voorbeeld(token, { nonce }) {
  const o = await one("SELECT o.*, c.company FROM opdrachten o JOIN customers c ON c.id = o.customer_id WHERE o.token = $1", [token]);
  if (!o?.html) return new Response("Deze website is nog niet klaar.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const balk = `<style nonce="${nonce}">.sm-balk{position:relative;z-index:99;background:#1C0747;color:#fff;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 16px;text-align:center}.sm-balk b{color:#0CC0DF}</style><div class="sm-balk"><b>Voorbeeld</b> · de nieuwe website van ${escH(o.company)}${o.status === "live" ? " (staat live)" : ", nog niet live"}</div>`;
  const html = toonOntwerp(o.html.replace(/href="\/(algemene-voorwaarden|privacy)\.html"/g, (m, n) => `href="${publicBase()}/api/opdracht/${o.token}/pagina/${n}.html"`), { imgBase: `${publicBase()}/api/opdracht/${o.token}/afbeeldingen/`, bodyStart: balk, bodyEnd: `<script nonce="${nonce}">${ONTWERP_SCRIPT}</script><script nonce="${nonce}">${BEWEGING}</script>` });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
    "content-security-policy": `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'` } });
}

// ---------------------------------------------------------------- live zetten
// De bestanden van de echte site: ontwerp.html (zoals ontworpen), afbeeldingen, beweging en iconen, en content.json (de feiten).
export async function siteBestanden(o) {
  const files = [
    { path: "ontwerp.html", content: vulFormulierActie(o.html, o.customer_id) },
    { path: "content.json", content: JSON.stringify(o.content || {}, null, 2) + "\n" },
    { path: "beweging.js", content: `${ONTWERP_SCRIPT}\n${BEWEGING}\n` },
    { path: "sprite.svg", content: sprite() },
    { path: "vangnet.css", content: VANGNET_CSS },
    ...Object.entries(o.paginas || {}).filter(([n]) => PAGINAS.includes(n)).map(([n, h]) => ({ path: n, content: h })),
  ];
  const gebruikt = new Set([...((o.html + Object.values(o.paginas || {}).join("")).match(/afbeeldingen\/[\w.\-]+/g) || []), ...(JSON.stringify(o.content || {}).match(/afbeeldingen\/[\w.\-]+/g) || [])]);
  for (const i of o.images || []) {
    if (!gebruikt.has(`afbeeldingen/${i.name}`)) continue;
    const buf = await getFile(i.key);
    if (buf) files.push({ path: `afbeeldingen/${i.name}`, content: buf });
  }
  return files;
}

export async function liveZetten(id, user) {
  const o = await eigen(id);
  if (!["controle", "live"].includes(o.status) || !o.html) fail(409, "Deze website is nog niet klaar om live te zetten.");
  if (!githubReady()) fail(503, "Zet eerst GITHUB_TOKEN en GITHUB_ORG in Netlify, dan kan HQ de website live zetten.");
  const c = await one("SELECT * FROM customers WHERE id = $1", [o.customer_id]);
  const bestanden = await siteBestanden(o);
  let site = null;
  if (!c.site_repo) site = await provisionSite(c.id, { thema: o.content?.thema }, user, { bestanden });
  else await commitFiles(c.site_repo, "main", bestanden, "Website van de ontwerper bijgewerkt");
  const k = await one("SELECT * FROM customers WHERE id = $1", [c.id]);
  const url = k.site_url || (k.site_netlify_name ? `https://${k.site_netlify_name}.netlify.app` : "");
  await q("UPDATE customers SET site_status = 'live', delivered_at = COALESCE(delivered_at, CURRENT_DATE), site_url = COALESCE(NULLIF(site_url, ''), $2), updated_at = NOW() WHERE id = $1", [c.id, url]);
  await q("UPDATE opdrachten SET status = 'live', live_at = NOW(), updated_at = NOW() WHERE id = $1", [id]);
  await audit(user.id, c.id, "opdracht.live", { repo: site?.repo || c.site_repo });
  // mail aan de klant
  const dom = await one("SELECT naam, status FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [c.id]);
  const u = await one("SELECT email FROM users WHERE customer_id = $1 AND active ORDER BY id LIMIT 1", [c.id]);
  const aan = u?.email || c.email;
  if (aan && o.status !== "live") {
    const regels = [`Je nieuwe website staat online${url ? `: ${url}` : ""}.`, dom && dom.status !== "actief" ? `Wil je hem op ${dom.naam}? Zet dan bij je provider de twee instellingen die in je portaal bij Account staan. Wij doen de rest en mailen je zodra het werkt.` : "", `Iets aanpassen? Geef het door in je portaal; je hebt ${OFFER.changesPerMonth} wijzigingen per maand.`].filter(Boolean);
    await sendMail({ to: aan, kind: "site-live", ref: `customer:${c.id}`, subject: "Je nieuwe website staat online",
      text: `Beste ${c.contact_name || c.company},\n\n${regels.join("\n\n")}\n\nMet vriendelijke groet,\nSitemaker`,
      html: brandHtml({ title: "Je website staat online", intro: [`Beste ${escH(c.contact_name || c.company)},`, ...regels.map(escH)], button: url ? { label: "Bekijk je website", href: url } : { label: "Naar je portaal", href: portalUrl() } }) }).catch(() => {});
  }
  return { ok: true, url, repo: site?.repo || c.site_repo, needsLink: !!site?.needsLink };
}
