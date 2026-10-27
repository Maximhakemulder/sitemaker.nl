// Sitemaker HQ: alles wat medewerkers beheren. Rollen: medewerker en admin (admin mag ook instellingen, team en abonnementen opzeggen).
import { q, one, tx, OFFER, getSettings, saveSetting, DEFAULT_SETTINGS, str, cleanEmail, EMAIL_RE, normUrl, monthKey, dayKey, euro, escH, publicBase, fail, audit, env, portalUrl } from "./core.mjs";
import { publicConcept, queueConcept, setTheme, deleteConcept, rejectConcept } from "./concepts.mjs";
import { startStage, deliveryDue, hqStart } from "./start.mjs";
import { publicCustomer, publicChange, publicInvoice, changeUsage, mailChangeStatus, STATUS_LABEL, freeSlot } from "./portal.mjs";
import { createInvoice, generateInvoicePdf, mailInvoice, partsFromGross, priceParts, companyComplete, vatModeSet } from "./billing.mjs";
import { putFile, sniffOk } from "./files.mjs";
import { sendMail, brandHtml, mailReady } from "./mail.mjs";
import { betaalReady as mollieReady, betaalMode as mollieMode, startFirstPayment, payInvoiceLink, cancelSubscription, subscriptionInfo, mailPaymentLink, startIncasso, ibanOk, ibanNorm } from "./betalen.mjs";
import { checkNow } from "./uptime.mjs";
import { THEMAS, autoReady, provisionSite, linkSite, approveChange, redoChange, manualChange, queueChange } from "./sites.mjs";
import { githubReady } from "./github.mjs";
import { netlifyReady, netlifyLinkReady } from "./netlifyapi.mjs";
import { aiReady as claudeReady } from "./ai.mjs";
import { addLead, parseCsv, mailPreview, researchLead, runScout, scoutReady, aiReady, LEAD_STATUSES, unsubscribe, LEAD_SELECT } from "./b2b.mjs";

const SITE_STATUSES = ["in_aanbouw", "live", "gepauzeerd", "opgezegd"];
const BILLING_STATUSES = ["geen", "wacht_op_betaling", "actief", "betaling_mislukt", "gepauzeerd", "opgezegd", "handmatig"];
const pick = (v, list, d) => (list.includes(v) ? v : d);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);

// ---------------------------------------------------------------- overzicht
export async function overview() {
  const month = monthKey();
  const [counts] = await q(`SELECT
      (SELECT COUNT(*)::int FROM customers WHERE site_status <> 'opgezegd') AS klanten,
      (SELECT COUNT(*)::int FROM customers WHERE site_status = 'live') AS live,
      (SELECT COUNT(*)::int FROM customers WHERE site_status = 'in_aanbouw') AS in_aanbouw,
      (SELECT COUNT(*)::int FROM customers WHERE billing_status = 'actief') AS abonnementen,
      (SELECT COALESCE(SUM(monthly_cents),0)::int FROM customers WHERE billing_status IN ('actief','handmatig')) AS mrr_basis,
      (SELECT COUNT(*)::int FROM customers WHERE billing_status = 'betaling_mislukt') AS betaling_mislukt,
      (SELECT COUNT(*)::int FROM customers WHERE site_status = 'live' AND check_ok = FALSE AND check_fails >= 2) AS offline,
      (SELECT COUNT(*)::int FROM change_requests WHERE status IN ('ontvangen','in_behandeling')) AS open_wijzigingen,
      (SELECT COUNT(*)::int FROM change_requests WHERE status IN ('ontvangen','in_behandeling') AND created_at < NOW() - INTERVAL '${OFFER.changeHours} hours') AS te_laat,
      (SELECT COUNT(*)::int FROM change_requests WHERE month = $1) AS wijzigingen_maand,
      (SELECT COUNT(*)::int FROM change_requests WHERE ai_status = 'voorstel') AS voorstellen,
      (SELECT COUNT(*)::int FROM change_requests WHERE ai_status = 'handmatig' AND status IN ('ontvangen','in_behandeling')) AS handmatig,
      (SELECT COUNT(*)::int FROM appointments WHERE status = 'nieuw') AS nieuwe_aanvragen,
      (SELECT COUNT(*)::int FROM concepts WHERE status = 'klaar') AS concepten_klaar,
      (SELECT COUNT(*)::int FROM concepts c JOIN leads l ON l.id = c.lead_id WHERE c.status = 'klaar' AND l.status = 'nieuw') AS concepten_beoordelen,
      (SELECT COUNT(*)::int FROM concepts WHERE first_view_at > NOW() - INTERVAL '7 days') AS concepten_bekeken,
      (SELECT COUNT(*)::int FROM customers WHERE onboarding AND started_at IS NOT NULL AND site_status = 'in_aanbouw') AS te_bouwen,
      (SELECT COUNT(*)::int FROM invoices WHERE status = 'open') AS open_facturen,
      (SELECT COALESCE(SUM(amount_cents),0)::int FROM invoices WHERE status = 'open') AS open_bedrag,
      (SELECT COALESCE(SUM(amount_cents),0)::int FROM invoices WHERE status = 'betaald' AND to_char(paid_at AT TIME ZONE 'Europe/Amsterdam','YYYY-MM') = $1) AS ontvangen_maand,
      (SELECT COUNT(*)::int FROM leads WHERE status = 'nieuw') AS leads_klaar,
      (SELECT COUNT(*)::int FROM leads WHERE status = 'reactie') AS leads_reactie,
      (SELECT COUNT(*)::int FROM tickets WHERE status = 'open') AS klantvragen,
      (SELECT COUNT(*)::int FROM domains WHERE status IN ('verhuizen','registreren','probleem')) AS domeinen_werk,
      (SELECT COUNT(*)::int FROM opdrachten WHERE status IN ('controle','fout')) AS opdrachten_controle,
      (SELECT COUNT(*)::int FROM reviews WHERE source = 'portaal' AND NOT published) AS reviews_nieuw,
      (SELECT COUNT(*)::int FROM customers WHERE opzeg_status = 'aangevraagd') AS opzeggingen,
      (SELECT COUNT(*)::int FROM leads WHERE status IN ('verstuurd','opgevolgd') AND sent_at > NOW() - INTERVAL '30 days') AS leads_verstuurd_30d`, [month]);
  const todo = await q(`SELECT cr.*, c.company FROM change_requests cr JOIN customers c ON c.id = cr.customer_id
                        WHERE cr.status IN ('ontvangen','in_behandeling') ORDER BY cr.created_at LIMIT 20`);
  const appts = await q(`SELECT * FROM appointments WHERE status <> 'geannuleerd' AND ((starts_at >= NOW() - INTERVAL '30 minutes' AND starts_at < NOW() + INTERVAL '7 days') OR (starts_at IS NULL AND status = 'nieuw'))
                         ORDER BY starts_at IS NULL, starts_at, created_at DESC LIMIT 10`);
  const starters = await q("SELECT * FROM customers WHERE onboarding AND site_status = 'in_aanbouw' ORDER BY intake_at IS NULL, intake_at, started_at IS NULL, started_at, created_at DESC LIMIT 20");
  const s = await getSettings();
  return {
    counts, month,
    todo: todo.map((r) => ({ ...hqChange(r), company: r.company, customerId: r.customer_id })),
    appointments: appts.map(publicAppointment),
    starters: starters.map((c) => ({ id: c.id, company: c.company, email: c.email, stage: startStage(c), createdAt: c.created_at, startedAt: c.started_at, intakeAt: c.intake_at, dueAt: deliveryDue(c.intake_at) })),
    setup: setupStatus(s),
  };
}

