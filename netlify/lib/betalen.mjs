// Online betalen via Pay.nl (vervangt Mollie).
// Stroom: eerste betaling (bouwprijs) via een Pay.nl-order (iDEAL e.d.). Is die betaald, dan maken we een SEPA-machtiging
// (RECURRING, elke maand het maandbedrag) op het IBAN dat de klant in het portaal invulde. Pay.nl incasseert dan zelf;
// elke geïnde termijn (exchange "incassocollected") wordt een betaalde factuur. Lukt de machtiging niet (incasso nog niet
// actief bij Pay.nl, of geen IBAN), dan valt de klant terug op handmatige maandfacturen (billing_status 'handmatig').
// Legacy kolomnamen: payments.mollie_payment_id = Pay.nl orderId of IL-incassocode, customers.mollie_subscription_id /
// mollie_mandate_id = IO-machtigingscode.
import { markStarted } from "./start.mjs";
import { env, q, one, getSettings, dayKey, addMonths, publicBase, fail, audit, escH, euro, portalUrl, OFFER } from "./core.mjs";
import { priceParts, createInvoice, generateInvoicePdf, vatModeSet, mailInvoice } from "./billing.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";

export const betaalReady = () => !!((env("PAYNL_SERVICE_ID") && env("PAYNL_SERVICE_SECRET")) || (env("PAYNL_AT_CODE") && env("PAYNL_TOKEN") && env("PAYNL_SERVICE_ID")));
export const betaalMode = () => (env("PAYNL_TESTMODE") === "1" ? "test" : betaalReady() ? "live" : "");
export const PROVIDER = "Pay.nl";

const auth = (voorkeur) => {
  const at = env("PAYNL_AT_CODE") && env("PAYNL_TOKEN") ? [env("PAYNL_AT_CODE"), env("PAYNL_TOKEN")] : null;
  const sl = env("PAYNL_SERVICE_ID") && env("PAYNL_SERVICE_SECRET") ? [env("PAYNL_SERVICE_ID"), env("PAYNL_SERVICE_SECRET")] : null;
  const [u, p] = (voorkeur === "at" ? at || sl : sl || at) || ["", ""];
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
};

async function api(method, url, body, voorkeur) {
  if (!betaalReady()) fail(503, "Pay.nl is nog niet gekoppeld. Zet PAYNL_SERVICE_ID en PAYNL_SERVICE_SECRET in Netlify.");
  if (env("PAYNL_FAKE")) return fakeApi(method, url, body);
  const r = await fetch(url, {
    method, headers: { authorization: auth(voorkeur), accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000),
  });
  const tekst = await r.text();
  let d = {}; try { d = JSON.parse(tekst); } catch {}
  if (!r.ok) {
    const msg = d.detail || d.title || d.message || d.error?.message || (Array.isArray(d.violations) ? d.violations.map((v) => `${v.propertyPath || v.field}: ${v.message}`).join("; ") : "") || tekst.slice(0, 200) || `status ${r.status}`;
    if (r.status === 401 || r.status === 403) fail(502, `Pay.nl weigert de sleutel (${r.status}). Controleer PAYNL_SERVICE_ID/PAYNL_SERVICE_SECRET (en PAYNL_AT_CODE/PAYNL_TOKEN).`);
    fail(502, "Pay.nl: " + msg);
  }
  return d;
}

const ORDERS = "https://connect.pay.nl/v1/orders";
const REST = "https://rest.pay.nl/v2";
const exchangeUrl = () => `${publicBase()}/api/paynl/exchange`;

// Pay.nl-statuscodes → onze statussen (zelfde woorden als voorheen, zodat HQ en queries blijven werken).
export function orderStatus(o) {
  const code = Number(o?.status?.code ?? o?.status ?? 0), act = String(o?.status?.action || "").toUpperCase();
  if (code === 100 || act === "PAID") return "paid";
  if (code === -80 || act === "EXPIRED") return "expired";
  if (code === -90 || code === -61 || act === "CANCEL") return "canceled";
  if (code < 0) return "failed";
  return "open";
}

