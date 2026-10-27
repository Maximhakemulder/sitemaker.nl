// Klantenportaal. Elke query filtert op de customer_id van de ingelogde gebruiker.
import crypto from "node:crypto";
import { q, one, tx, OFFER, monthKey, str, fail, audit, euro, escH, publicBase, getSettings, portalUrl } from "./core.mjs";
import { putFile, getFile, fileResponse, ALLOWED_UPLOADS, MAX_UPLOAD, sniffOk, safeName } from "./files.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";
import { betaalReady } from "./betalen.mjs";
import { queueChange, autoReady } from "./sites.mjs";
import { startState } from "./start.mjs";

export const STATUS_LABEL = { ontvangen: "Ontvangen", in_behandeling: "In behandeling", verwerkt: "Verwerkt", afgewezen: "Niet uitgevoerd" };

export async function changeUsage(customerId, month = monthKey(), t = null) {
  const run = t || { one };
  const r = await run.one("SELECT COUNT(*)::int AS n FROM change_requests WHERE customer_id = $1 AND month = $2 AND counts = TRUE", [customerId, month]);
  const used = r?.n || 0;
  return { month, used, limit: OFFER.changesPerMonth, left: Math.max(0, OFFER.changesPerMonth - used) };
}

export async function freeSlot(t, customerId, month) {
  const r = await t.one(`SELECT s FROM generate_series(1, $3::int) s WHERE s NOT IN
    (SELECT slot FROM change_requests WHERE customer_id = $1 AND month = $2 AND slot IS NOT NULL) ORDER BY s LIMIT 1`, [customerId, month, OFFER.changesPerMonth]);
  return r?.s || null;
}

// Feedbackrondes: na livegang tellen de eerste 2 wijzigingen niet mee voor de 4 per maand (besluit Maxim, 27-10-2026).
export const FEEDBACK_RONDES = 2;
export async function feedbackRondes(c, t = null) {
  if (!c?.delivered_at) return 0;
  const run = t || { one };
  const r = await run.one("SELECT COUNT(*)::int AS n FROM change_requests WHERE customer_id = $1 AND oplever", [c.id]);
  return Math.max(0, FEEDBACK_RONDES - (r?.n || 0));
}

// Mag deze klant (nog) wijzigingen indienen?
export function canSubmit(c) {
  if (c.site_status === "opgezegd" || c.billing_status === "opgezegd") return { ok: false, reason: "Je abonnement is opgezegd. Neem contact met ons op als je nog iets wilt laten aanpassen." };
  if (c.site_status === "gepauzeerd" || c.billing_status === "gepauzeerd") return { ok: false, reason: "Je abonnement staat gepauzeerd. Neem contact met ons op." };
  return { ok: true };
}

export function publicCustomer(c) {
  return {
    id: c.id, company: c.company, siteNaam: c.site_naam, contactName: c.contact_name, email: c.email, siteUrl: c.site_url,
    siteStatus: c.site_status, deliveredAt: c.delivered_at, billingStatus: c.billing_status,
    monthlyCents: c.monthly_cents, buildCents: c.build_cents, subscriptionStart: c.subscription_start,
    online: c.check_at ? { ok: c.check_ok, at: c.check_at } : null,
  };
}

export const publicChange = (r) => ({
  id: r.id, page: r.page, description: r.description, status: r.status, statusLabel: STATUS_LABEL[r.status],
  month: r.month, counts: r.counts, staffNote: r.staff_note, createdAt: r.created_at, doneAt: r.done_at,
  attachment: r.attachment_key ? { name: r.attachment_name, type: r.attachment_type, size: r.attachment_size } : null,
  dueAt: new Date(new Date(r.created_at).getTime() + OFFER.changeHours * 3600000).toISOString(),
});
export const publicInvoice = (i) => ({
  id: i.id, number: i.number, date: i.invoice_date, dueDate: i.due_date, description: i.description,
  amountCents: i.amount_cents, vatCents: i.vat_cents, status: i.status, hasPdf: !!i.pdf_key, paidAt: i.paid_at,
});