export function setupStatus(s) {
  return [
    { key: "mail", ok: mailReady(), label: "Mail (inlogcodes, meldingen, B2B)", hint: "Zet MAIL_USER en MAIL_PASSWORD (en eventueel MAIL_FROM) in Netlify." },
    { key: "admins", ok: !!env("ADMIN_EMAILS"), label: "Beheerders", hint: "Zet ADMIN_EMAILS (komma-gescheiden) in Netlify." },
    { key: "secret", ok: !!env("AUTH_SECRET"), label: "Beveiligingssleutel", hint: "Zet AUTH_SECRET (lange willekeurige tekst) in Netlify." },
    { key: "company", ok: companyComplete(s.company), label: "Bedrijfsgegevens voor facturen", hint: "Vul ze in bij Instellingen." },
    { key: "mollie", ok: mollieReady(), label: `Pay.nl (online betalen en incasso)${mollieMode() === "test" ? " · testmodus" : ""}`, hint: "Zet PAYNL_SERVICE_ID, PAYNL_SERVICE_SECRET, PAYNL_AT_CODE en PAYNL_TOKEN in Netlify." },
    { key: "github", ok: githubReady(), label: "GitHub (repo per klant)", hint: "Zet GITHUB_TOKEN en GITHUB_ORG in Netlify." },
    { key: "netlify", ok: netlifyLinkReady(), label: "Netlify-projecten per klant", hint: "Zet NETLIFY_API_TOKEN, NETLIFY_ACCOUNT_SLUG en NETLIFY_GITHUB_INSTALLATION_ID." },
    { key: "claude", ok: claudeReady(), label: "Claude verwerkt wijzigingen", hint: "Zet de Netlify AI Gateway aan (of ANTHROPIC_API_KEY)." },
    { key: "scout", ok: scoutReady(), label: "Outscraper (B2B-scout)", hint: "Optioneel: OUTSCRAPER_API_KEY." },
    { key: "stock", ok: !!(env("PEXELS_API_KEY") || env("PIXABAY_API_KEY")), label: "Sfeerfoto's voor concepten (Pexels of Pixabay)", hint: "Optioneel: PEXELS_API_KEY (pexels.com/api) of PIXABAY_API_KEY (pixabay.com/api/docs), allebei gratis. Vult concepten aan als hun site te weinig foto's heeft." },
    { key: "ai", ok: aiReady(), label: "AI-openingszinnen (B2B)", hint: "Optioneel: zet de Netlify AI Gateway aan." },
  ];
}

// ---------------------------------------------------------------- klanten
export async function listCustomers() {
  const rows = await q(`SELECT c.*,
      (SELECT COUNT(*)::int FROM change_requests cr WHERE cr.customer_id = c.id AND cr.month = $1 AND cr.counts) AS used,
      (SELECT COUNT(*)::int FROM change_requests cr WHERE cr.customer_id = c.id AND cr.status IN ('ontvangen','in_behandeling')) AS open_changes,
      (SELECT COUNT(*)::int FROM invoices i WHERE i.customer_id = c.id AND i.status = 'open') AS open_invoices
    FROM customers c ORDER BY c.site_status = 'opgezegd', c.company`, [monthKey()]);
  const groep = Object.fromEntries((await q(`SELECT a.customer_id, COUNT(DISTINCT b.customer_id)::int AS n FROM user_sites a JOIN user_sites b ON b.user_id = a.user_id GROUP BY a.customer_id`)).map((r) => [r.customer_id, r.n]));
  return rows.map((c) => ({ ...adminCustomer(c), usedThisMonth: c.used, openChanges: c.open_changes, openInvoices: c.open_invoices, websites: groep[c.id] || 1 }));
}

function adminCustomer(c) {
  return {
    startStage: startStage(c), intakeAt: c.intake_at, startDue: deliveryDue(c.intake_at),
    ...publicCustomer(c), phone: c.phone, address: c.address, kvk: c.kvk, vatNumber: c.vat_number, notes: c.notes,
    site: { repo: c.site_repo, netlifyName: c.site_netlify_name, theme: c.site_theme, previewBase: c.site_netlify_name ? `https://${c.site_netlify_name}.netlify.app` : "" },
    mollieCustomerId: c.mollie_customer_id, mollieSubscriptionId: c.mollie_subscription_id, iban: c.iban || "", ibanNaam: c.iban_naam || "",
    check: c.check_at ? { at: c.check_at, ok: c.check_ok, code: c.check_code, ms: c.check_ms, fails: c.check_fails, error: c.check_error } : null,
    createdAt: c.created_at,
  };
}

export async function getCustomer(id) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [id]);
  if (!c) fail(404, "Klant niet gevonden.");
  const [users, changes, invoices, payments, log, usage] = await Promise.all([
    q("SELECT id, email, name, active, last_login_at, created_at FROM users u WHERE u.customer_id = $1 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $1) ORDER BY id", [id]),
    q("SELECT * FROM change_requests WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100", [id]),
    q("SELECT * FROM invoices WHERE customer_id = $1 ORDER BY invoice_date DESC, id DESC", [id]),
    q("SELECT * FROM payments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50", [id]),
    q(`SELECT a.action, a.detail, a.created_at, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.customer_id = $1 ORDER BY a.created_at DESC LIMIT 40`, [id]),
    changeUsage(id),
  ]);
  return {
    customer: adminCustomer(c), usage, start: await hqStart(c),
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, active: u.active, lastLoginAt: u.last_login_at })),
    changes: changes.map(hqChange), invoices: invoices.map(publicInvoice),
    payments: payments.map(publicPayment), log,
    subscription: await subscriptionInfo(c),
    domein: (await (await import("./domains.mjs")).listDomains()).find((x) => x.customerId === c.id) || null,
    websites: await (await import("./websites.mjs")).siblings(c.id),
    opzegging: c.opzeg_status ? { status: c.opzeg_status, at: c.opzeg_at, einde: c.opzeg_einde, reden: c.opzeg_reden, toelichting: c.opzeg_toelichting } : null,
  };
}