async function maakOrder({ amountCents, description, reference, returnUrl }) {
  const body = {
    serviceId: env("PAYNL_SERVICE_ID"), amount: { value: amountCents, currency: "EUR" },
    description: String(description).slice(0, 32), reference: String(reference).replace(/[^A-Za-z0-9]/g, "").slice(0, 64),
    returnUrl, exchangeUrl: exchangeUrl(),
  };
  if (env("PAYNL_TESTMODE") === "1") body.integration = { test: true };
  const o = await api("POST", ORDERS, body);
  return { id: o.orderId || o.id, uuid: o.id, checkoutUrl: o.links?.redirect || o.links?.checkout || null, status: orderStatus(o) };
}
async function haalOrder(orderId) {
  return api("GET", `${ORDERS}/${encodeURIComponent(orderId)}/status`);
}

// Start: betaallink voor de bouwprijs. De machtiging volgt na betaling (op het IBAN van de klant).
export async function startFirstPayment(customerId, { startDate, userId } = {}) {
  const s = await getSettings();
  if (!vatModeSet(s)) fail(400, "Kies eerst bij Instellingen › Facturatie of de prijzen inclusief of exclusief btw zijn.");
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  if (c.mollie_subscription_id && c.billing_status === "actief") fail(400, "Deze klant heeft al een actieve incasso.");
  const parts = priceParts(c.build_cents, s.billing);
  const o = await maakOrder({ amountCents: parts.gross, description: "Sitemaker website", reference: `SM${c.id}E${Date.now().toString(36)}`, returnUrl: `${portalUrl()}?betaling=1` });
  await q(`INSERT INTO payments (customer_id, mollie_payment_id, kind, amount_cents, status, checkout_url, description)
           VALUES ($1,$2,'eerste',$3,$4,$5,$6)`, [c.id, o.id, parts.gross, o.status, o.checkoutUrl, `Sitemaker website ${c.company}`]);
  await q("UPDATE customers SET billing_status = 'wacht_op_betaling', subscription_start = $2, updated_at = NOW() WHERE id = $1", [c.id, startDate || null]);
  await audit(userId, c.id, "betaling.eerste_gestart", { payment: o.id, amount: parts.gross });
  return { paymentId: o.id, checkoutUrl: o.checkoutUrl, amountCents: parts.gross };
}

