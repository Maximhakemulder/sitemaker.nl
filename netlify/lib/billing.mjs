// Facturen: nummering, btw, PDF in huisstijl en versturen.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { q, one, getSettings, euro, dayKey, addDays, escH, publicBase, fail } from "./core.mjs";
import { putFile } from "./files.mjs";
import { sendMail, brandHtml } from "./mail.mjs";
import { LOGO_PNG_B64 } from "./logo-pdf.mjs";

// Bedrag uit het aanbod (bijv. 6995) omzetten naar wat de klant betaalt, afhankelijk van de btw-instelling.
export function priceParts(baseCents, billing) {
  const rate = Number(billing.vatRate ?? 21);
  if (billing.pricesIncludeVat === true) {
    const vat = Math.round((baseCents * rate) / (100 + rate));
    return { gross: baseCents, vat, net: baseCents - vat, rate };
  }
  if (billing.pricesIncludeVat === false) {
    const vat = Math.round((baseCents * rate) / 100);
    return { gross: baseCents + vat, vat, net: baseCents, rate };
  }
  return null; // nog niet ingesteld
}
// Voor een handmatige factuur waarbij het totaalbedrag (incl. btw) wordt ingevoerd.
export function partsFromGross(grossCents, rate) {
  const vat = Math.round((grossCents * rate) / (100 + rate));
  return { gross: grossCents, vat, net: grossCents - vat, rate };
}

export function companyComplete(c) {
  return !!(c.legalName || c.name) && !!c.address && !!c.postcode && !!c.city && !!c.kvk && !!c.vat && !!c.iban;
}
export function vatModeSet(s) { return s.billing.pricesIncludeVat === true || s.billing.pricesIncludeVat === false; }

export async function nextInvoiceNumber(t, prefix) {
  const { n } = await (t?.one || one)("SELECT nextval('invoice_number_seq')::int AS n");
  const year = dayKey().slice(0, 4);
  return `${prefix || "SM"}-${year}-${String(n).padStart(4, "0")}`;
}

