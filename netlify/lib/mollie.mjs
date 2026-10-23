// Automatische betalingen via Mollie.
// Stroom: eerste betaling (bouwprijs, sequenceType "first") geeft een incassomachtiging;
// daarna maakt de webhook het maandabonnement aan. Elke betaalde termijn wordt een factuur.
import { env, q, one, tx, getSettings, centsToMollie, dayKey, addMonths, publicBase, fail, audit, escH, euro } from "./core.mjs";
import { priceParts, createInvoice, generateInvoicePdf, vatModeSet, mailInvoice } from "./billing.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";

export const mollieReady = () => !!env("MOLLIE_API_KEY");
export const mollieMode = () => (env("MOLLIE_API_KEY").startsWith("live_") ? "live" : env("MOLLIE_API_KEY") ? "test" : "");

async function api(method, path, body) {
  if (!mollieReady()) fail(503, "Mollie is nog niet gekoppeld. Zet MOLLIE_API_KEY in Netlify.");
  if (env("MOLLIE_FAKE")) return fakeApi(method, path, body);
  const r = await fetch("https://api.mollie.com/v2" + path, {
    method, headers: { authorization: `Bearer ${env("MOLLIE_API_KEY")}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.detail || d.title || `status ${r.status}`;
    if (r.status === 401) fail(502, "Mollie weigert de sleutel. Controleer MOLLIE_API_KEY.");
    fail(502, "Mollie: " + msg);
  }
  return d;
}

const webhookUrl = () => `${publicBase()}/api/mollie/webhook`;

async function ensureMollieCustomer(c) {
  if (c.mollie_customer_id) return c.mollie_customer_id;
  const mc = await api("POST", "/customers", { name: c.company, email: c.email || undefined, locale: "nl_NL", metadata: { sitemakerCustomerId: c.id } });
  await q("UPDATE customers SET mollie_customer_id = $1, updated_at = NOW() WHERE id = $2", [mc.id, c.id]);
  return mc.id;
}

// Start: betaallink voor de bouwprijs, waarmee de klant ook de machtiging afgeeft.
export async function startFirstPayment(customerId, { startDate, userId } = {}) {
  const s = await getSettings();
  if (!vatModeSet(s)) fail(400, "Kies eerst bij Instellingen › Facturatie of de prijzen inclusief of exclusief btw zijn.");
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c) fail(404, "Klant niet gevonden.");
  if (c.mollie_subscription_id && c.billing_status === "actief") fail(400, "Deze klant heeft al een actief abonnement.");
  const mcid = await ensureMollieCustomer(c);
  const parts = priceParts(c.build_cents, s.billing);
  const p = await api("POST", "/payments", {
    amount: { currency: "EUR", value: centsToMollie(parts.gross) },
    description: `Sitemaker website ${c.company}`.slice(0, 255),
    customerId: mcid, sequenceType: "first",
    redirectUrl: `${publicBase()}/portaal/?betaling=1`,
    webhookUrl: webhookUrl(),
    locale: "nl_NL",
    metadata: { sitemakerCustomerId: c.id, kind: "eerste", startDate: startDate || null },
  });
  await q(`INSERT INTO payments (customer_id, mollie_payment_id, kind, amount_cents, status, checkout_url, description)
           VALUES ($1,$2,'eerste',$3,$4,$5,$6)`, [c.id, p.id, parts.gross, p.status, p._links?.checkout?.href || null, p.description]);
  await q("UPDATE customers SET billing_status = 'wacht_op_betaling', subscription_start = $2, updated_at = NOW() WHERE id = $1", [c.id, startDate || null]);
  await audit(userId, c.id, "betaling.eerste_gestart", { payment: p.id, amount: parts.gross });
  return { paymentId: p.id, checkoutUrl: p._links?.checkout?.href, amountCents: parts.gross };
}

// Betaallink voor een losse, openstaande factuur.
export async function payInvoiceLink(invoiceId, userId) {
  const inv = await one("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  if (inv.status !== "open") fail(400, "Deze factuur staat niet open.");
  const existing = await one("SELECT * FROM payments WHERE invoice_id = $1 AND status = 'open' AND checkout_url IS NOT NULL ORDER BY id DESC LIMIT 1", [inv.id]);
  if (existing) return { checkoutUrl: existing.checkout_url, paymentId: existing.mollie_payment_id };
  const c = await one("SELECT * FROM customers WHERE id = $1", [inv.customer_id]);
  const p = await api("POST", "/payments", {
    amount: { currency: "EUR", value: centsToMollie(inv.amount_cents) },
    description: `Factuur ${inv.number}`, redirectUrl: `${publicBase()}/portaal/?betaling=1#facturen`, webhookUrl: webhookUrl(), locale: "nl_NL",
    customerId: c.mollie_customer_id || undefined,
    metadata: { sitemakerCustomerId: c.id, kind: "factuur", invoiceId: inv.id },
  });
  await q(`INSERT INTO payments (customer_id, invoice_id, mollie_payment_id, kind, amount_cents, status, checkout_url, description)
           VALUES ($1,$2,$3,'factuur',$4,$5,$6,$7)`, [c.id, inv.id, p.id, inv.amount_cents, p.status, p._links?.checkout?.href || null, p.description]);
  await audit(userId, c.id, "betaling.factuurlink", { invoice: inv.number, payment: p.id });
  return { checkoutUrl: p._links?.checkout?.href, paymentId: p.id };
}

async function createSubscription(c, mandateId, startDate) {
  const s = await getSettings();
  const parts = priceParts(c.monthly_cents, s.billing);
  const start = startDate && startDate > dayKey() ? startDate : addMonths(dayKey(), 1);
  const sub = await api("POST", `/customers/${c.mollie_customer_id}/subscriptions`, {
    amount: { currency: "EUR", value: centsToMollie(parts.gross) },
    interval: "1 month", startDate: start,
    description: `Sitemaker abonnement ${c.company} #${c.id}`.slice(0, 255),
    mandateId: mandateId || undefined, webhookUrl: webhookUrl(),
    metadata: { sitemakerCustomerId: c.id, kind: "abonnement" },
  });
  await q("UPDATE customers SET mollie_subscription_id = $1, mollie_mandate_id = $2, subscription_start = $3, billing_status = 'actief', updated_at = NOW() WHERE id = $4",
    [sub.id, mandateId || null, start, c.id]);
  return sub;
}

// Webhook: Mollie stuurt alleen een id; we halen de betaling altijd zelf op (dus niet te vervalsen).
export async function handleWebhook(paymentId) {
  if (!/^tr_[A-Za-z0-9]+$/.test(paymentId || "")) return { ignored: true };
  const p = await api("GET", `/payments/${paymentId}`);
  const meta = p.metadata || {};
  let local = await one("SELECT * FROM payments WHERE mollie_payment_id = $1", [p.id]);
  const customerId = local?.customer_id || Number(meta.sitemakerCustomerId) ||
    (await one("SELECT id FROM customers WHERE mollie_customer_id = $1", [p.customerId]))?.id;
  if (!customerId) return { ignored: true, reason: "onbekende klant" };
  const kind = local?.kind || (p.subscriptionId ? "abonnement" : meta.kind || "factuur");
  const amount = Math.round(Number(p.amount?.value || 0) * 100);

  const prevStatus = local?.status || null;
  if (!local) {
    local = await one(`INSERT INTO payments (customer_id, mollie_payment_id, kind, amount_cents, status, method, description)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (mollie_payment_id) DO UPDATE SET updated_at = NOW() RETURNING *`,
      [customerId, p.id, kind, amount, p.status, p.method || null, p.description || ""]);
  }
  const wasPaid = prevStatus === "paid";
  await q("UPDATE payments SET status = $1, method = $2, paid_at = $3, updated_at = NOW() WHERE id = $4",
    [p.status, p.method || null, p.paidAt || null, local.id]);
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);

  if (p.status === "paid" && !wasPaid) {
    const s = await getSettings();
    let invoiceId = local.invoice_id;
    if (kind === "factuur" && invoiceId) {
      await q("UPDATE invoices SET status = 'betaald', paid_at = $2, updated_at = NOW() WHERE id = $1", [invoiceId, p.paidAt || new Date().toISOString()]);
    } else if (s.billing.autoInvoices !== false && !(await one("SELECT id FROM invoices WHERE mollie_payment_id = $1", [p.id]))) {
      const rate = Number(s.billing.vatRate || 21);
      const vat = Math.round((amount * rate) / (100 + rate));
      const desc = kind === "eerste" ? `Bouw website (eenmalig)` : `Abonnement Sitemaker: hosting en 4 wijzigingen per maand (${monthLabel(p.paidAt || p.createdAt)})`;
      const inv = await createInvoice({ customerId, description: desc, parts: { gross: amount, vat, net: amount - vat }, status: "betaald", source: "mollie", molliePaymentId: p.id, paidAt: p.paidAt || new Date().toISOString() });
      invoiceId = inv.id;
      await q("UPDATE payments SET invoice_id = $1 WHERE id = $2", [inv.id, local.id]);
      try { const g = await generateInvoicePdf(inv.id); if (g.ok) await mailInvoice(inv.id); } catch (e) { console.log("[mollie] pdf/mail", e.message); }
    }
    if (kind === "eerste" && !c.mollie_subscription_id) {
      try {
        await createSubscription(c, p.mandateId, meta.startDate || c.subscription_start);
        await audit(null, c.id, "abonnement.gestart", { payment: p.id });
        await notifyStaff(`Betaling ontvangen: ${c.company}`, [`${c.company} heeft de eerste betaling (${euro(amount)}) voldaan. Het maandabonnement is aangemaakt.`], `/hq/#klant/${c.id}`);
      } catch (e) {
        await q("UPDATE customers SET billing_status = 'betaling_mislukt' WHERE id = $1", [c.id]);
        await notifyStaff(`Abonnement niet aangemaakt: ${c.company}`, [`De eerste betaling is binnen, maar het abonnement kon niet worden aangemaakt: ${e.message}`], `/hq/#klant/${c.id}`);
      }
    } else if (kind === "abonnement" && c.billing_status === "betaling_mislukt") {
      await q("UPDATE customers SET billing_status = 'actief', updated_at = NOW() WHERE id = $1", [c.id]);
    }
  }
  if (["failed", "expired", "canceled"].includes(p.status) && prevStatus !== p.status) {
    if (kind === "abonnement" || (kind === "eerste" && c.billing_status === "wacht_op_betaling" && p.status === "failed")) {
      if (kind === "abonnement") await q("UPDATE customers SET billing_status = 'betaling_mislukt', updated_at = NOW() WHERE id = $1", [c.id]);
      await notifyStaff(`Betaling mislukt: ${c.company}`, [`Een ${kind === "abonnement" ? "maandtermijn" : "eerste betaling"} van ${euro(amount)} is ${p.status === "failed" ? "mislukt" : p.status === "expired" ? "verlopen" : "geannuleerd"}.`], `/hq/#klant/${c.id}`);
    }
  }
  return { ok: true, status: p.status };
}