// Betaallink voor een losse, openstaande factuur.
export async function payInvoiceLink(invoiceId, userId) {
  const inv = await one("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  if (inv.status !== "open" && inv.status !== "vervallen") fail(400, "Deze factuur staat niet open.");
  const existing = await one("SELECT * FROM payments WHERE invoice_id = $1 AND status = 'open' AND checkout_url IS NOT NULL AND created_at > NOW() - INTERVAL '6 days' ORDER BY id DESC LIMIT 1", [inv.id]);
  if (existing) return { checkoutUrl: existing.checkout_url, paymentId: existing.mollie_payment_id };
  const o = await maakOrder({ amountCents: inv.amount_cents, description: `Factuur ${inv.number}`, reference: `SM${inv.customer_id}F${inv.id}${Date.now().toString(36)}`, returnUrl: `${portalUrl()}?betaling=1#facturen` });
  await q(`INSERT INTO payments (customer_id, invoice_id, mollie_payment_id, kind, amount_cents, status, checkout_url, description)
           VALUES ($1,$2,$3,'factuur',$4,$5,$6,$7)`, [inv.customer_id, inv.id, o.id, inv.amount_cents, o.status, o.checkoutUrl, `Factuur ${inv.number}`]);
  await audit(userId, inv.customer_id, "betaling.factuurlink", { invoice: inv.number, payment: o.id });
  return { checkoutUrl: o.checkoutUrl, paymentId: o.id };
}

// ---------------------------------------------------------------- IBAN
export function ibanOk(iban) {
  const s = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let m = 0; for (const d of r) m = (m * 10 + Number(d)) % 97;
  return m === 1;
}
export const ibanNorm = (iban) => String(iban || "").replace(/\s+/g, "").toUpperCase();

// ---------------------------------------------------------------- machtiging (SEPA, elke maand)
export async function maakMachtiging(c, { startDate, ip } = {}) {
  if (!c.iban || !ibanOk(c.iban)) throw new Error("Geen geldig IBAN bij deze klant.");
  const s = await getSettings();
  const parts = priceParts(c.monthly_cents, s.billing);
  if (!parts) throw new Error("Btw-instelling ontbreekt.");
  const start = startDate && startDate > dayKey() ? startDate : addMonths(dayKey(), 1);
  const u = await one("SELECT email FROM users WHERE active AND role = 'klant' AND customer_id = $1 ORDER BY id LIMIT 1", [c.id]);
  const body = {
    serviceId: env("PAYNL_SERVICE_ID"), reference: `SM${c.id}M${Date.now().toString(36)}`,
    description: "Sitemaker abonnement", processDate: start, type: "RECURRING",
    interval: { period: "month", value: 1, quantity: 120 },
    amount: { value: parts.gross, currency: "EUR" },
    customer: { ipAddress: ip || c.terms_ip || undefined, email: c.email || u?.email || undefined, bankAccount: { iban: ibanNorm(c.iban), owner: (c.iban_naam || c.contact_name || c.company).slice(0, 70) } },
    exchangeUrl: exchangeUrl(),
  };
  const m = await api("POST", `${REST}/directdebits/mandates`, body, "at");
  const code = m.code || m.mandateId || m.id;
  if (!code) throw new Error("Pay.nl gaf geen machtigingscode terug.");
  await q("UPDATE customers SET mollie_subscription_id = $1, mollie_mandate_id = $1, subscription_start = $2, billing_status = 'actief', updated_at = NOW() WHERE id = $3", [code, start, c.id]);
  await audit(null, c.id, "abonnement.gestart", { mandaat: code, start });
  return { code, start };
}

// Na de eerste betaling: machtiging maken, en anders terugvallen op handmatige maandfacturen.
async function naEerste(c, meta = {}) {
  const start = meta.startDate || (c.subscription_start ? String(c.subscription_start instanceof Date ? c.subscription_start.toISOString() : c.subscription_start).slice(0, 10) : null);
  try {
    const m = await maakMachtiging(c, { startDate: start });
    await notifyStaff(`Betaling ontvangen: ${c.company}`, [`${c.company} heeft de eerste betaling voldaan. De maandelijkse incasso staat aan vanaf ${m.start} (machtiging ${m.code}).`], `/hq/#klant/${c.id}`).catch(() => {});
  } catch (e) {
    const s = start && start > dayKey() ? start : addMonths(dayKey(), 1);
    await q("UPDATE customers SET billing_status = 'handmatig', subscription_start = $2, updated_at = NOW() WHERE id = $1", [c.id, s]);
    await notifyStaff(`Betaling ontvangen, incasso nog niet: ${c.company}`, [`De eerste betaling van ${c.company} is binnen. De maandelijkse incasso kon (nog) niet worden aangezet: ${e.message}`, `Tot die tijd krijgt de klant elke maand een factuur per mail (vanaf ${s}). In HQ › klant kun je later op "Incasso starten" klikken.`], `/hq/#klant/${c.id}`).catch(() => {});
  }
}

// HQ: incasso alsnog aanzetten (bijv. nadat Pay.nl incasso activeerde of de klant zijn IBAN doorgaf).
export async function startIncasso(customerId, { iban, ibanNaam, startDate } = {}, userId) {
  if (iban !== undefined) {
    if (!ibanOk(iban)) fail(400, "Dit IBAN klopt niet.", { field: "iban" });
    await q("UPDATE customers SET iban = $2, iban_naam = $3, updated_at = NOW() WHERE id = $1", [customerId, ibanNorm(iban), String(ibanNaam || "").slice(0, 70)]);
  }
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  if (c.mollie_subscription_id && c.billing_status === "actief") fail(400, "Deze klant heeft al een actieve incasso.");
  try { const m = await maakMachtiging(c, { startDate }); await audit(userId, c.id, "abonnement.gestart", { mandaat: m.code, viaHq: true }); return { ok: true, ...m }; }
  catch (e) { fail(e.status || 502, e.message); }
}

// ---------------------------------------------------------------- exchange (Pay.nl → ons)
// Pay.nl stuurt order_id/action (form of query) of JSON {id, object}. We vertrouwen de inhoud niet: we halen de status
// altijd zelf op bij Pay.nl. Antwoord altijd "TRUE|…" met 200, anders blijft Pay.nl het opnieuw proberen.
// Pay.nl stuurt geneste velden plat als object[orderId], object[status][code] (query of formulier): weer nesten.
export function nest(plat) {
  const uit = {};
  for (const [k, val] of Object.entries(plat || {})) {
    if (val && typeof val === "object") { uit[k] = val; continue; }
    const delen = k.replace(/\]/g, "").split("[");
    let o = uit;
    delen.forEach((d, i) => { if (i === delen.length - 1) o[d] = val; else o = o[d] && typeof o[d] === "object" ? o[d] : (o[d] = {}); });
  }
  return uit;
}