export async function portalState(user) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
  if (!c) fail(404, "Klant niet gevonden.");
  const [usage, changes, invoices, openPay, dom] = await Promise.all([
    changeUsage(c.id),
    q("SELECT * FROM change_requests WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100", [c.id]),
    q("SELECT * FROM invoices WHERE customer_id = $1 ORDER BY invoice_date DESC, id DESC LIMIT 200", [c.id]),
    one("SELECT checkout_url, amount_cents FROM payments WHERE customer_id = $1 AND kind = 'eerste' AND status = 'open' AND checkout_url IS NOT NULL ORDER BY id DESC LIMIT 1", [c.id]),
    one("SELECT 1 AS x FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' LIMIT 1", [c.id]),
  ]);
  return {
    user: { email: user.email, name: user.name, role: user.role, viaHq: !!user.viaHq },
    customer: publicCustomer(c),
    offer: OFFER,
    usage, canSubmit: canSubmit(c), feedbackRondes: await feedbackRondes(c),
    changes: changes.map(publicChange),
    invoices: invoices.map(publicInvoice),
    payOnline: betaalReady(),
    bank: betaalReady() ? null : await (async () => { const co = (await getSettings()).company || {}; return co.iban ? { iban: co.iban, naam: co.legalName || co.name || "Sitemaker" } : null; })(),
    start: await startState(c),
    websites: await (await import("./websites.mjs")).listWebsites(user),
    domeinGekozen: !!dom || (!!c.site_url && !/\.netlify\.app/.test(c.site_url)),
    opzegging: c.opzeg_status === "aangevraagd" ? c.opzeg_einde : null,
    pendingFirstPayment: openPay && !c.onboarding ? { url: openPay.checkout_url, amountCents: openPay.amount_cents } : null,
  };
}