const publicPayment = (p) => ({ id: p.id, molliePaymentId: p.mollie_payment_id, kind: p.kind, amountCents: p.amount_cents, status: p.status, method: p.method, checkoutUrl: p.status === "open" ? p.checkout_url : null, description: p.description, paidAt: p.paid_at, createdAt: p.created_at, invoiceId: p.invoice_id });

function customerFields(b) {
  const company = str(b.company, 200);
  if (!company) fail(400, "Vul de bedrijfsnaam in.", { field: "company" });
  const email = cleanEmail(b.email);
  if (email && !EMAIL_RE.test(email)) fail(400, "Dit e-mailadres klopt niet.", { field: "email" });
  const siteUrl = b.siteUrl ? normUrl(b.siteUrl) : "";
  if (b.siteUrl && !siteUrl) fail(400, "Dit website-adres klopt niet.", { field: "siteUrl" });
  return {
    company, email, siteUrl,
    contact_name: str(b.contactName, 200), phone: str(b.phone, 40), address: str(b.address, 400), kvk: str(b.kvk, 20), vat_number: str(b.vatNumber, 30),
    site_status: pick(b.siteStatus, SITE_STATUSES, "in_aanbouw"), delivered_at: dateOrNull(b.deliveredAt), notes: str(b.notes, 4000),
  };
}