export async function handleExchange(velden) {
  const v = nest(velden || {});
  const action = String(v.action || v.event || "").toLowerCase();
  if (/^incasso/.test(action) || v.referenceId || v.mandateId) return incassoExchange(v, action);
  const kandidaten = [v.order_id, v.orderId, v.object?.orderId, v.object?.id, v.id].map((x) => String(x || "").trim()).filter((x) => /^[A-Za-z0-9-]{6,64}$/.test(x));
  if (!kandidaten.length) return { ignored: true };
  let local = null;
  for (const k of kandidaten) { local = await one("SELECT * FROM payments WHERE mollie_payment_id = $1", [k]); if (local) break; }
  if (!local) return { ignored: true, reason: "onbekende order" };
  const orderId = local.mollie_payment_id;
  // Status altijd zelf ophalen; Pay.nl kent de order onder zijn uuid (id) en onder het orderId.
  const uuid = String(v.object?.id || v.id || "").trim();
  let o = null;
  for (const k of [...new Set([uuid, orderId].filter((x) => /^[A-Za-z0-9-]{6,64}$/.test(x)))]) { try { o = await haalOrder(k); if (o && (o.status || o.orderId)) break; } catch (e) { o = null; console.log("[paynl] status", k, e.message); } }
  if (!o) throw new Error("Status van de order kon niet worden opgehaald.");
  const status = orderStatus(o);
  if (status === local.status) return { ok: true, status };
  const methode = o.payments?.[0]?.paymentMethod?.id ? String(o.payments[0].paymentMethod.id) : null;
  await q("UPDATE payments SET status = $1, method = COALESCE($2, method), paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END, updated_at = NOW() WHERE id = $3", [status, methode, local.id]);
  const c = await one("SELECT * FROM customers WHERE id = $1", [local.customer_id]);
  if (status === "paid") {
    const s = await getSettings();
    if (local.kind === "factuur" && local.invoice_id) {
      await q("UPDATE invoices SET status = 'betaald', paid_at = NOW(), updated_at = NOW() WHERE id = $1", [local.invoice_id]);
      await generateInvoicePdf(local.invoice_id).catch(() => {});
    } else if (local.kind === "eerste" && s.billing.autoInvoices !== false && !(await one("SELECT id FROM invoices WHERE mollie_payment_id = $1", [orderId]))) {
      await betaaldeFactuur(c, local.amount_cents, "Bouw van je website (eenmalig)", orderId, local.id);
    }
    if (local.kind === "eerste") {
      await markStarted(c.id).catch((e) => console.log("[start]", e.message));
      if (!(c.mollie_subscription_id && c.billing_status === "actief")) {
        // Geen IBAN ingevuld? Neem het rekeningnummer van de iDEAL-betaling.
        const cm = o.payments?.find((x) => x.customerMethod?.data?.iban)?.customerMethod?.data;
        if (!c.iban && cm?.iban && ibanOk(cm.iban)) { await q("UPDATE customers SET iban = $2, iban_naam = $3 WHERE id = $1", [c.id, ibanNorm(cm.iban), String(cm.name || "").slice(0, 70)]); c.iban = ibanNorm(cm.iban); c.iban_naam = cm.name || ""; }
        await naEerste(c);
      }
    }
  } else if (["failed", "expired", "canceled"].includes(status) && local.kind === "eerste" && status === "failed") {
    await notifyStaff(`Betaling mislukt: ${c.company}`, [`De eerste betaling van ${euro(local.amount_cents)} is mislukt.`], `/hq/#klant/${c.id}`).catch(() => {});
  }
  return { ok: true, status };
}

