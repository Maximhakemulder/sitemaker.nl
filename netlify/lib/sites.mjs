// Klantsites: aanmaken (repo + Netlify-project) en wijzigingen automatisch verwerken met Claude.
// Elke wijziging wordt een voorstel (branch + pull request + voorbeeldlink). Maxim keurt goed in HQ.
import { conceptForCustomer } from "./concepts.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { env, q, one, str, fail, audit, cleanEmail, sha256 } from "./core.mjs";
import { githubReady, githubOwner, createRepo, getRepo, commitFiles, readFile, openPr, mergePr, closePr, deleteBranch } from "./github.mjs";
import { netlifyReady, createSite, previewUrl } from "./netlifyapi.mjs";
import { aiReady, claude, parseJson } from "./ai.mjs";
import { getFile } from "./files.mjs";
import { mailChangeStatus } from "./portal.mjs";

export const THEMAS = { elegant: "Elegant (donker, goud)", stoer: "Stoer (geel, zwart)", natuur: "Natuur (crème, groen)", zacht: "Zacht (lila, modern)" };
export const autoReady = () => githubReady() && aiReady();

const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "klant";

// ---------------------------------------------------------------- startsjabloon
function templateDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const kandidaten = [process.cwd(), env("LAMBDA_TASK_ROOT"), here, path.join(here, ".."), path.join(here, "../..")].filter(Boolean);
  for (const k of kandidaten) { const d = path.join(k, "templates/klantsite"); if (fs.existsSync(path.join(d, "content.json"))) return d; }
  fail(500, "Het startsjabloon is niet gevonden.");
}
function templateFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "dist" && e.name !== "node_modules") out.push(...templateFiles(p, base)); }
    else out.push({ path: path.relative(base, p).split(path.sep).join("/"), content: fs.readFileSync(p) });
  }
  return out;
}

export async function provisionSite(customerId, b, user, { bestanden = null } = {}) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  if (c.site_repo) fail(409, "Deze klant heeft al een gekoppelde site.");
  if (!githubReady()) fail(503, "Zet eerst GITHUB_TOKEN en GITHUB_ORG in Netlify, dan kan HQ repo's aanmaken.");
  const thema = THEMAS[b.thema] ? b.thema : "natuur";
  // 1. repo
  let naam = `site-${slug(c.company)}`, repo;
  for (let i = 0; i < 4 && !repo; i++) {
    try { repo = await createRepo(i ? `${naam}-${i + 1}` : naam, `Website van ${c.company} (Sitemaker)`); }
    catch (e) { if (e.status !== 422) throw e; }
  }
  if (!repo) fail(409, "Er bestaat al een repo met deze naam. Kies een andere bedrijfsnaam of koppel de bestaande repo.");
  // 2. startsjabloon met de gegevens van de klant
  const dir = templateDir();
  const content = JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));
  content.thema = thema;
  content.bedrijf = { ...content.bedrijf, naam: c.company, email: c.email || "", telefoon: c.phone || "", adres: c.address.split("\n")[0] || "", kvk: c.kvk || "", plaats: "" };
  content.seo = { titel: c.company, omschrijving: "" };
  content.hero = { ...content.hero, label: "", titel: `Welkom bij ${c.company}`, tekst: "Hier komt een korte, krachtige zin over wat jullie doen." };
  let files = templateFiles(dir).filter((f) => f.path !== "content.json");
  // Was deze klant eerst een lead met een concept? Dan starten we vanuit dat concept (teksten, foto's, thema).
  // Komt het ontwerp uit een opdracht (eigen ontwerp van de ontwerper), dan gebruiken we precies die bestanden.
  const concept = bestanden ? null : await conceptForCustomer(c).catch(() => null);
  let start = content, bron = "sjabloon";
  if (concept) {
    start = { ...concept.content, thema: b.thema && THEMAS[b.thema] ? b.thema : concept.content.thema || thema };
    start.bedrijf = { ...start.bedrijf, naam: start.bedrijf?.naam || c.company, email: start.bedrijf?.email || c.email || "", telefoon: start.bedrijf?.telefoon || c.phone || "", kvk: c.kvk || "" };
    files = files.filter((f) => !f.path.startsWith("afbeeldingen/")).concat(concept.files);
    bron = "concept";
  }
  if (bestanden) { files = files.filter((f) => !f.path.startsWith("afbeeldingen/") && !bestanden.some((x) => x.path === f.path)).concat(bestanden); bron = "opdracht"; }
  else files.push({ path: "content.json", content: JSON.stringify(start, null, 2) + "\n" });
  await waitForMain(repo.full_name);
  await commitFiles(repo.full_name, "main", files, bron === "opdracht" ? "Website van de ontwerper" : bron === "concept" ? "Start vanuit het concept" : "Startsjabloon Sitemaker");
  // 3. Netlify-project
  let site = { id: "", name: "", url: "", linked: false };
  if (netlifyReady()) {
    for (let i = 0; i < 4 && !site.id; i++) {
      try { site = await createSite({ name: `${slug(c.company)}${i ? "-" + crypto.randomBytes(2).toString("hex") : ""}`, repoFullName: repo.full_name, repoId: repo.id }); }
      catch (e) { if (e.status !== 422) throw e; }
    }
  }
  await q("UPDATE customers SET site_repo = $1, site_netlify_id = $2, site_netlify_name = $3, site_theme = $4, updated_at = NOW() WHERE id = $5",
    [repo.full_name, site.id, site.name, thema, c.id]);
  await audit(user.id, c.id, "site.aangemaakt", { repo: repo.full_name, netlify: site.name, gekoppeld: site.linked, bron });
  return { repo: repo.full_name, repoUrl: repo.html_url, netlify: site, needsLink: !site.linked, bron };
}
async function waitForMain(repo) {
  for (let i = 0; i < 10; i++) { try { if (await readFile(repo, "README.md")) return; } catch {} await new Promise((r) => setTimeout(r, 800)); }
}