export async function createCustomer(b, user) {
  const f = customerFields(b);
  if (!f.email) fail(400, "Vul het e-mailadres van de klant in; daarmee logt de klant in op het portaal.", { field: "email" });
  const exists = await one("SELECT role FROM users WHERE email = $1", [f.email]);
  if (exists) fail(409, exists.role === "klant" ? "Dit e-mailadres hoort al bij een andere klant." : "Dit e-mailadres is van een medewerker.", { field: "email" });
  const c = await tx(async (t) => {
    const c = await t.one(`INSERT INTO customers (company, contact_name, email, phone, address, kvk, vat_number, site_url, site_status, delivered_at, notes, appointment_id, lead_id, onboarding)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [f.company, f.contact_name, f.email, f.phone, f.address, f.kvk, f.vat_number, f.siteUrl, f.site_status, f.delivered_at, f.notes, b.appointmentId || null,
        b.leadId || (b.appointmentId ? (await t.one("SELECT lead_id FROM appointments WHERE id = $1", [b.appointmentId]))?.lead_id : null) || null, b.onboarding === true]);
    const nu = await t.one("INSERT INTO users (email, name, role, customer_id) VALUES ($1,$2,'klant',$3) RETURNING id", [f.email, f.contact_name, c.id]);
    await t.q("INSERT INTO user_sites (user_id, customer_id) VALUES ($1,$2)", [nu.id, c.id]);
    if (b.appointmentId) await t.q("UPDATE appointments SET status = 'klant', customer_id = $1, updated_at = NOW() WHERE id = $2", [c.id, b.appointmentId]);
    if (b.leadId) await t.q("UPDATE leads SET status = 'klant', customer_id = $1, updated_at = NOW() WHERE id = $2", [c.id, b.leadId]);
    return c;
  });
  await audit(user.id, c.id, "klant.aangemaakt", { company: c.company });
  const out = { customer: adminCustomer(c) };
  if (b.sendWelcome) out.welcome = await sendWelcome(c.id, user);
  return out;
}

export async function updateCustomer(id, b, user) {
  const f = customerFields(b);
  const c = await one(`UPDATE customers SET company=$2, contact_name=$3, email=$4, phone=$5, address=$6, kvk=$7, vat_number=$8, site_url=$9, site_status=$10, delivered_at=$11, notes=$12,
                       billing_status = COALESCE($13, billing_status), check_fails = CASE WHEN site_url <> $9 THEN 0 ELSE check_fails END, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, f.company, f.contact_name, f.email, f.phone, f.address, f.kvk, f.vat_number, f.siteUrl, f.site_status, f.delivered_at, f.notes,
      b.billingStatus && ["geen", "handmatig", "gepauzeerd"].includes(b.billingStatus) ? b.billingStatus : null]);
  if (!c) fail(404, "Klant niet gevonden.");
  await audit(user.id, id, "klant.bijgewerkt", {});
  return { customer: adminCustomer(c) };
}

// Startflow in het portaal aan/uit zetten (bijv. voor een klant die al via HQ is gestart).
export async function setOnboarding(customerId, b, user) {
  const c = await one("UPDATE customers SET onboarding = $2, updated_at = NOW() WHERE id = $1 RETURNING id", [customerId, b.onboarding === true]);
  if (!c) fail(404, "Klant niet gevonden.");
  await audit(user.id, customerId, b.onboarding ? "start.aan" : "start.uit", {});
  return { ok: true };
}

export async function addPortalUser(customerId, b, user) {
  const email = cleanEmail(b.email);
  if (!EMAIL_RE.test(email)) fail(400, "Dit e-mailadres klopt niet.");
  const c = await one("SELECT id FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  const exists = await one("SELECT id, customer_id, role FROM users WHERE email = $1", [email]);
  if (exists && exists.role !== "klant") fail(409, "Dit e-mailadres is van een medewerker.");
  if (exists && (exists.customer_id === customerId || await one("SELECT 1 FROM user_sites WHERE user_id = $1 AND customer_id = $2", [exists.id, customerId]))) fail(409, "Deze gebruiker heeft al toegang.");
  // Bestaande klantgebruiker: krijgt deze website erbij (meerdere websites onder één inlog).
  const uid = exists ? exists.id : (await one("INSERT INTO users (email, name, role, customer_id) VALUES ($1,$2,'klant',$3) RETURNING id", [email, str(b.name, 200), customerId])).id;
  await q("INSERT INTO user_sites (user_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [uid, customerId]);
  await audit(user.id, customerId, "portaal.gebruiker_toegevoegd", { email });
  return { ok: true };
}
export async function setPortalUser(customerId, userId, b, user) {
  const u = await one("UPDATE users u SET active = $3 WHERE id = $1 AND (customer_id = $2 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $2)) RETURNING email", [userId, customerId, !!b.active]);
  if (!u) fail(404, "Gebruiker niet gevonden.");
  if (!b.active) await q("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await audit(user.id, customerId, b.active ? "portaal.gebruiker_actief" : "portaal.gebruiker_geblokkeerd", { email: u.email });
  return { ok: true };
}

// Portaalgebruiker helemaal verwijderen. Heeft hij ook andere websites (andere klantregels), dan alleen loskoppelen van deze klant.
export async function deletePortalUser(customerId, userId, user) {
  const u = await one("SELECT u.* FROM users u WHERE u.id = $1 AND u.role = 'klant' AND (u.customer_id = $2 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $2))", [userId, customerId]);
  if (!u) fail(404, "Gebruiker niet gevonden.");
  const andere = (await q("SELECT customer_id FROM user_sites WHERE user_id = $1 AND customer_id <> $2", [userId, customerId])).map((r) => r.customer_id);
  if (u.customer_id && u.customer_id !== customerId && !andere.includes(u.customer_id)) andere.push(u.customer_id);
  if (andere.length) {
    await q("DELETE FROM user_sites WHERE user_id = $1 AND customer_id = $2", [userId, customerId]);
    if (u.customer_id === customerId) await q("UPDATE users SET customer_id = $2 WHERE id = $1", [userId, andere[0]]);
    await q("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await audit(user.id, customerId, "portaal.gebruiker_verwijderd", { email: u.email, alleenLosgekoppeld: true });
    return { ok: true, losgekoppeld: true };
  }
  await q("DELETE FROM users WHERE id = $1", [userId]);
  await q("DELETE FROM login_codes WHERE email = $1", [u.email]);
  await audit(user.id, customerId, "portaal.gebruiker_verwijderd", { email: u.email });
  return { ok: true };
}

export async function sendWelcome(customerId, user) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  const u = await one("SELECT u.email FROM users u WHERE u.active AND u.role = 'klant' AND (u.customer_id = $1 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $1)) ORDER BY u.customer_id = $1 DESC, u.id LIMIT 1", [customerId]);
  if (!u) fail(400, "Deze klant heeft geen actieve portaalgebruiker.");
  const link = `${portalUrl()}`;
  const hulp = (await getSettings()).company?.email || env("MAIL_FROM") || env("MAIL_USER") || "hallo@sitemaker.nl";
  const hulpRegel = `Kom je er niet uit? Mail ons op ${hulp}, dan helpen we je verder.`;
  const st = startStage(c);
  const stap2 = mollieReady() ? `Ga akkoord en betaal de bouw (${euro(c.build_cents)}); daarna ${euro(c.monthly_cents)} per maand automatisch` : `Ga akkoord; je krijgt een factuur voor de bouw (${euro(c.build_cents)}) en daarna elke maand een factuur van ${euro(c.monthly_cents)}`;
  const res = st && st !== "klaar" && st !== "bouwen" ? await sendMail({
    to: u.email, kind: "welkom", ref: `customer:${c.id}`, subject: "Welkom bij Sitemaker: start je website in je portaal",
    text: `Beste ${c.contact_name || c.company},\n\nLeuk dat je met Sitemaker aan de slag gaat! In je klantenportaal start je je website in drie korte stappen: ${link}\n\n1. Vul je bedrijfsgegevens aan\n2. ${stap2}\n3. Lever de informatie voor je website aan (teksten, logo en foto's)\n\nDaarna staat je website binnen ${OFFER.deliveryText} online.\n\nInloggen gaat zonder wachtwoord: vul ${u.email} in en je krijgt een code per mail.\n\n${hulpRegel}\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Welkom bij Sitemaker",
      intro: [`Beste ${escH(c.contact_name || c.company)},`, "Leuk dat je met Sitemaker aan de slag gaat! In je klantenportaal start je je website in drie korte stappen:",
        `1. Vul je bedrijfsgegevens aan<br>2. ${stap2}<br>3. Lever de informatie voor je website aan`],
      button: { label: "Start in je portaal", href: link },
      after: [`Daarna staat je website binnen <b>${OFFER.deliveryText}</b> online.`, `Inloggen gaat zonder wachtwoord: vul <b>${escH(u.email)}</b> in en je krijgt een code per mail.`, `Kom je er niet uit? Mail ons op <a href="mailto:${escH(hulp)}">${escH(hulp)}</a>, dan helpen we je verder.`],
    }),
  }) : await sendMail({
    to: u.email, kind: "welkom", ref: `customer:${c.id}`, subject: "Welkom bij Sitemaker: je klantenportaal staat klaar",
    text: `Beste ${c.contact_name || c.company},\n\nWelkom bij Sitemaker! Je klantenportaal staat klaar: ${link}\n\nInloggen gaat zonder wachtwoord: vul ${u.email} in en je krijgt een code per mail.\n\n${hulpRegel}\n\nIn het portaal:\n- geef je elke maand tot ${OFFER.changesPerMonth} wijzigingen door (wij verwerken ze binnen ${OFFER.changeHours} uur)\n- volg je de status van je wijzigingen\n- vind je al je facturen\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Welkom bij Sitemaker",
      intro: [`Beste ${escH(c.contact_name || c.company)},`, "Je klantenportaal staat klaar. Daar geef je wijzigingen aan je website door, volg je de status en vind je je facturen.",
        `Inloggen gaat zonder wachtwoord: vul <b>${escH(u.email)}</b> in en je krijgt een code per mail.`, `Kom je er niet uit? Mail ons op <a href="mailto:${escH(hulp)}">${escH(hulp)}</a>, dan helpen we je verder.`],
      button: { label: "Naar je klantenportaal", href: link },
      after: [`Elke maand kun je <b>${OFFER.changesPerMonth} wijzigingen</b> doorgeven. We verwerken ze binnen <b>${OFFER.changeHours} uur</b>.`, `Kom je er niet uit? Mail ons op <a href="mailto:${escH(hulp)}">${escH(hulp)}</a>, dan helpen we je verder.`],
    }),
  });
  await audit(user.id, c.id, "klant.welkomstmail", { ok: res.ok });
  return res;
}

// ---------------------------------------------------------------- wijzigingen
const hqChange = (r) => ({ ...publicChange(r), ai: { status: r.ai_status, summary: r.ai_summary, reason: r.ai_reason, diff: r.ai_diff || [], feedback: r.ai_feedback, attempts: r.ai_attempts, prUrl: r.pr_url, previewUrl: r.preview_url, updatedAt: r.ai_updated_at } });
export async function listChanges({ status } = {}) {
  const where = status && STATUS_LABEL[status] ? "WHERE cr.status = $1" : status === "open" ? "WHERE cr.status IN ('ontvangen','in_behandeling')" : "";
  const rows = await q(`SELECT cr.*, c.company, u.email AS by_email FROM change_requests cr JOIN customers c ON c.id = cr.customer_id LEFT JOIN users u ON u.id = cr.user_id
                        ${where} ORDER BY CASE WHEN cr.status IN ('ontvangen','in_behandeling') THEN 0 ELSE 1 END, cr.created_at ${status === "open" || !status ? "ASC" : "DESC"} LIMIT 300`,
    status && STATUS_LABEL[status] ? [status] : []);
  return rows.map((r) => ({ ...hqChange(r), company: r.company, customerId: r.customer_id, byEmail: r.by_email }));
}

export async function updateChange(id, b, user) {
  const r = await one("SELECT * FROM change_requests WHERE id = $1", [id]);
  if (!r) fail(404, "Wijziging niet gevonden.");
  const status = STATUS_LABEL[b.status] ? b.status : r.status;
  const counts = typeof b.counts === "boolean" ? b.counts : r.counts;
  const note = b.staffNote !== undefined ? str(b.staffNote, 2000) : r.staff_note;
  const upd = await tx(async (t) => {
    let slot = r.slot;
    if (counts && !r.counts) {
      await t.q("SELECT pg_advisory_xact_lock(1001, $1)", [r.customer_id]);
      slot = await freeSlot(t, r.customer_id, r.month);
      if (!slot) fail(409, "Deze klant heeft in die maand al 4 wijzigingen die meetellen.");
    }
    if (!counts) slot = null;
    return t.one(`UPDATE change_requests SET status = $2, counts = $3, staff_note = $4, slot = $5, done_at = CASE WHEN $2 IN ('verwerkt','afgewezen') THEN COALESCE(done_at, NOW()) ELSE NULL END, updated_at = NOW()
                  WHERE id = $1 RETURNING *`, [id, status, counts, note, slot]);
  });
  await audit(user.id, r.customer_id, "wijziging.status", { id, from: r.status, to: status, counts });
  let mailed = null;
  if (status !== r.status && (status === "verwerkt" || status === "afgewezen") && b.notify !== false) mailed = await mailChangeStatus(id);
  return { change: publicChange(upd), mailed };
}

// ---------------------------------------------------------------- facturen
export async function listInvoices() {
  const rows = await q("SELECT i.*, c.company FROM invoices i JOIN customers c ON c.id = i.customer_id ORDER BY i.invoice_date DESC, i.id DESC LIMIT 500");
  return rows.map((i) => ({ ...publicInvoice(i), company: i.company, customerId: i.customer_id, source: i.source, sentAt: i.sent_at }));
}

// multipart: customerId, description, amount (totaal incl. btw, "84,64"), vatRate, date, status, number (optioneel), file (PDF, optioneel), generate ("1")
export async function createInvoiceFromForm(form, user) {
  const customerId = Number(form.get("customerId"));
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(400, "Kies een klant.", { field: "customerId" });
  const amount = Math.round(Number(String(form.get("amount") || "").replace(/\./g, "").replace(",", ".")) * 100);
  if (!Number.isFinite(amount) || amount <= 0) fail(400, "Vul het totaalbedrag in (bijv. 84,64).", { field: "amount" });
  const rate = Number(form.get("vatRate") ?? 21);
  if (![0, 9, 21].includes(rate)) fail(400, "Kies een btw-tarief.", { field: "vatRate" });
  const status = pick(form.get("status"), ["open", "betaald"], "open");
  const date = dateOrNull(form.get("date")) || dayKey();
  const description = str(form.get("description"), 500) || "Sitemaker";
  const manualNumber = str(form.get("number"), 40);
  const file = form.get("file");
  let pdf = null;
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) fail(400, "De PDF is groter dan 4 MB.", { field: "file" });
    const buf = Buffer.from(await file.arrayBuffer());
    if (!sniffOk(buf, "application/pdf")) fail(400, "Upload een PDF-bestand.", { field: "file" });
    pdf = buf;
  }
  let inv;
  if (manualNumber) {
    if (await one("SELECT 1 FROM invoices WHERE number = $1", [manualNumber])) fail(409, "Dit factuurnummer bestaat al.", { field: "number" });
    const p = partsFromGross(amount, rate);
    const s = await getSettings();
    inv = await one(`INSERT INTO invoices (customer_id, number, invoice_date, due_date, description, amount_cents, vat_cents, status, paid_at)
                     VALUES ($1,$2,$3,($3::date + ($4 || ' days')::interval)::date,$5,$6,$7,$8,$9) RETURNING *`,
      [customerId, manualNumber, date, String(s.billing.paymentTermDays || 14), description, p.gross, p.vat, status, status === "betaald" ? new Date() : null]);
  } else {
    inv = await createInvoice({ customerId, description, parts: partsFromGross(amount, rate), status, date, paidAt: status === "betaald" ? new Date().toISOString() : null });
  }
  let pdfResult = null;
  if (pdf) {
    const key = `invoices/${customerId}/${inv.id}-${inv.number}.pdf`;
    await putFile(key, pdf, { type: "application/pdf" });
    await q("UPDATE invoices SET pdf_key = $1 WHERE id = $2", [key, inv.id]);
  } else if (form.get("generate") === "1") {
    pdfResult = await generateInvoicePdf(inv.id);
  }
  await audit(user.id, customerId, "factuur.aangemaakt", { number: inv.number, amount });
  let mailed = null;
  if (form.get("send") === "1") mailed = await mailInvoice(inv.id);
  const fresh = await one("SELECT * FROM invoices WHERE id = $1", [inv.id]);
  return { invoice: publicInvoice(fresh), pdf: pdfResult, mailed };
}