async function betaaldeFactuur(c, amount, desc, ref, paymentRowId) {
  const s = await getSettings();
  const rate = Number(s.billing.vatRate || 21);
  const vat = Math.round((amount * rate) / (100 + rate));
  const inv = await createInvoice({ customerId: c.id, description: desc, parts: { gross: amount, vat, net: amount - vat }, status: "betaald", source: "paynl", molliePaymentId: ref, paidAt: new Date().toISOString() });
  if (paymentRowId) await q("UPDATE payments SET invoice_id = $1 WHERE id = $2", [inv.id, paymentRowId]);
  try { const g = await generateInvoicePdf(inv.id); if (g.ok) await mailInvoice(inv.id); } catch (e) { console.log("[paynl] pdf/mail", e.message); }
  return inv;
}

async function incassoExchange(v, action) {
  const ref = String(v.referenceId || "").trim(), mandaat = String(v.mandateId || "").trim();
  if (!/^IL-[\d-]+$/.test(ref)) return { ignored: true };
  const d = await api("GET", `${REST}/directdebits/${encodeURIComponent(ref)}`, null, "at");
  const code = Number(d.status?.code ?? 0);
  const io = d.mandate?.code || mandaat;
  const c = io ? await one("SELECT * FROM customers WHERE mollie_subscription_id = $1 OR mollie_mandate_id = $1", [io]) : null;
  if (!c) return { ignored: true, reason: "onbekende machtiging" };
  const amount = Number(d.amount?.value ?? Math.round(Number(v.amount || 0) * 100)) || c.monthly_cents;
  let local = await one("SELECT * FROM payments WHERE mollie_payment_id = $1", [ref]);
  if (!local) local = await one(`INSERT INTO payments (customer_id, mollie_payment_id, kind, amount_cents, status, method, description) VALUES ($1,$2,'abonnement',$3,'open','incasso',$4)
                                 ON CONFLICT (mollie_payment_id) DO UPDATE SET updated_at = NOW() RETURNING *`, [c.id, ref, amount, `Incasso ${ref}`]);
  const geind = code === 100 || action === "incassocollected";
  const mislukt = code === 106 || code === 127 || code === 103 || action === "incassostorno";
  if (geind && local.status !== "paid" && action !== "incassostorno") {
    await q("UPDATE payments SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1", [local.id]);
    if (!(await one("SELECT id FROM invoices WHERE mollie_payment_id = $1", [ref]))) {
      const maand = new Date().toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
      await betaaldeFactuur(c, amount, `Abonnement Sitemaker: hosting en ${OFFER.changesPerMonth} wijzigingen per maand (${maand})`, ref, local.id);
    }
    if (c.billing_status === "betaling_mislukt") await q("UPDATE customers SET billing_status = 'actief', updated_at = NOW() WHERE id = $1", [c.id]);
  } else if (mislukt && local.status !== "failed") {
    await q("UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1", [local.id]);
    await q("UPDATE customers SET billing_status = 'betaling_mislukt', updated_at = NOW() WHERE id = $1", [c.id]);
    await notifyStaff(`Incasso mislukt: ${c.company}`, [`De maandelijkse incasso van ${euro(amount)} is ${action === "incassostorno" ? "teruggeboekt (storno)" : "mislukt"}${d.decline?.name ? `: ${d.decline.name}` : ""}.`, "Stuur de klant een betaallink vanuit HQ › Facturen, of neem contact op."], `/hq/#klant/${c.id}`).catch(() => {});
  }
  return { ok: true, incasso: ref, code };
}

// ---------------------------------------------------------------- abonnement
export async function subscriptionInfo(c) {
  if (!c.mollie_subscription_id) return null;
  return { status: c.billing_status === "actief" ? "actief" : c.billing_status, mandaat: c.mollie_subscription_id, startDate: c.subscription_start };
}