export async function linkSite(customerId, b, user) {
  const repo = str(b.repo, 140).replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(400, "Vul de repo in als eigenaar/naam, bijvoorbeeld sitemaker-sites/site-kapsalon.", { field: "repo" });
  const netlifyName = str(b.netlifyName, 80).replace(/^https?:\/\//, "").replace(/\.netlify\.app.*$/, "");
  if (githubReady() && !(await getRepo(repo))) fail(400, "Die repo kan ik niet vinden met de huidige GitHub-sleutel.", { field: "repo" });
  await q("UPDATE customers SET site_repo = $1, site_netlify_name = $2, site_theme = COALESCE(NULLIF($3, ''), site_theme), updated_at = NOW() WHERE id = $4", [repo, netlifyName, THEMAS[b.thema] ? b.thema : "", customerId]);
  await audit(user.id, customerId, "site.gekoppeld", { repo, netlify: netlifyName });
  return { ok: true };
}

// ---------------------------------------------------------------- verwerken
// Zet een wijziging klaar voor Claude en start de achtergrondfunctie.
export async function queueChange(changeId) {
  const r = await one(`UPDATE change_requests cr SET ai_status = 'wachtrij', ai_updated_at = NOW() FROM customers c
                       WHERE cr.id = $1 AND c.id = cr.customer_id AND c.site_repo <> '' AND cr.status IN ('ontvangen','in_behandeling') AND cr.ai_status NOT IN ('voorstel','bezig') RETURNING cr.id`, [changeId]);
  if (!r) return { queued: false };
  await trigger(changeId);
  return { queued: true };
}

export const triggerKey = (id) => sha256(`${env("AUTH_SECRET", "x")}:verwerk:${id}`).slice(0, 32);
async function trigger(changeId) {
  if (env("SM_INLINE_AI") === "1") return processChange(changeId).catch((e) => console.log("[ai]", e.message));
  const base = (env("URL") || env("PUBLIC_BASE_URL") || "").replace(/\/$/, "");
  if (!base) return;
  await fetch(`${base}/.netlify/functions/verwerk-background`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: changeId, key: triggerKey(changeId) }), signal: AbortSignal.timeout(8000) }).catch((e) => console.log("[ai] trigger", e.message));
}