export async function uploadInvoicePdf(id, form, user) {
  const inv = await one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  const file = form.get("file");
  if (!file || typeof file !== "object" || !file.size) fail(400, "Kies een PDF-bestand.");
  if (file.size > 4 * 1024 * 1024) fail(400, "De PDF is groter dan 4 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(buf, "application/pdf")) fail(400, "Upload een PDF-bestand.");
  const key = `invoices/${inv.customer_id}/${inv.id}-${inv.number}.pdf`;
  await putFile(key, buf, { type: "application/pdf" });
  await q("UPDATE invoices SET pdf_key = $1, updated_at = NOW() WHERE id = $2", [key, id]);
  await audit(user.id, inv.customer_id, "factuur.pdf", { number: inv.number });
  return { ok: true };
}

export async function updateInvoice(id, b, user) {
  const inv = await one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  const status = pick(b.status, ["open", "betaald", "vervallen", "gecrediteerd"], inv.status);
  const upd = await one(`UPDATE invoices SET status = $2, paid_at = CASE WHEN $2 = 'betaald' THEN COALESCE(paid_at, NOW()) ELSE NULL END, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, status]);
  await audit(user.id, inv.customer_id, "factuur.status", { number: inv.number, from: inv.status, to: status });
  // Door ons gemaakte PDF bijwerken (status "Betaald" en de betaalregel); een geüploade PDF laten we staan.
  if (status !== inv.status && inv.pdf_key && ["start", "maand"].includes(inv.source)) {
    const { generateInvoicePdf } = await import("./billing.mjs");
    await generateInvoicePdf(id).catch(() => {});
  }
  return { invoice: publicInvoice(upd) };
}

// ---------------------------------------------------------------- betalingen
export async function listPayments() {
  const rows = await q("SELECT p.*, c.company FROM payments p JOIN customers c ON c.id = p.customer_id ORDER BY p.created_at DESC LIMIT 300");
  const subs = await q("SELECT id, company, billing_status, monthly_cents, subscription_start, mollie_subscription_id FROM customers WHERE billing_status <> 'geen' ORDER BY company");
  const s = await getSettings();
  return {
    payments: rows.map((p) => ({ ...publicPayment(p), company: p.company, customerId: p.customer_id })),
    subscriptions: subs.map((c) => ({ id: c.id, company: c.company, status: c.billing_status, monthlyCents: c.monthly_cents, start: c.subscription_start, mollie: !!c.mollie_subscription_id,
      grossCents: priceParts(c.monthly_cents, s.billing)?.gross ?? null })),
    mollie: { ready: mollieReady(), mode: mollieMode() },
    vatSet: vatModeSet(s), pricesIncludeVat: s.billing.pricesIncludeVat,
  };
}

export async function startPayment(customerId, b, user) {
  if (b.iban) {
    if (!ibanOk(b.iban)) fail(400, "Dit IBAN klopt niet.", { field: "iban" });
    await q("UPDATE customers SET iban = $2, iban_naam = $3, updated_at = NOW() WHERE id = $1", [customerId, ibanNorm(b.iban), str(b.ibanNaam, 70)]);
  }
  const res = await startFirstPayment(customerId, { startDate: dateOrNull(b.startDate), userId: user.id });
  if (b.sendMail) res.mailed = await mailPaymentLink(customerId, res.checkoutUrl, res.amountCents);
  return res;
}
export const invoicePayLink = (id, user) => payInvoiceLink(id, user.id);
export const stopSubscription = (customerId, user) => cancelSubscription(customerId, user.id);
export const incassoStarten = (customerId, b, user) => startIncasso(customerId, { iban: b.iban || undefined, ibanNaam: b.ibanNaam, startDate: dateOrNull(b.startDate) || undefined }, user.id);

// ---------------------------------------------------------------- sites
export async function listSites() {
  const rows = await q("SELECT * FROM customers WHERE site_status <> 'opgezegd' OR site_url <> '' ORDER BY site_status = 'live' DESC, company");
  return rows.map(adminCustomer);
}
export const checkSiteNow = (id) => checkNow(id);

// ---------------------------------------------------------------- aanvragen via de website
const publicAppointment = (a) => ({ startsAt: a.starts_at, endsAt: a.ends_at, canceledAt: a.canceled_at, canceledBy: a.canceled_by, id: a.id, name: a.name, company: a.company, email: a.email, phone: a.phone, preference: a.preference, message: a.message, status: a.status, staffNote: a.staff_note, customerId: a.customer_id, createdAt: a.created_at, source: a.source, soort: a.soort || "" });
export async function listAppointments() {
  // Komende afspraken op tijd, daarna terugbelverzoeken zonder tijd, daarna de rest (nieuwste eerst).
  return (await q(`SELECT * FROM appointments ORDER BY
      CASE WHEN starts_at >= NOW() - INTERVAL '30 minutes' AND status <> 'geannuleerd' THEN 0 WHEN starts_at IS NULL AND status = 'nieuw' THEN 1 ELSE 2 END,
      CASE WHEN starts_at >= NOW() - INTERVAL '30 minutes' THEN starts_at END ASC, COALESCE(starts_at, created_at) DESC LIMIT 300`)).map(publicAppointment);
}
export async function updateAppointment(id, b, user) {
  const a = await one("UPDATE appointments SET status = COALESCE($2, status), staff_note = COALESCE($3, staff_note), updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, ["nieuw", "gepland", "klant", "geen_interesse", "niet_bereikbaar"].includes(b.status) ? b.status : null, b.staffNote !== undefined ? str(b.staffNote, 2000) : null]);
  if (!a) fail(404, "Aanvraag niet gevonden.");
  await audit(user.id, a.customer_id, "aanvraag.bijgewerkt", { id, status: a.status });
  return { appointment: publicAppointment(a) };
}

// ---------------------------------------------------------------- B2B
export async function listLeads({ status } = {}) {
  const sel = "SELECT l.*, row_to_json(c.*) AS concept FROM leads l LEFT JOIN concepts c ON c.lead_id = l.id";
  const rows = status === "bekeken"
    ? await q(`${sel} WHERE c.views > 0 ORDER BY c.last_view_at DESC LIMIT 500`)
    : status && LEAD_STATUSES.includes(status)
      ? await q(`${sel} WHERE l.status = $1 ORDER BY l.updated_at DESC LIMIT 500`, [status])
      : await q(`${sel} ORDER BY l.updated_at DESC LIMIT 500`);
  const counts = Object.fromEntries((await q("SELECT status, COUNT(*)::int AS n FROM leads GROUP BY status")).map((r) => [r.status, r.n]));
  const s = await getSettings();
  const followupDue = await q(`SELECT id FROM leads WHERE status = 'verstuurd' AND sent_at < NOW() - ($1 || ' days')::interval`, [String(s.b2b.followupDays || 5)]);
  const [{ n: today }] = await q("SELECT COUNT(*)::int AS n FROM mail_log WHERE kind LIKE 'b2b-%' AND ok AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')");
  const [{ n: bekeken }] = await q("SELECT COUNT(*)::int AS n FROM concepts WHERE views > 0");
  counts.bekeken = bekeken;
  return {
    leads: rows.map((l) => ({ id: l.id, company: l.company, email: l.email, website: l.website, city: l.city, category: l.category, phone: l.phone, source: l.source, status: l.status,
      intro: l.intro, researchNote: l.research_note, rejectReason: l.reject_reason, sentAt: l.sent_at, followupAt: l.followup_at, replyAt: l.reply_at, replySnippet: l.reply_snippet,
      error: l.error, notes: l.notes, customerId: l.customer_id, createdAt: l.created_at, updatedAt: l.updated_at, concept: publicConcept(l.concept) })),
    counts, followupDue: followupDue.map((r) => r.id), sentToday: today, dailyMax: s.b2b.dailyMax,
    ready: { mail: mailReady(), scout: scoutReady(), ai: aiReady(), company: !!(s.company.kvk && (s.company.legalName || s.company.name)) },
  };
}

// Snel zoeken (bijv. iemand reageert boos): op domein, e-mail of bedrijfsnaam.
export async function zoekLeads(zoek) {
  const t = str(zoek, 120).toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (t.length < 3) return { leads: [] };
  const rows = await q(`SELECT l.id, l.company, l.email, l.website, l.city, l.status, c.status AS concept_status FROM leads l LEFT JOIN concepts c ON c.lead_id = l.id
    WHERE lower(l.domain) LIKE $1 OR lower(l.website) LIKE $1 OR lower(COALESCE(l.email,'')) LIKE $1 OR lower(l.company) LIKE $1
    ORDER BY (lower(l.domain) = $2 OR lower(COALESCE(l.email,'')) = $2) DESC, l.updated_at DESC LIMIT 10`, [`%${t}%`, t]);
  return { leads: rows };
}

export async function leadAction(b, user) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(Boolean).slice(0, 500);
  if (!ids.length) fail(400, "Selecteer minimaal één lead.");
  const s = await getSettings();
  switch (b.action) {
    case "goedkeuren": {
      if (!s.company.kvk || !(s.company.legalName || s.company.name)) fail(400, "Vul eerst je bedrijfsnaam en KvK-nummer in bij Instellingen; die staan verplicht onder elke B2B-mail.");
      // Elke eerste mail gaat met een voorbeeldwebsite: zonder website kan dat niet. Het concept wordt zo nodig nu gemaakt; de mail wacht erop.
      const r = await q("UPDATE leads SET status = 'goedgekeurd', error = '', updated_at = NOW() WHERE id = ANY($1) AND status = 'nieuw' AND email IS NOT NULL AND website <> '' RETURNING id", [ids]);
      await audit(user.id, null, "b2b.goedgekeurd", { n: r.length });
      return { changed: r.length, skipped: ids.length - r.length };
    }
    case "opvolgen": {
      const r = await q("UPDATE leads SET status = 'opvolging_goedgekeurd', updated_at = NOW() WHERE id = ANY($1) AND status = 'verstuurd' RETURNING id", [ids]);
      return { changed: r.length };
    }
    case "terug": {
      const r = await q("UPDATE leads SET status = 'nieuw', updated_at = NOW() WHERE id = ANY($1) AND status = 'goedgekeurd' RETURNING id", [ids]);
      return { changed: r.length };
    }
    case "overslaan": {
      const r = await q("UPDATE leads SET status = 'overgeslagen', updated_at = NOW() WHERE id = ANY($1) AND status IN ('kandidaat','nieuw','goedgekeurd','verstuurd','opvolging_goedgekeurd') RETURNING id", [ids]);
      return { changed: r.length };
    }
    case "afspraak": case "klant": case "reactie": {
      const r = await q("UPDATE leads SET status = $2, updated_at = NOW() WHERE id = ANY($1) RETURNING id", [ids, b.action]);
      return { changed: r.length };
    }
    case "afmelden": { for (const id of ids) await unsubscribe(id); return { changed: ids.length }; }
    case "onderzoeken": {
      const l = await one("SELECT * FROM leads WHERE id = $1", [ids[0]]);
      if (!l) fail(404, "Lead niet gevonden.");
      return await researchLead(l);
    }
    case "concept": {
      let n = 0, fouten = 0;
      for (const id of ids.slice(0, 50)) { try { await queueConcept(id, { instructie: b.instructie || "", direct: ids.length === 1 }); n++; } catch { fouten++; } }
      return { changed: n, skipped: fouten };
    }
    case "verwijderen": {
      const r = await q("DELETE FROM leads WHERE id = ANY($1) AND status IN ('kandidaat','nieuw','overgeslagen','fout') RETURNING id", [ids]);
      return { changed: r.length };
    }
    default: fail(400, "Onbekende actie.");
  }
}

export async function updateLead(id, b) {
  const email = b.email ? cleanEmail(b.email) : null;
  if (email && !EMAIL_RE.test(email)) fail(400, "Dit e-mailadres klopt niet.");
  const l = await one(`UPDATE leads SET company = $2, email = $3, city = $4, category = $5, intro = $6, notes = $7, phone = $8,
                       status = CASE WHEN status = 'kandidaat' AND $3::text IS NOT NULL THEN 'nieuw' ELSE status END, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, str(b.company, 200), email, str(b.city, 100), str(b.category, 80), str(b.intro, 300), str(b.notes, 1000), str(b.phone, 40)]);
  if (!l) fail(404, "Lead niet gevonden.");
  return { ok: true };
}