export async function cancelSubscription(customerId, userId) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c?.mollie_subscription_id) {
    if (c?.billing_status === "handmatig") { await q("UPDATE customers SET billing_status = 'opgezegd', updated_at = NOW() WHERE id = $1", [c.id]); await audit(userId, c.id, "abonnement.opgezegd", {}); return { ok: true }; }
    fail(400, "Deze klant heeft geen incasso bij Pay.nl.");
  }
  let gestopt = true;
  try { await api("DELETE", `${REST}/directdebits/mandates/${encodeURIComponent(c.mollie_subscription_id)}`, null, "at"); }
  catch (e) { gestopt = false; console.log("[paynl] machtiging stoppen", e.message); }
  await q("UPDATE customers SET billing_status = 'opgezegd', updated_at = NOW() WHERE id = $1", [c.id]);
  await audit(userId, c.id, "abonnement.opgezegd", { mandaat: c.mollie_subscription_id, gestopt });
  if (!gestopt) await notifyStaff(`Stop de incasso van ${c.company} in Pay.nl`, [`Het abonnement van ${c.company} is opgezegd, maar de machtiging ${c.mollie_subscription_id} kon niet automatisch worden gestopt.`, "Stop hem in het Pay.nl-dashboard (Transacties › Incasso)."], `/hq/#klant/${c.id}`).catch(() => {});
  return { ok: true, gestopt };
}

// Mail met de betaallink naar de klant.
export async function mailPaymentLink(customerId, checkoutUrl, amountCents) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c?.email) fail(400, "Deze klant heeft geen e-mailadres.");
  return sendMail({
    to: c.email, kind: "betaallink", ref: `customer:${c.id}`,
    subject: "Start je Sitemaker-abonnement",
    text: `Beste ${c.contact_name || c.company},\n\nVia deze link betaal je de eenmalige bouwprijs (${euro(amountCents)}):\n${checkoutUrl}\n\nDaarna schrijven we het maandbedrag van je abonnement automatisch af.\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Start je Sitemaker-abonnement",
      intro: [`Beste ${escH(c.contact_name || c.company)},`, `Via de knop hieronder betaal je de eenmalige bouwprijs van <b>${euro(amountCents)}</b>. Daarna schrijven we het maandbedrag van je abonnement (hosting en ${OFFER.changesPerMonth} wijzigingen per maand) automatisch af.`],
      button: { label: "Betalen", href: checkoutUrl },
      after: ["De betaling loopt veilig via Pay.nl. Na betaling vind je de factuur in je klantenportaal."],
    }),
  });
}

// ---------------------------------------------------------------- nep-Pay.nl voor lokale tests (PAYNL_FAKE=1)
const fake = globalThis.__paynlFake || (globalThis.__paynlFake = { orders: {}, mandates: {}, debits: {}, n: 0 });
function fakeApi(method, url, body) {
  const n = ++fake.n;
  if (method === "POST" && url === ORDERS) {
    const id = `5${String(n).padStart(9, "0")}X${n.toString(16)}`;
    const o = { id: `uuid-${n}`, orderId: id, status: { code: 20, action: "PENDING" }, ...body, links: { redirect: env("PAYNL_FAKE_CHECKOUT") ? `${env("PAYNL_FAKE_CHECKOUT")}?id=${id}` : `https://checkout.pay.nl/test/${id}` }, payments: [] };
    fake.orders[id] = o; return o;
  }
  if (method === "GET" && url.startsWith(ORDERS + "/")) return fake.orders[decodeURIComponent(url.slice(ORDERS.length + 1).split("/")[0])] || {};
  if (method === "POST" && url.endsWith("/directdebits/mandates")) {
    if (env("PAYNL_FAKE_GEEN_INCASSO")) fail(502, "Pay.nl: Direct debit is not enabled for this service");
    const code = `IO-${1000 + n}-${2000 + n}-${3000 + n}`; fake.mandates[code] = { code, ...body }; return { code, ...body };
  }
  if (method === "GET" && /\/directdebits\/IL-/.test(url)) return fake.debits[decodeURIComponent(url.split("/").pop())] || {};
  if (method === "DELETE" && /\/directdebits\/mandates\//.test(url)) { const m = fake.mandates[decodeURIComponent(url.split("/").pop())]; if (m) m.gestopt = true; return {}; }
  return {};
}
export const __fake = fake;