const SYSTEM = `Je bent webredacteur bij Sitemaker. Je verwerkt wijzigingsverzoeken van klanten in hun website.
De hele inhoud van de site staat in één JSON-bestand (content.json). Jij geeft het complete, aangepaste bestand terug.

Regels:
- Pas alleen aan wat de klant vraagt. Laat al het andere exact hetzelfde, ook de volgorde van velden.
- Houd dezelfde structuur en veldnamen aan. Voeg geen nieuwe velden op het hoogste niveau toe.
- Schrijf in correct Nederlands, in de toon die de site al heeft.
- Verzin geen feiten: geen telefoonnummers, prijzen, adressen, namen, reviews of beloftes die de klant niet geeft.
- Afbeeldingen: gebruik alleen paden die al in content.json staan of het pad van een meegestuurde bijlage.
- Toegestane thema's: elegant, stoer, natuur, zacht. Kleuren als hexcode in kleuren.primair/accent.
- Kan het verzoek niet binnen content.json (bijvoorbeeld een nieuwe pagina, een webshop, een formulier met een koppeling, een volledig nieuw ontwerp), is het onduidelijk, of mis je informatie? Doe dan niets en leg kort uit waarom.

Antwoord alleen met JSON, zonder uitleg eromheen:
{"kan": true, "samenvatting": "<1-2 zinnen voor de beheerder wat je hebt aangepast>", "content": { ...het complete nieuwe content.json... }}
of
{"kan": false, "reden": "<korte uitleg voor de beheerder>"}`;

// Sites met een eigen ontwerp (ontwerp.html van de ontwerper): Claude past de HTML aan met zoek/vervang-stukken.
const SYSTEM_HTML = `Je bent webredacteur bij Sitemaker. Je verwerkt wijzigingsverzoeken van klanten in hun website.
De site is één HTML-bestand (ontwerp.html) met een eigen ontwerp. Jij geeft de aanpassingen terug als zoek/vervang-stukken.

Regels:
- Pas alleen aan wat de klant vraagt. Laat het ontwerp, de opmaak (CSS) en alle andere teksten exact hetzelfde.
- Elk "zoek"-stuk moet LETTERLIJK en precies één keer in de HTML voorkomen (kopieer het exact, inclusief tags). Houd de stukken kort maar uniek.
- Schrijf in correct Nederlands, in de toon die de site al heeft.
- Verzin geen feiten: geen telefoonnummers, prijzen, adressen, namen, reviews of beloftes die de klant niet geeft.
- Geen <script>, geen externe bronnen. Afbeeldingen: alleen paden die al in de HTML staan of het pad van een meegestuurde bijlage.
- Kan het verzoek niet met kleine aanpassingen in deze ene pagina (een nieuwe pagina, een webshop, een formulier met een koppeling, een volledig nieuw ontwerp), is het onduidelijk, of mis je informatie? Doe dan niets en leg kort uit waarom.

Antwoord alleen met JSON, zonder uitleg eromheen:
{"kan": true, "samenvatting": "<1-2 zinnen voor de beheerder>", "wijzigingen": [{"zoek": "<exact stuk>", "vervang": "<nieuw stuk>"}]}
of
{"kan": false, "reden": "<korte uitleg voor de beheerder>"}`;

export function pasHtmlAan(html, wijzigingen) {
  let h = html;
  for (const w of wijzigingen || []) {
    const zoek = String(w?.zoek ?? ""), vervang = String(w?.vervang ?? "");
    if (!zoek) return { fout: "Leeg zoek-stuk." };
    const n = h.split(zoek).length - 1;
    if (n !== 1) return { fout: n ? "Een zoek-stuk komt meer dan één keer voor." : "Een zoek-stuk staat niet in de HTML." };
    h = h.replace(zoek, () => vervang);
  }
  return { html: h };
}