// Wijziging indienen (multipart/form-data: description, page, file).
export async function submitChange(user, form) {
  const description = str(form.get("description"), 4000);
  const page = str(form.get("page"), 200);
  if (description.length < 10) fail(400, "Beschrijf in een paar zinnen wat er aangepast moet worden (minimaal 10 tekens).", { field: "description" });
  const file = form.get("file");
  let upload = null;
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > MAX_UPLOAD) fail(400, "Het bestand is groter dan 4 MB. Kies een kleiner bestand of stuur een link mee in je omschrijving.", { field: "file" });
    const type = String(file.type || "").toLowerCase();
    if (!ALLOWED_UPLOADS[type]) fail(400, "Dit bestandstype kunnen we niet aannemen. Gebruik een afbeelding (JPG, PNG, WebP, GIF, SVG), PDF, Word- of tekstbestand.", { field: "file" });
    const buf = Buffer.from(await file.arrayBuffer());
    if (!sniffOk(buf, type)) fail(400, "Het bestand lijkt beschadigd of is niet wat de extensie zegt.", { field: "file" });
    upload = { buf, type, name: safeName(file.name), size: buf.length };
  }
  const month = monthKey();
  let res;
  for (let attempt = 0; attempt < 3 && !res; attempt++) {
    try {
      res = await tx(async (t) => {
        // Eén indiening tegelijk per klant; daarnaast bewaakt de unieke 'slot' (1-4) in de database de grens.
        await t.q("SELECT pg_advisory_xact_lock(1001, $1)", [user.customer_id]);
        const c = await t.one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
        const allowed = canSubmit(c);
        if (!allowed.ok) fail(403, allowed.reason);
        const usage = await changeUsage(c.id, month, t);
        if (await feedbackRondes(c, t)) {
          const row = await t.one(`INSERT INTO change_requests (customer_id, user_id, page, description, month, slot, counts, oplever) VALUES ($1,$2,$3,$4,$5,NULL,FALSE,TRUE) RETURNING *`,
            [c.id, user.id, page, description, month]);
          return { c, row, usage };
        }
        const slot = await freeSlot(t, c.id, month);
        if (!slot) fail(409, `Je hebt deze maand al ${usage.limit} wijzigingen doorgegeven. Volgende maand kun je weer nieuwe wijzigingen indienen. Is het dringend? Neem dan contact met ons op.`);
        const row = await t.one(`INSERT INTO change_requests (customer_id, user_id, page, description, month, slot) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [c.id, user.id, page, description, month, slot]);
        const after = await changeUsage(c.id, month, t);
        return { c, row, usage: after };
      });
    } catch (e) {
      if (e.code !== "23505") throw e; // plek net door een andere indiening ingenomen: opnieuw proberen
    }
  }
  if (!res) fail(409, `Je hebt deze maand al ${OFFER.changesPerMonth} wijzigingen doorgegeven.`);
  if (upload) {
    const key = `changes/${res.c.id}/${res.row.id}-${crypto.randomUUID()}`;
    try {
      await putFile(key, upload.buf, { type: upload.type, name: upload.name });
      await q("UPDATE change_requests SET attachment_key = $1, attachment_name = $2, attachment_type = $3, attachment_size = $4 WHERE id = $5",
        [key, upload.name, upload.type, upload.size, res.row.id]);
      Object.assign(res.row, { attachment_key: key, attachment_name: upload.name, attachment_type: upload.type, attachment_size: upload.size });
    } catch (e) {
      console.log("[portal] upload mislukt", e.message);
      res.uploadFailed = true;
    }
  }
  await audit(user.id, res.c.id, "wijziging.ingediend", { id: res.row.id });
  if (autoReady()) await queueChange(res.row.id).catch((e) => console.log("[ai] wachtrij", e.message));
  const pending = [];
  pending.push(notifyStaff(`Nieuwe wijziging: ${res.c.company}`, [`${res.c.company} heeft een wijziging doorgegeven${page ? ` (pagina: ${page})` : ""}:`, description.slice(0, 600), `Te verwerken binnen ${OFFER.changeHours} uur.`], `/hq/#wijzigingen/${res.row.id}`).catch(() => {}));
  pending.push(sendMail({
    to: user.email, kind: "wijziging-ontvangen", ref: `change:${res.row.id}`,
    subject: "We hebben je wijziging ontvangen",
    text: `We hebben je wijziging ontvangen en verwerken die binnen ${OFFER.changeHours} uur.\n\nJouw omschrijving:\n${description}\n\nJe kunt de status volgen in je klantenportaal: ${portalUrl()}#wijzigingen\n\nDeze maand heb je nog ${res.usage.left} van de ${res.usage.limit} wijzigingen over.`,
    html: brandHtml({
      title: "We hebben je wijziging ontvangen",
      intro: [`We verwerken je wijziging binnen <b>${OFFER.changeHours} uur</b>. Je krijgt een mail zodra hij klaar is.`, `<i>${escH(description.slice(0, 800)).replace(/\n/g, "<br>")}</i>`, `Deze maand heb je nog <b>${res.usage.left} van de ${res.usage.limit}</b> wijzigingen over.`],
      button: { label: "Bekijk de status", href: `${portalUrl()}#wijzigingen` },
    }),
  }).catch(() => {}));
  await Promise.allSettled(pending);
  return { change: publicChange(res.row), usage: res.usage, uploadFailed: !!res.uploadFailed };
}

export async function changeAttachment(user, id, staff = false) {
  const r = await one("SELECT * FROM change_requests WHERE id = $1", [id]);
  if (!r || (!staff && r.customer_id !== user.customer_id) || !r.attachment_key) fail(404, "Bestand niet gevonden.");
  const buf = await getFile(r.attachment_key);
  if (!buf) fail(404, "Bestand niet gevonden.");
  return fileResponse(buf, { name: r.attachment_name, type: r.attachment_type, inline: false });
}

export async function invoicePdf(user, id, { staff = false, inline = false } = {}) {
  const i = await one("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!i || (!staff && i.customer_id !== user.customer_id)) fail(404, "Factuur niet gevonden.");
  if (!i.pdf_key) fail(404, "Het factuurbestand is nog niet beschikbaar.");
  const buf = await getFile(i.pdf_key);
  if (!buf) fail(404, "Het factuurbestand is nog niet beschikbaar.");
  return fileResponse(buf, { name: `Factuur-${i.number}.pdf`, type: "application/pdf", inline });
}

// Mail naar de klant als een wijziging klaar is (of niet wordt uitgevoerd).
export async function mailChangeStatus(changeId) {
  const r = await one(`SELECT cr.*, c.company, c.contact_name, COALESCE(u.email, c.email) AS to_email FROM change_requests cr
                       JOIN customers c ON c.id = cr.customer_id LEFT JOIN users u ON u.id = cr.user_id WHERE cr.id = $1`, [changeId]);
  if (!r?.to_email) return { ok: false };
  const done = r.status === "verwerkt";
  const title = done ? "Je wijziging is verwerkt" : "Over je wijzigingsverzoek";
  const lines = done
    ? ["Je wijziging staat online. Bekijk het resultaat op je website.", r.staff_note ? `Toelichting: ${escH(r.staff_note)}` : ""]
    : ["We hebben je verzoek bekeken maar kunnen het niet zo uitvoeren.", r.staff_note ? `Toelichting: ${escH(r.staff_note)}` : "", r.counts ? "" : "Deze aanvraag telt niet mee voor je vier wijzigingen van deze maand."];
  return sendMail({
    to: r.to_email, kind: "wijziging-status", ref: `change:${r.id}`, subject: title,
    text: `${lines.filter(Boolean).join("\n\n").replace(/<[^>]+>/g, "")}\n\nJouw verzoek:\n${r.description}\n\n${portalUrl()}#wijzigingen`,
    html: brandHtml({ title, intro: [...lines.filter(Boolean), `<i>${escH(r.description.slice(0, 600)).replace(/\n/g, "<br>")}</i>`], button: { label: "Open je portaal", href: `${portalUrl()}#wijzigingen` } }),
  });
}

export { euro };
