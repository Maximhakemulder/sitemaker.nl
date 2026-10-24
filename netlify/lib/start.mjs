// Start in het portaal: (1) bedrijfsgegevens aanvullen, (2) akkoord en eerste betaling (met machtiging voor de maandtermijn),
// (3) informatie voor de website aanleveren. Daarna start de klok van 48 uur (2 werkdagen) voor de oplevering.
import crypto from "node:crypto";
import { q, one, OFFER, str, fail, audit, escH, publicBase, getSettings, dayKey, addMonths, portalUrl } from "./core.mjs";
import { putFile, getFile, deleteFile, fileResponse, ALLOWED_UPLOADS, MAX_UPLOAD, sniffOk, safeName } from "./files.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";
import { mollieReady, startFirstPayment } from "./mollie.mjs";
import { priceParts } from "./billing.mjs";
import { THEMAS } from "./sites.mjs";

export const MAX_INTAKE_FILES = 20;

// Waar staat deze klant in de start? null = geen startflow (bestaande klant of door HQ zelf geregeld).
export function startStage(c) {
  if (!c.onboarding) return null;
  if (!c.details_at) return "gegevens";
  if (!c.started_at) return "betalen";
  if (!c.intake_at) return "informatie";
  if (c.site_status === "in_aanbouw") return "bouwen";
  return "klaar";
}

// Twee werkdagen na het aanleveren (za/zo tellen niet mee).
export function deliveryDue(intakeAt) {
  if (!intakeAt) return null;
  const d = new Date(intakeAt);
  let left = 2;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" })).getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString();
}

const splitAddress = (a) => {
  const [straat = "", rest = ""] = String(a || "").split("\n");
  const m = rest.match(/^\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/);
  return { street: straat.trim(), postcode: m ? m[1].toUpperCase() : "", city: m ? m[2].trim() : rest.trim() };
};

const fileOut = (f) => ({ id: f.id, kind: f.kind, name: f.name, type: f.type, size: f.size, createdAt: f.created_at });

export async function startState(c) {
  const stage = startStage(c);
  if (!stage) return null;
  const s = await getSettings();
  const build = priceParts(c.build_cents, s.billing), monthly = priceParts(c.monthly_cents, s.billing);
  const files = stage === "informatie" || stage === "bouwen" ? await q("SELECT * FROM intake_files WHERE customer_id = $1 ORDER BY id", [c.id]) : [];
  return {
    stage,
    details: { company: c.company, contactName: c.contact_name, phone: c.phone, kvk: c.kvk, vatNumber: c.vat_number, ...splitAddress(c.address) },
    price: { buildCents: build?.gross ?? c.build_cents, monthlyCents: monthly?.gross ?? c.monthly_cents, firstMonthly: addMonths(dayKey(), 1) },
    payOnline: mollieReady(),
    paymentPending: c.billing_status === "wacht_op_betaling",
    termsAt: c.terms_at,
    intake: c.intake || {},
    intakeAt: c.intake_at,
    dueAt: deliveryDue(c.intake_at),
    files: files.map(fileOut),
    themas: THEMAS,
    maxFiles: MAX_INTAKE_FILES,
  };
}

async function own(user) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
  if (!c) fail(404, "Klant niet gevonden.");
  return c;
}

// ---------------------------------------------------------------- stap 1: gegevens
export async function saveDetails(user, b) {
  const c = await own(user);
  const f = {
    company: str(b.company, 200), contactName: str(b.contactName, 200), phone: str(b.phone, 40),
    street: str(b.street, 200), postcode: str(b.postcode, 10).toUpperCase().replace(/^(\d{4})\s*([A-Z]{2})$/, "$1 $2"), city: str(b.city, 100),
    kvk: str(b.kvk, 20).replace(/\s+/g, ""), vatNumber: str(b.vatNumber, 30).replace(/\s+/g, "").toUpperCase(),
  };
  const fouten = [];
  if (f.company.length < 2) fouten.push(["company", "Vul de naam van je bedrijf in."]);
  if (f.contactName.length < 2) fouten.push(["contactName", "Vul de naam van de contactpersoon in."]);
  if (!/^[+0-9 ()-]{8,}$/.test(f.phone)) fouten.push(["phone", "Vul een telefoonnummer in."]);
  if (f.street.length < 3) fouten.push(["street", "Vul straat en huisnummer in."]);
  if (!/^\d{4} [A-Z]{2}$/.test(f.postcode)) fouten.push(["postcode", "Vul een postcode in zoals 1234 AB."]);
  if (f.city.length < 2) fouten.push(["city", "Vul de plaats in."]);
  if (!/^\d{8}$/.test(f.kvk)) fouten.push(["kvk", "Een KvK-nummer heeft 8 cijfers."]);
  if (f.vatNumber && !/^NL\d{9}B\d{2}$/.test(f.vatNumber)) fouten.push(["vatNumber", "Een btw-nummer ziet eruit als NL123456789B01. Laat leeg als je het niet weet."]);
  if (fouten.length) fail(400, fouten[0][1], { field: fouten[0][0], errors: Object.fromEntries(fouten) });
  await q(`UPDATE customers SET company = $2, contact_name = $3, phone = $4, address = $5, kvk = $6, vat_number = $7,
           details_at = COALESCE(details_at, NOW()), updated_at = NOW() WHERE id = $1`,
    [c.id, f.company, f.contactName, f.phone, `${f.street}\n${f.postcode} ${f.city}`, f.kvk, f.vatNumber]);
  await audit(user.id, c.id, "start.gegevens", {});
  return { ok: true };
}