const monthLabel = (iso) => new Date(iso || Date.now()).toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

export async function subscriptionInfo(c) {
  if (!c.mollie_customer_id || !c.mollie_subscription_id || !mollieReady()) return null;
  try {
    const sub = await api("GET", `/customers/${c.mollie_customer_id}/subscriptions/${c.mollie_subscription_id}`);
    return { status: sub.status, nextPaymentDate: sub.nextPaymentDate || null, amount: sub.amount?.value, startDate: sub.startDate, canceledAt: sub.canceledAt || null };
  } catch (e) { return { error: e.message }; }
}

export async function cancelSubscription(customerId, userId) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c?.mollie_subscription_id) fail(400, "Deze klant heeft geen abonnement bij Mollie.");
  await api("DELETE", `/customers/${c.mollie_customer_id}/subscriptions/${c.mollie_subscription_id}`);
  await q("UPDATE customers SET billing_status = 'opgezegd', updated_at = NOW() WHERE id = $1", [c.id]);
  await audit(userId, c.id, "abonnement.opgezegd", {});
  return { ok: true };
}

// Mail met de betaallink naar de klant.
export async function mailPaymentLink(customerId, checkoutUrl, amountCents) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c?.email) fail(400, "Deze klant heeft geen e-mailadres.");
  return sendMail({
    to: c.email, kind: "betaallink", ref: `customer:${c.id}`,
    subject: "Start je Sitemaker-abonnement",
    text: `Beste ${c.contact_name || c.company},\n\nVia deze link betaal je de eenmalige bouwprijs (${euro(amountCents)}) en geef je toestemming voor de automatische maandbetaling van het abonnement:\n${checkoutUrl}\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Start je Sitemaker-abonnement",
      intro: [`Beste ${escH(c.contact_name || c.company)},`, `Via de knop hieronder betaal je de eenmalige bouwprijs van <b>${euro(amountCents)}</b>. Daarmee geef je ook toestemming voor de automatische maandbetaling van je abonnement (hosting en vier wijzigingen per maand).`],
      button: { label: "Betalen", href: checkoutUrl },
      after: ["De betaling loopt veilig via Mollie. Na betaling vind je de factuur in je klantenportaal."],
    }),
  });
}

// ---------------------------------------------------------------- nep-Mollie voor lokale tests (MOLLIE_FAKE=1)
const fake = globalThis.__mollieFake || (globalThis.__mollieFake = { payments: {}, subs: {}, n: 0 });
function fakeApi(method, path, body) {
  const id = (p) => `${p}_${(++fake.n).toString(36)}TEST`;
  if (method === "POST" && path === "/customers") return { id: id("cst"), ...body };
  if (method === "POST" && path === "/payments") {
    const p = { id: id("tr"), status: "open", ...body, createdAt: new Date().toISOString(), _links: { checkout: { href: "https://www.mollie.com/checkout/test" } } };
    fake.payments[p.id] = p; return p;
  }
  if (method === "GET" && path.startsWith("/payments/")) return fake.payments[path.split("/")[2]];
  if (method === "POST" && /subscriptions$/.test(path)) { const s = { id: id("sub"), status: "active", nextPaymentDate: body.startDate, ...body }; fake.subs[s.id] = s; return s; }
  if (method === "GET" && /subscriptions\//.test(path)) return fake.subs[path.split("/").pop()];
  if (method === "DELETE" && /subscriptions\//.test(path)) { const s = fake.subs[path.split("/").pop()]; if (s) s.status = "canceled"; return s || {}; }
  return {};
}
export const __fake = fake;