function flatten(o, pre = "", out = {}) {
  if (Array.isArray(o)) o.forEach((v, i) => flatten(v, `${pre}[${i}]`, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flatten(v, pre ? `${pre}.${k}` : k, out);
  else out[pre] = o;
  return out;
}
export function diffContent(a, b) {
  const A = flatten(a), B = flatten(b), out = [];
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) out.push({ veld: k, oud: A[k] ?? null, nieuw: B[k] ?? null });
  return out.slice(0, 80);
}
function geldig(oud, nieuw) {
  if (!nieuw || typeof nieuw !== "object" || Array.isArray(nieuw)) return "Geen geldige inhoud teruggekregen.";
  for (const k of Object.keys(nieuw)) if (!(k in oud)) return `Onbekend onderdeel "${k}" toegevoegd.`;
  for (const k of ["bedrijf", "hero"]) if (!nieuw[k] || typeof nieuw[k] !== "object") return `Onderdeel "${k}" ontbreekt.`;
  if (nieuw.thema && !THEMAS[nieuw.thema]) return "Onbekend thema.";
  const paden = JSON.stringify(nieuw).match(/afbeeldingen\/[\w.\-]+/g) || [];
  const bekend = new Set([...(JSON.stringify(oud).match(/afbeeldingen\/[\w.\-]+/g) || []), ...(geldig.extra || [])]);
  for (const p of paden) if (!bekend.has(p)) return `Onbekende afbeelding ${p}.`;
  return "";
}

export async function processChange(changeId) {
  const w = await one(`SELECT cr.*, c.company, c.site_repo, c.site_netlify_name FROM change_requests cr JOIN customers c ON c.id = cr.customer_id WHERE cr.id = $1`, [changeId]);
  if (!w || !w.site_repo || !["wachtrij", "fout"].includes(w.ai_status)) return { skipped: true };
  const claim = await one("UPDATE change_requests SET ai_status = 'bezig', ai_attempts = ai_attempts + 1, ai_updated_at = NOW(), status = CASE WHEN status = 'ontvangen' THEN 'in_behandeling' ELSE status END WHERE id = $1 AND ai_status IN ('wachtrij','fout') RETURNING id", [changeId]);
  if (!claim) return { skipped: true };
  try {
    const repo = w.site_repo;
    const ontwerpHtml = await readFile(repo, "ontwerp.html").catch(() => null);
    const tekst = ontwerpHtml ? "{}" : await readFile(repo, "content.json");
    if (!tekst) throw Object.assign(new Error("content.json niet gevonden in de repo."), { handmatig: true });
    const oud = JSON.parse(tekst);
    // bijlage: afbeelding mee in de branch, tekst als context
    const extraFiles = [];
    let bijlageInfo = "Geen bijlage.";
    geldig.extra = [];
    if (w.attachment_key) {
      const buf = await getFile(w.attachment_key);
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" }[w.attachment_type];
      if (buf && ext) {
        const p = `afbeeldingen/wijziging-${w.id}.${ext}`;
        extraFiles.push({ path: p, content: buf });
        geldig.extra = [p];
        bijlageInfo = `De klant stuurde een afbeelding mee. Die staat klaar op pad "${p}". Gebruik dat pad als de klant deze foto ergens wil hebben.`;
      } else if (buf && w.attachment_type === "text/plain") {
        bijlageInfo = `De klant stuurde een tekstbestand mee:\n"""${buf.toString("utf8").slice(0, 6000)}"""`;
      } else {
        bijlageInfo = `De klant stuurde een bestand mee (${w.attachment_name}) dat je niet kunt lezen. Als het verzoek daarvan afhangt: kan=false.`;
      }
    }
    if (ontwerpHtml) return await verwerkHtml(w, repo, ontwerpHtml, extraFiles, bijlageInfo);
    const prompt = `Bedrijf: ${w.company}
Pagina volgens de klant: ${w.page || "niet opgegeven"}
Wijzigingsverzoek van de klant:
"""${w.description}"""
${w.ai_feedback ? `\nOpmerking van de beheerder bij het vorige voorstel (verwerk dit):\n"""${w.ai_feedback}"""\n` : ""}
${bijlageInfo}

Huidige content.json:
${JSON.stringify(oud, null, 2)}`;
    const antwoord = parseJson(await claude({ system: SYSTEM, prompt }));
    if (!antwoord) throw new Error("Claude gaf geen leesbaar antwoord.");
    if (antwoord.kan === false) {
      await q("UPDATE change_requests SET ai_status = 'handmatig', ai_reason = $2, ai_updated_at = NOW() WHERE id = $1", [w.id, str(antwoord.reden, 600) || "Kan niet automatisch."]);
      return { handmatig: true };
    }
    const fout = geldig(oud, antwoord.content);
    if (fout) throw Object.assign(new Error(`Voorstel afgekeurd door controle: ${fout}`), { handmatig: true });
    const diff = diffContent(oud, antwoord.content);
    if (!diff.length) throw Object.assign(new Error("Het voorstel verandert niets aan de site."), { handmatig: true });
    // branch + commit + pull request
    const branch = `wijziging-${w.id}`;
    if (w.pr_number) { await closePr(repo, w.pr_number).catch(() => null); }
    await commitFiles(repo, branch, [...extraFiles, { path: "content.json", content: JSON.stringify(antwoord.content, null, 2) + "\n" }],
      `Wijziging #${w.id}: ${str(antwoord.samenvatting, 70) || "aanpassing"}`, { createFrom: "main" });
    const pr = await openPr(repo, branch, `Wijziging #${w.id}: ${str(antwoord.samenvatting, 80)}`,
      `Verzoek van de klant:\n\n> ${w.description.replace(/\n/g, "\n> ")}\n\nVoorstel: ${antwoord.samenvatting}\n\nGoedkeuren gaat via Sitemaker HQ.`);
    await q(`UPDATE change_requests SET ai_status = 'voorstel', ai_summary = $2, ai_diff = $3::jsonb, ai_reason = '', branch = $4, pr_number = $5, pr_url = $6, preview_url = $7, ai_updated_at = NOW() WHERE id = $1`,
      [w.id, str(antwoord.samenvatting, 500), JSON.stringify(diff), branch, pr.number, pr.html_url || "", previewUrl(w.site_netlify_name, pr.number)]);
    return { voorstel: true, pr: pr.number };
  } catch (e) {
    console.log("[ai] wijziging", changeId, e.message);
    await q("UPDATE change_requests SET ai_status = $2, ai_reason = $3, ai_updated_at = NOW() WHERE id = $1",
      [changeId, e.handmatig ? "handmatig" : "fout", str(e.message, 600)]);
    return { error: e.message };
  }
}

async function verwerkHtml(w, repo, oudHtml, extraFiles, bijlageInfo) {
  const prompt = `Bedrijf: ${w.company}
Pagina volgens de klant: ${w.page || "niet opgegeven"}
Wijzigingsverzoek van de klant:
"""${w.description}"""
${w.ai_feedback ? `\nOpmerking van de beheerder bij het vorige voorstel (verwerk dit):\n"""${w.ai_feedback}"""\n` : ""}
${bijlageInfo}

Huidige ontwerp.html:
${oudHtml}`;
  const antwoord = parseJson(await claude({ system: SYSTEM_HTML, prompt, maxTokens: 8000 }));
  if (!antwoord) throw new Error("Claude gaf geen leesbaar antwoord.");
  if (antwoord.kan === false) {
    await q("UPDATE change_requests SET ai_status = 'handmatig', ai_reason = $2, ai_updated_at = NOW() WHERE id = $1", [w.id, str(antwoord.reden, 600) || "Kan niet automatisch."]);
    return { handmatig: true };
  }
  const r = pasHtmlAan(oudHtml, antwoord.wijzigingen);
  if (r.fout) throw Object.assign(new Error(`Voorstel afgekeurd door controle: ${r.fout}`), { handmatig: true });
  const bekend = new Set([...(oudHtml.match(/afbeeldingen\/[\w.\-]+/g) || []), ...extraFiles.map((f) => f.path)]);
  for (const p of r.html.match(/afbeeldingen\/[\w.\-]+/g) || []) if (!bekend.has(p)) throw Object.assign(new Error(`Voorstel afgekeurd door controle: onbekende afbeelding ${p}.`), { handmatig: true });
  if (/<script|javascript:|<[^>]+\son[a-z]+\s*=/i.test(r.html)) throw Object.assign(new Error("Voorstel afgekeurd door controle: script in de HTML."), { handmatig: true });
  if (r.html === oudHtml) throw Object.assign(new Error("Het voorstel verandert niets aan de site."), { handmatig: true });
  const diff = (antwoord.wijzigingen || []).slice(0, 40).map((x) => ({ veld: "ontwerp.html", oud: str(x.zoek, 400), nieuw: str(x.vervang, 400) }));
  const branch = `wijziging-${w.id}`;
  if (w.pr_number) { await closePr(repo, w.pr_number).catch(() => null); }
  await commitFiles(repo, branch, [...extraFiles, { path: "ontwerp.html", content: r.html }], `Wijziging #${w.id}: ${str(antwoord.samenvatting, 70) || "aanpassing"}`, { createFrom: "main" });
  const pr = await openPr(repo, branch, `Wijziging #${w.id}: ${str(antwoord.samenvatting, 80)}`,
    `Verzoek van de klant:\n\n> ${w.description.replace(/\n/g, "\n> ")}\n\nVoorstel: ${antwoord.samenvatting}\n\nGoedkeuren gaat via Sitemaker HQ.`);
  await q(`UPDATE change_requests SET ai_status = 'voorstel', ai_summary = $2, ai_diff = $3::jsonb, ai_reason = '', branch = $4, pr_number = $5, pr_url = $6, preview_url = $7, ai_updated_at = NOW() WHERE id = $1`,
    [w.id, str(antwoord.samenvatting, 500), JSON.stringify(diff), branch, pr.number, pr.html_url || "", previewUrl(w.site_netlify_name, pr.number)]);
  return { voorstel: true, pr: pr.number };
}

// ---------------------------------------------------------------- beoordelen in HQ
export async function approveChange(changeId, user, { notify = true } = {}) {
  const w = await one("SELECT cr.*, c.site_repo FROM change_requests cr JOIN customers c ON c.id = cr.customer_id WHERE cr.id = $1", [changeId]);
  if (!w || w.ai_status !== "voorstel" || !w.pr_number) fail(400, "Er is geen voorstel om goed te keuren.");
  await mergePr(w.site_repo, w.pr_number, `Wijziging #${w.id} (goedgekeurd)`);
  await deleteBranch(w.site_repo, w.branch);
  await q("UPDATE change_requests SET ai_status = 'goedgekeurd', status = 'verwerkt', done_at = NOW(), staff_note = CASE WHEN staff_note = '' THEN $2 ELSE staff_note END, updated_at = NOW() WHERE id = $1",
    [w.id, w.ai_summary]);
  await audit(user.id, w.customer_id, "wijziging.goedgekeurd", { id: w.id, pr: w.pr_number });
  const mailed = notify ? await mailChangeStatus(w.id) : null;
  return { ok: true, mailed };
}

export async function redoChange(changeId, feedback, user) {
  const w = await one("SELECT cr.*, c.site_repo FROM change_requests cr JOIN customers c ON c.id = cr.customer_id WHERE cr.id = $1", [changeId]);
  if (!w || !w.site_repo) fail(400, "Deze klant heeft geen gekoppelde site.");
  if (w.ai_attempts >= 5) fail(400, "Al 5 voorstellen gemaakt. Handel deze wijziging zelf af.");
  if (w.pr_number) await closePr(w.site_repo, w.pr_number).catch(() => null);
  await q("UPDATE change_requests SET ai_status = 'wachtrij', ai_feedback = $2, ai_reason = '', status = 'in_behandeling', updated_at = NOW() WHERE id = $1", [w.id, str(feedback, 1500)]);
  await audit(user.id, w.customer_id, "wijziging.opnieuw", { id: w.id });
  await trigger(w.id);
  return { ok: true };
}

export async function manualChange(changeId, user) {
  const w = await one("SELECT cr.*, c.site_repo FROM change_requests cr JOIN customers c ON c.id = cr.customer_id WHERE cr.id = $1", [changeId]);
  if (!w) fail(404, "Wijziging niet gevonden.");
  if (w.pr_number && w.ai_status === "voorstel") await closePr(w.site_repo, w.pr_number).catch(() => null);
  await q("UPDATE change_requests SET ai_status = 'handmatig', ai_reason = CASE WHEN ai_reason = '' THEN 'Zelf afhandelen gekozen.' ELSE ai_reason END, updated_at = NOW() WHERE id = $1", [w.id]);
  return { ok: true };
}

// Voor de tick: blijven hangende wijzigingen opnieuw aanbieden.
export async function retryStuck() {
  const rows = await q(`SELECT id FROM change_requests WHERE (ai_status = 'wachtrij' AND ai_updated_at < NOW() - INTERVAL '5 minutes')
                        OR (ai_status = 'bezig' AND ai_updated_at < NOW() - INTERVAL '20 minutes')
                        OR (ai_status = 'fout' AND ai_attempts < 3 AND ai_updated_at < NOW() - INTERVAL '30 minutes') ORDER BY created_at LIMIT 3`);
  for (const r of rows) { await q("UPDATE change_requests SET ai_status = 'wachtrij', ai_updated_at = NOW() WHERE id = $1", [r.id]); await trigger(r.id); }
  return { retried: rows.length };
}

// Test van de koppelingen (HQ › Instellingen): maakt een test-repo + Netlify-project aan en ruimt ze direct weer op.
export async function koppelTest(user) {
  const { deleteRepo } = await import("./github.mjs");
  const { deleteSite } = await import("./netlifyapi.mjs");
  const stappen = [];
  const stap = (naam, ok, info = "") => { stappen.push({ naam, ok, info }); return ok; };
  if (!stap("GitHub-sleutels ingevuld", githubReady(), githubReady() ? `organisatie ${env("GITHUB_ORG")}` : "GITHUB_TOKEN of GITHUB_ORG ontbreekt")) return { ok: false, stappen };
  if (!stap("Netlify-sleutels ingevuld", netlifyReady(), netlifyReady() ? `team ${env("NETLIFY_ACCOUNT_SLUG")}` : "NETLIFY_API_TOKEN of NETLIFY_ACCOUNT_SLUG ontbreekt")) return { ok: false, stappen };
  const naam = `sitemaker-koppeltest-${crypto.randomBytes(3).toString("hex")}`;
  let repo = null, site = null;
  try {
    repo = await createRepo(naam, "Test van Sitemaker HQ (wordt meteen verwijderd)");
    stap("Repo aanmaken in GitHub", true, repo.full_name);
    await waitForMain(repo.full_name);
    await commitFiles(repo.full_name, "main", [{ path: "build.mjs", content: "import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','ok');" }], "Koppeltest");
    stap("Bestanden schrijven in de repo", true);
    site = await createSite({ name: naam, repoFullName: repo.full_name, repoId: repo.id });
    stap("Netlify-project aanmaken", true, site.name);
    stap("Netlify bouwt vanuit GitHub", site.linked, site.linked ? "gekoppeld via de GitHub-app" : "NETLIFY_GITHUB_INSTALLATION_ID ontbreekt: repo's moet je dan met de hand koppelen");
  } catch (e) {
    stap("Fout", false, e.message);
  } finally {
    if (site?.id) await deleteSite(site.id).then(() => stap("Test-project in Netlify opgeruimd", true)).catch((e) => stap("Test-project in Netlify opruimen", false, e.message));
    if (repo?.full_name) await deleteRepo(repo.full_name).then(() => stap("Test-repo in GitHub opgeruimd", true)).catch((e) => stap("Test-repo in GitHub opruimen", false, `${e.message} (verwijder ${repo.full_name} met de hand)`));
  }
  await audit(user.id, null, "koppelingen.test", { ok: stappen.every((x) => x.ok) });
  return { ok: stappen.every((x) => x.ok), stappen };
}