// ---------------------------------------------------------------- stap 2: akkoord en betalen
export async function startPayment(user, b, ip) {
  const c = await own(user);
  if (!c.onboarding) fail(400, "Je abonnement wordt door Sitemaker gestart.");
  if (!c.details_at) fail(400, "Vul eerst je bedrijfsgegevens in.");
  if (c.started_at) fail(400, "Je eerste betaling is al binnen.");
  if (b.akkoord !== true) fail(400, "Vink aan dat je akkoord gaat met de voorwaarden en de automatische afschrijving.", { field: "akkoord" });
  if (!mollieReady()) fail(503, "Online betalen staat nog niet aan. We nemen contact met je op om je abonnement te starten.");
  await q("UPDATE customers SET terms_at = NOW(), terms_ip = $2, terms_by = $3, updated_at = NOW() WHERE id = $1", [c.id, str(ip, 60), user.email]);
  await audit(user.id, c.id, "start.akkoord", { ip: str(ip, 60), viaHq: !!user.viaHq });
  const r = await startFirstPayment(c.id, { userId: user.id });
  return { checkoutUrl: r.checkoutUrl };
}

// Door de Mollie-webhook aangeroepen zodra de eerste betaling binnen is.
export async function markStarted(customerId) {
  const c = await one("UPDATE customers SET started_at = NOW(), updated_at = NOW() WHERE id = $1 AND started_at IS NULL RETURNING *", [customerId]);
  if (!c) return;
  await audit(null, c.id, "start.betaald", {});
  if (!c.onboarding) return;
  const u = await one("SELECT email FROM users WHERE customer_id = $1 AND active ORDER BY id LIMIT 1", [c.id]);
  if (!u) return;
  const link = `${portalUrl()}`;
  await sendMail({
    to: u.email, kind: "start-betaald", ref: `customer:${c.id}`, subject: "Je betaling is binnen: lever nu je informatie aan",
    text: `Beste ${c.contact_name || c.company},\n\nBedankt, je betaling is binnen en je abonnement is gestart.\n\nVolgende stap: lever in je portaal de informatie voor je website aan (teksten, logo en foto's): ${link}\n\nZodra we alles hebben, staat je website binnen ${OFFER.deliveryText} online.\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Je betaling is binnen",
      intro: [`Beste ${escH(c.contact_name || c.company)},`, "Bedankt, je abonnement is gestart.", "Volgende stap: lever in je portaal de informatie voor je website aan: wat je doet, je diensten, je logo en foto's."],
      button: { label: "Informatie aanleveren", href: link },
      after: [`Zodra we alles hebben, staat je website binnen <b>${OFFER.deliveryText}</b> online.`],
    }),
  }).catch(() => {});
}

// ---------------------------------------------------------------- stap 3: informatie aanleveren
const INTAKE_FIELDS = {
  omschrijving: 3000, diensten: 3000, onderscheid: 2000, werkgebied: 300, doelgroep: 1000, openingstijden: 1000,
  sitePhone: 40, siteEmail: 200, siteAddress: 300, socials: 1000, domein: 200, huidigeSite: 300, stijl: 20, kleuren: 300, voorbeelden: 1000, opmerkingen: 3000,
};

export async function saveIntake(user, b) {
  const c = await own(user);
  if (!c.started_at) fail(400, "Rond eerst de betaling af. Daarna lever je hier je informatie aan.");
  if (c.intake_at) fail(400, "Je informatie is al verstuurd. Wil je nog iets aanvullen? Geef het door als wijziging of mail ons.");
  const intake = {};
  for (const [k, max] of Object.entries(INTAKE_FIELDS)) intake[k] = str(b[k], max);
  if (intake.stijl && intake.stijl !== "kies" && !THEMAS[intake.stijl]) intake.stijl = "";
  if (intake.siteEmail && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(intake.siteEmail)) fail(400, "Dit e-mailadres klopt niet.", { field: "siteEmail" });
  const verstuur = b.verstuur === true;
  if (verstuur) {
    const fouten = [];
    if (intake.omschrijving.length < 20) fouten.push(["omschrijving", "Vertel in een paar zinnen wat je bedrijf doet (minimaal 20 tekens)."]);
    if (intake.diensten.length < 3) fouten.push(["diensten", "Noem je belangrijkste diensten of producten."]);
    if (!intake.sitePhone && !intake.siteEmail) fouten.push(["sitePhone", "Vul minstens een telefoonnummer of e-mailadres in voor op je website."]);
    if (fouten.length) fail(400, fouten[0][1], { field: fouten[0][0], errors: Object.fromEntries(fouten) });
  }
  await q("UPDATE customers SET intake = $2::jsonb, intake_at = $3, updated_at = NOW() WHERE id = $1", [c.id, JSON.stringify(intake), verstuur ? new Date().toISOString() : null]);
  if (!verstuur) return { ok: true, saved: true };

  const due = deliveryDue(new Date());
  await audit(user.id, c.id, "start.informatie", {});
  const files = await q("SELECT COUNT(*)::int AS n FROM intake_files WHERE customer_id = $1", [c.id]);
  const dueTxt = new Date(due).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  await Promise.allSettled([
    notifyStaff(`Informatie binnen: ${c.company} (bouwen)`, [`${c.company} heeft de informatie voor de website aangeleverd (${files[0].n} bestanden).`, `Website online uiterlijk ${dueTxt}.`], `/hq/#klant/${c.id}`),
    sendMail({
      to: user.email, kind: "start-informatie", ref: `customer:${c.id}`, subject: "We hebben je informatie: we gaan bouwen",
      text: `Bedankt! We hebben je informatie ontvangen en gaan je website bouwen. Binnen ${OFFER.deliveryText} staat hij online; je krijgt dan een mail.\n\nJe portaal: ${portalUrl()}`,
      html: brandHtml({ title: "We gaan bouwen", intro: ["Bedankt! We hebben je informatie ontvangen.", `Binnen <b>${OFFER.deliveryText}</b> staat je website online. Je krijgt dan een mail.`], button: { label: "Naar je portaal", href: `${portalUrl()}` } }),
    }),
  ]);
  return { ok: true, sent: true, dueAt: due };
}