export async function importLeads(text, user) {
  const rows = parseCsv(text);
  let added = 0, dup = 0, skipped = 0; const errors = [];
  for (const r of rows) {
    try { const res = await addLead({ ...r, source: "import" }, user.id); if (res.duplicate) dup++; else added++; }
    catch (e) { skipped++; if (errors.length < 5) errors.push(e.message); }
  }
  return { added, duplicates: dup, skipped, errors };
}

export async function leadPreview(id, kind) {
  const l = await one(`${LEAD_SELECT} WHERE l.id = $1`, [id]);
  if (!l) fail(404, "Lead niet gevonden.");
  return mailPreview(l, kind, await getSettings());
}

export const scoutNow = () => runScout({ force: true });
export { addLead };
export const sitesInfo = () => ({ themas: THEMAS, github: githubReady(), netlify: netlifyReady(), netlifyLink: netlifyLinkReady(), ai: claudeReady(), auto: autoReady() });
export { provisionSite, linkSite, approveChange, redoChange, manualChange, queueChange };
export { queueConcept, setTheme as setConceptTheme, deleteConcept, rejectConcept };

// ---------------------------------------------------------------- instellingen en team (admin)
export async function getAdminSettings() {
  const s = await getSettings();
  return { settings: s, defaults: { templates: DEFAULT_SETTINGS.b2b.templates }, offer: OFFER, setup: setupStatus(s) };
}