// Maakt een factuur aan. lines: [{ description, net, vat, gross }]. Maakt een PDF als de bedrijfsgegevens compleet zijn.
export async function createInvoice({ customerId, description, parts, status = "open", source = "handmatig", molliePaymentId = null, date = dayKey(), paidAt = null, t = null }) {
  const s = await getSettings();
  const run = t || { q, one };
  const number = await nextInvoiceNumber(run, s.billing.invoicePrefix);
  const due = addDays(date, Number(s.billing.paymentTermDays || 14));
  const inv = await run.one(
    `INSERT INTO invoices (customer_id, number, invoice_date, due_date, description, amount_cents, vat_cents, status, source, mollie_payment_id, paid_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [customerId, number, date, due, description, parts.gross, parts.vat, status, source, molliePaymentId, paidAt]);
  return inv;
}

// PDF maken en koppelen (los van createInvoice, zodat een fout in de PDF de factuur niet tegenhoudt).
export async function generateInvoicePdf(invoiceId) {
  const s = await getSettings();
  if (!companyComplete(s.company)) return { ok: false, reason: "Vul eerst de bedrijfsgegevens in bij Instellingen (naam, adres, KvK, btw-nummer, IBAN)." };
  const inv = await one("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  const c = await one("SELECT * FROM customers WHERE id = $1", [inv.customer_id]);
  const bytes = await renderPdf(inv, c, s);
  const key = `invoices/${inv.customer_id}/${inv.id}-${inv.number}.pdf`;
  await putFile(key, Buffer.from(bytes), { type: "application/pdf" });
  await q("UPDATE invoices SET pdf_key = $1, updated_at = NOW() WHERE id = $2", [key, inv.id]);
  return { ok: true, key };
}

const NAVY = rgb(28 / 255, 7 / 255, 71 / 255), CORAL = rgb(1, 87 / 255, 87 / 255), GREY = rgb(0.38, 0.36, 0.47), ICE = rgb(231 / 255, 244 / 255, 1);
const fmtDate = (d) => new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

async function renderPdf(inv, c, s) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factuur ${inv.number}`);
  pdf.setAuthor(s.company.legalName || s.company.name);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_B64, "base64"));
  const W = page.getWidth();
  const L = 50, R = W - 50;
  const text = (t, x, y, o = {}) => page.drawText(String(t ?? ""), { x, y, size: o.size || 10, font: o.bold ? bold : font, color: o.color || NAVY });
  const right = (t, x, y, o = {}) => { const f = o.bold ? bold : font; const w = f.widthOfTextAtSize(String(t), o.size || 10); text(t, x - w, y, o); };

  page.drawRectangle({ x: 0, y: 841.89 - 8, width: W, height: 8, color: CORAL });
  const lw = 170, lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: L, y: 770 - lh / 2, width: lw, height: lh });
  right("FACTUUR", R, 772, { size: 20, bold: true });
  right(inv.number, R, 755, { size: 11, color: GREY });

  // Afzender
  const co = s.company;
  let y = 700;
  [co.legalName || co.name, co.address, `${co.postcode} ${co.city}`, `KvK ${co.kvk}`, `Btw ${co.vat}`, co.email, co.phone].filter((x) => x && x.trim() && x.trim() !== "KvK" && x.trim() !== "Btw")
    .forEach((line, i) => { right(line, R, y - i * 13, { size: 9, color: i === 0 ? NAVY : GREY, bold: i === 0 }); });

  // Klant
  text("Factuur aan", L, y, { size: 9, color: GREY });
  const cl = [c.company, c.contact_name ? `t.a.v. ${c.contact_name}` : "", ...(c.address || "").split(/\n/), c.kvk ? `KvK ${c.kvk}` : "", c.vat_number ? `Btw ${c.vat_number}` : ""].filter(Boolean);
  cl.forEach((line, i) => text(line, L, y - 15 - i * 13, { size: 10, bold: i === 0 }));

  // Data
  y = 580;
  page.drawRectangle({ x: L, y: y - 12, width: R - L, height: 40, color: ICE });
  [["Factuurdatum", fmtDate(inv.invoice_date)], ["Vervaldatum", inv.due_date ? fmtDate(inv.due_date) : "-"], ["Status", inv.status === "betaald" ? "Betaald" : "Open"]]
    .forEach(([k, v], i) => { const x = L + 12 + i * 165; text(k, x, y + 12, { size: 8, color: GREY }); text(v, x, y - 2, { size: 10, bold: true }); });

  // Regels
  y = 520;
  text("Omschrijving", L, y, { size: 9, color: GREY, bold: true });
  right("Bedrag excl. btw", R, y, { size: 9, color: GREY, bold: true });
  page.drawLine({ start: { x: L, y: y - 6 }, end: { x: R, y: y - 6 }, thickness: 0.8, color: NAVY });
  const net = inv.amount_cents - inv.vat_cents;
  const desc = wrap(inv.description || "Sitemaker", font, 10, 330);
  desc.forEach((d, i) => text(d, L, y - 24 - i * 13));
  right(euro(net), R, y - 24);
  y = y - 24 - desc.length * 13 - 14;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: GREY });
  const rate = net > 0 ? Math.round((inv.vat_cents / net) * 100) : Number(s.billing.vatRate || 21);
  y -= 18; text("Subtotaal", 330, y); right(euro(net), R, y);
  y -= 16; text(`Btw ${rate}%`, 330, y); right(euro(inv.vat_cents), R, y);
  y -= 8; page.drawLine({ start: { x: 330, y }, end: { x: R, y }, thickness: 0.8, color: NAVY });
  y -= 18; text("Totaal", 330, y, { bold: true, size: 12 }); right(euro(inv.amount_cents), R, y, { bold: true, size: 12 });

  // Betaling
  y -= 50;
  const payLine = inv.status === "betaald"
    ? `Dit bedrag is voldaan${inv.paid_at ? " op " + fmtDate(new Date(inv.paid_at).toISOString()) : ""}. U hoeft niets te doen.`
    : `Graag betalen vóór ${inv.due_date ? fmtDate(inv.due_date) : "de vervaldatum"} op ${co.iban} t.n.v. ${co.legalName || co.name}, o.v.v. ${inv.number}.`;
  wrap(payLine, font, 10, R - L).forEach((l, i) => text(l, L, y - i * 13));

  page.drawRectangle({ x: 0, y: 0, width: W, height: 36, color: NAVY });
  text("Sitemaker · Maak van je website je beste verkoper", L, 14, { size: 8, color: rgb(1, 1, 1) });
  right(co.website || "sitemaker.nl", R, 14, { size: 8, color: rgb(12 / 255, 192 / 255, 223 / 255) });
  return pdf.save();
}

function wrap(t, font, size, width) {
  const words = String(t).split(/\s+/); const lines = []; let cur = "";
  for (const w of words) { const n = cur ? cur + " " + w : w; if (font.widthOfTextAtSize(n, size) > width && cur) { lines.push(cur); cur = w; } else cur = n; }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// Mail naar de klant dat er een factuur in het portaal staat.
export async function mailInvoice(invoiceId) {
  const inv = await one("SELECT i.*, c.company, c.email AS customer_email, c.contact_name FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1", [invoiceId]);
  if (!inv) fail(404, "Factuur niet gevonden.");
  const to = inv.customer_email || (await one("SELECT email FROM users WHERE customer_id = $1 AND active ORDER BY id LIMIT 1", [inv.customer_id]))?.email;
  if (!to) fail(400, "Deze klant heeft geen e-mailadres.");
  const link = `${publicBase()}/portaal/#facturen`;
  const paid = inv.status === "betaald";
  const res = await sendMail({
    to, kind: "factuur", ref: `invoice:${inv.id}`,
    subject: `Factuur ${inv.number} van Sitemaker`,
    text: `Beste ${inv.contact_name || inv.company},\n\nFactuur ${inv.number} (${euro(inv.amount_cents)}) staat voor je klaar in je klantenportaal: ${link}\n\n${paid ? "Dit bedrag is al voldaan." : "Je vindt daar ook de betaalgegevens."}\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: `Factuur ${inv.number}`,
      intro: [`Beste ${escH(inv.contact_name || inv.company)},`, `Factuur <b>${escH(inv.number)}</b> van ${euro(inv.amount_cents)} staat voor je klaar in je klantenportaal.`, paid ? "Dit bedrag is al voldaan; je hoeft niets te doen." : "Daar vind je ook de betaalgegevens."],
      button: { label: "Bekijk factuur", href: link },
    }),
  });
  if (res.ok) await q("UPDATE invoices SET sent_at = NOW() WHERE id = $1", [inv.id]);
  return res;
}