export async function addIntakeFile(user, form) {
  const c = await own(user);
  if (!c.started_at) fail(400, "Rond eerst de betaling af.");
  if (c.intake_at) fail(400, "Je informatie is al verstuurd.");
  const n = (await one("SELECT COUNT(*)::int AS n FROM intake_files WHERE customer_id = $1", [c.id])).n;
  if (n >= MAX_INTAKE_FILES) fail(400, `Je kunt maximaal ${MAX_INTAKE_FILES} bestanden toevoegen. Heb je er meer? Stuur ons een link (bijv. WeTransfer) bij Opmerkingen.`);
  const file = form.get("file");
  if (!file || typeof file !== "object" || !file.size) fail(400, "Kies een bestand.", { field: "file" });
  if (file.size > MAX_UPLOAD) fail(400, `${safeName(file.name)} is groter dan 4 MB. Verklein de foto of stuur een link mee bij Opmerkingen.`);
  const type = String(file.type || "").toLowerCase();
  if (!ALLOWED_UPLOADS[type]) fail(400, `${safeName(file.name)}: dit bestandstype kunnen we niet aannemen. Gebruik JPG, PNG, WebP, GIF, SVG, PDF of Word.`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(buf, type)) fail(400, `${safeName(file.name)} lijkt beschadigd of is niet wat de extensie zegt.`);
  const kind = ["logo", "foto", "overig"].includes(form.get("kind")) ? form.get("kind") : "foto";
  const key = `intake/${c.id}/${crypto.randomUUID()}`;
  await putFile(key, buf, { type, name: safeName(file.name) });
  const row = await one("INSERT INTO intake_files (customer_id, kind, key, name, type, size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [c.id, kind, key, safeName(file.name), type, buf.length]);
  return { file: fileOut(row) };
}

export async function deleteIntakeFile(user, fileId) {
  const c = await own(user);
  if (c.intake_at) fail(400, "Je informatie is al verstuurd.");
  const f = await one("DELETE FROM intake_files WHERE id = $1 AND customer_id = $2 RETURNING *", [fileId, c.id]);
  if (!f) fail(404, "Bestand niet gevonden.");
  await deleteFile(f.key).catch(() => {});
  return { ok: true };
}

// Download: klant alleen eigen bestanden; medewerkers alles.
export async function intakeFile(user, fileId, staff = false) {
  const f = await one("SELECT * FROM intake_files WHERE id = $1", [fileId]);
  if (!f || (!staff && f.customer_id !== user.customer_id)) fail(404, "Bestand niet gevonden.");
  const data = await getFile(f.key);
  if (!data) fail(404, "Het bestand is niet meer beschikbaar.");
  return fileResponse(data.buf || data, { name: f.name, type: f.type, inline: false });
}

// Voor HQ.
export async function hqStart(c) {
  const stage = startStage(c);
  if (!stage) return null;
  const files = await q("SELECT * FROM intake_files WHERE customer_id = $1 ORDER BY id", [c.id]);
  return { stage, detailsAt: c.details_at, termsAt: c.terms_at, termsBy: c.terms_by, startedAt: c.started_at, intakeAt: c.intake_at, dueAt: deliveryDue(c.intake_at), intake: c.intake || {}, files: files.map(fileOut) };
}