export async function saveAdminSettings(b, user) {
  const s = await getSettings();
  if (b.company) {
    const c = b.company;
    await saveSetting("company", Object.fromEntries(Object.keys(DEFAULT_SETTINGS.company).map((k) => [k, str(c[k] ?? s.company[k], 300)])));
  }
  if (b.billing) {
    const x = b.billing;
    await saveSetting("billing", {
      pricesIncludeVat: x.pricesIncludeVat === true || x.pricesIncludeVat === false ? x.pricesIncludeVat : s.billing.pricesIncludeVat,
      vatRate: [0, 9, 21].includes(Number(x.vatRate)) ? Number(x.vatRate) : s.billing.vatRate,
      paymentTermDays: Math.min(60, Math.max(0, Number(x.paymentTermDays ?? s.billing.paymentTermDays) || 14)),
      invoicePrefix: str(x.invoicePrefix ?? s.billing.invoicePrefix, 10).replace(/[^A-Z0-9]/gi, "").toUpperCase() || "SM",
      autoInvoices: x.autoInvoices !== false,
    });
  }
  if (b.tracking) {
    const id = str(b.tracking.metaPixelId, 30).replace(/\D/g, "");
    await saveSetting("tracking", { metaPixelId: id });
  }
  if (b.notify) {
    const e = cleanEmail(b.notify.email);
    if (e && !EMAIL_RE.test(e)) fail(400, "Het meldingsadres klopt niet.");
    await saveSetting("notify", { email: e });
  }
  if (b.b2b) {
    const x = b.b2b, cur = s.b2b;
    const list = (v, d) => (Array.isArray(v) ? v : String(v ?? "").split(/[\n,]/)).map((t) => str(t, 60)).filter(Boolean).slice(0, 30) || d;
    const tpl = (k) => ({ subject: str(x.templates?.[k]?.subject ?? cur.templates[k].subject, 200), body: str(x.templates?.[k]?.body ?? cur.templates[k].body, 6000) });
    await saveSetting("b2b", {
      senderName: str(x.senderName ?? cur.senderName, 80),
      dailyMax: Math.min(200, Math.max(0, Number(x.dailyMax ?? cur.dailyMax) || 0)),
      perUur: Math.min(50, Math.max(0, Number(x.perUur ?? cur.perUur) || 0)),
      followupDays: Math.min(30, Math.max(2, Number(x.followupDays ?? cur.followupDays) || 5)),
      sendHours: Array.isArray(x.sendHours) && x.sendHours.length === 2 ? x.sendHours.map((h) => Math.min(23, Math.max(0, Number(h) || 0))) : cur.sendHours,
      scout: { active: x.scout?.active ?? cur.scout.active, perDay: Math.min(300, Math.max(5, Number(x.scout?.perDay ?? cur.scout.perDay) || 20)),
        categories: list(x.scout?.categories ?? cur.scout.categories), places: list(x.scout?.places ?? cur.scout.places) },
      ai: { research: x.ai?.research ?? cur.ai.research },
      meten: { opens: x.meten?.opens ?? cur.meten?.opens ?? true, kliks: x.meten?.kliks ?? cur.meten?.kliks ?? true },
      concepten: {
        auto: x.concepten?.auto ?? cur.concepten?.auto ?? true,
        perDag: Math.min(200, Math.max(0, Number(x.concepten?.perDag ?? cur.concepten?.perDag ?? 20) || 0)),
        geldigDagen: Math.min(365, Math.max(7, Number(x.concepten?.geldigDagen ?? cur.concepten?.geldigDagen ?? 30) || 30)),
        wachten: x.concepten?.wachten ?? cur.concepten?.wachten ?? true,
        maker: ["taak", "netlify"].includes(x.concepten?.maker) ? x.concepten.maker : (cur.concepten?.maker || "taak"),
      },
      templates: { eerste: tpl("eerste"), opvolging: tpl("opvolging") },
    });
  }
  await audit(user.id, null, "instellingen.opgeslagen", { parts: Object.keys(b) });
  return getAdminSettings();
}

export async function listTeam() {
  const admins = env("ADMIN_EMAILS").split(",").map(cleanEmail).filter(Boolean);
  const rows = await q("SELECT id, email, name, role, active, last_login_at FROM users WHERE role <> 'klant' ORDER BY role, email");
  return { team: rows.map((u) => ({ ...u, fromEnv: admins.includes(u.email) })), adminEmails: admins };
}
export async function deleteTeamMember(id, user) {
  const u = await one("SELECT * FROM users WHERE id = $1 AND role <> 'klant'", [id]);
  if (!u) fail(404, "Medewerker niet gevonden.");
  if (u.id === user.id) fail(400, "Je kunt jezelf niet verwijderen.");
  if (env("ADMIN_EMAILS").split(",").map(cleanEmail).includes(u.email)) fail(400, "Dit adres staat in ADMIN_EMAILS in Netlify en komt bij de volgende login terug. Haal het daar eerst weg.");
  await q("DELETE FROM users WHERE id = $1", [id]);
  await q("DELETE FROM login_codes WHERE email = $1", [u.email]);
  await audit(user.id, null, "team.verwijderd", { email: u.email });
  return { ok: true };
}
export async function saveTeamMember(b, user) {
  const email = cleanEmail(b.email);
  if (!EMAIL_RE.test(email)) fail(400, "Dit e-mailadres klopt niet.");
  const role = b.role === "admin" ? "admin" : "medewerker";
  const ex = await one("SELECT * FROM users WHERE email = $1", [email]);
  if (ex && ex.role === "klant") fail(409, "Dit adres hoort bij een klant.");
  if (ex && ex.id === user.id && (role !== "admin" || b.active === false)) fail(400, "Je kunt je eigen beheerrechten niet intrekken.");
  const u = await one(`INSERT INTO users (email, name, role, active) VALUES ($1,$2,$3,$4)
                       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, active = EXCLUDED.active RETURNING id, email, role, active`,
    [email, str(b.name, 200), role, b.active !== false]);
  if (!u.active) await q("DELETE FROM sessions WHERE user_id = $1", [u.id]);
  await audit(user.id, null, "team.opgeslagen", { email, role, active: u.active });
  return { ok: true };
}

export async function mailLog() {
  return q("SELECT to_email, subject, kind, ok, error, created_at FROM mail_log ORDER BY created_at DESC LIMIT 200");
}

export async function testMail(user) {
  return sendMail({ to: user.email, kind: "test", subject: "Testmail van Sitemaker HQ", text: "De mailinstellingen werken.", html: brandHtml({ title: "Testmail", intro: ["De mailinstellingen van Sitemaker HQ werken."] }) });
}

export { euro };
