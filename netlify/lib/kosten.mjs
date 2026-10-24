// Finance (Bram): kosten invullen, winst per maand en een export voor de boekhouder.
// Bedragen in centen, kosten exclusief btw. Omzet = betaalde facturen (exclusief btw).
import { q, one, str, fail, audit, euro } from "./core.mjs";

export const CATEGORIEEN = { software: "Software en tools", hosting: "Hosting", ai: "AI (Claude)", marketing: "Marketing en advertenties", domeinen: "Domeinen", overig: "Overig" };
const ym = (d) => d.toISOString().slice(0, 7);
const cents = (v) => { const n = Math.round(Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) * 100); return Number.isFinite(n) ? n : NaN; };

const publicCost = (c) => ({ id: c.id, omschrijving: c.omschrijving, leverancier: c.leverancier, categorie: c.categorie, soort: c.soort, bedragCents: c.bedrag_cents, btwCents: c.btw_cents, datum: c.datum, tot: c.tot });

export async function listCosts() { return (await q("SELECT * FROM costs ORDER BY soort <> 'maandelijks', datum DESC, id DESC")).map(publicCost); }

export async function saveCost(id, b, user) {
  const omschrijving = str(b.omschrijving, 160);
  if (omschrijving.length < 2) fail(400, "Vul een omschrijving in, bijvoorbeeld Netlify Pro.", { field: "omschrijving" });
  const bedrag = cents(b.bedrag), btw = b.btw === "" || b.btw == null ? 0 : cents(b.btw);
  if (!(bedrag > 0)) fail(400, "Vul het bedrag exclusief btw in, bijvoorbeeld 19,00.", { field: "bedrag" });
  if (!(btw >= 0)) fail(400, "Het btw-bedrag klopt niet.", { field: "btw" });
  const soort = ["maandelijks", "jaarlijks", "eenmalig"].includes(b.soort) ? b.soort : "maandelijks";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.datum || "")) fail(400, "Kies een datum.", { field: "datum" });
  const tot = /^\d{4}-\d{2}-\d{2}$/.test(b.tot || "") ? b.tot : null;
  const vals = [omschrijving, str(b.leverancier, 120), CATEGORIEEN[b.categorie] ? b.categorie : "overig", soort, bedrag, btw, b.datum, soort === "eenmalig" ? null : tot];
  const r = id
    ? await one("UPDATE costs SET omschrijving=$1, leverancier=$2, categorie=$3, soort=$4, bedrag_cents=$5, btw_cents=$6, datum=$7, tot=$8 WHERE id=$9 RETURNING *", [...vals, id])
    : await one("INSERT INTO costs (omschrijving, leverancier, categorie, soort, bedrag_cents, btw_cents, datum, tot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", vals);
  if (!r) fail(404, "Kostenpost niet gevonden.");
  await audit(user.id, null, id ? "kosten.aangepast" : "kosten.toegevoegd", { omschrijving, bedrag });
  return { cost: publicCost(r) };
}
export async function deleteCost(id, user) {
  await q("DELETE FROM costs WHERE id = $1", [id]);
  await audit(user.id, null, "kosten.verwijderd", { id });
  return { ok: true };
}

// Kosten van één post in een maand (YYYY-MM): maandelijks elke maand in de looptijd, jaarlijks in de maand van de startdatum, eenmalig in zijn maand.
function kostInMaand(c, maand) {
  const start = ym(new Date(c.datum)), eind = c.tot ? ym(new Date(c.tot)) : "9999-12";
  if (c.soort === "eenmalig") return start === maand ? c.bedrag_cents : 0;
  if (maand < start || maand > eind) return 0;
  if (c.soort === "jaarlijks") return maand.slice(5) === start.slice(5) ? c.bedrag_cents : 0;
  return c.bedrag_cents;
}

export async function overzicht({ maanden = 12 } = {}) {
  const now = new Date();
  const lijst = [];
  for (let i = maanden - 1; i >= 0; i--) lijst.push(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const omzet = Object.fromEntries((await q(`SELECT to_char(COALESCE(paid_at, invoice_date::timestamptz) AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM') AS m, SUM(amount_cents - vat_cents)::int AS excl, SUM(vat_cents)::int AS btw
                                             FROM invoices WHERE status = 'betaald' GROUP BY 1`)).map((r) => [r.m, r]));
  const costs = await q("SELECT * FROM costs");
  const rows = lijst.map((m) => {
    const perCat = {};
    for (const c of costs) { const v = kostInMaand(c, m); if (v) perCat[c.categorie] = (perCat[c.categorie] || 0) + v; }
    const kosten = Object.values(perCat).reduce((a, b) => a + b, 0);
    const o = omzet[m]?.excl || 0;
    return { maand: m, omzet: o, kosten, winst: o - kosten, perCat };
  });
  const huidig = rows[rows.length - 1];
  const mrr = (await one("SELECT COALESCE(SUM(monthly_cents),0)::int AS n FROM customers WHERE billing_status IN ('actief','handmatig')")).n;
  const vasteKosten = costs.filter((c) => c.soort === "maandelijks" && (!c.tot || new Date(c.tot) >= now) && new Date(c.datum) <= now).reduce((a, c) => a + c.bedrag_cents, 0)
    + Math.round(costs.filter((c) => c.soort === "jaarlijks" && (!c.tot || new Date(c.tot) >= now)).reduce((a, c) => a + c.bedrag_cents, 0) / 12);
  return { maanden: rows, huidig, mrr, vasteKostenPerMaand: vasteKosten, categorieen: CATEGORIEEN };
}

// CSV voor de boekhouder: facturen en kosten van een kwartaal (of jaar).
const csvCel = (v) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const bedragNl = (c) => (Number(c || 0) / 100).toFixed(2).replace(".", ",");
export async function exportCsv({ jaar, kwartaal }) {
  const y = Number(jaar), k = Number(kwartaal || 0);
  if (!(y > 2000 && y < 2100)) fail(400, "Kies een jaar.");
  const van = k ? `${y}-${String((k - 1) * 3 + 1).padStart(2, "0")}-01` : `${y}-01-01`;
  const tot = k ? (k === 4 ? `${y + 1}-01-01` : `${y}-${String(k * 3 + 1).padStart(2, "0")}-01`) : `${y + 1}-01-01`;
  const inv = await q(`SELECT i.*, c.company, c.kvk, c.vat_number FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.invoice_date >= $1 AND i.invoice_date < $2 ORDER BY i.invoice_date, i.number`, [van, tot]);
  const costs = await q("SELECT * FROM costs");
  const regels = [["Soort", "Datum", "Nummer", "Relatie", "KvK", "Btw-nummer", "Omschrijving", "Categorie", "Bedrag excl. btw", "Btw", "Bedrag incl. btw", "Status"].join(";")];
  for (const i of inv) regels.push(["Verkoop", i.invoice_date, i.number, i.company, i.kvk, i.vat_number, i.description, "omzet", bedragNl(i.amount_cents - i.vat_cents), bedragNl(i.vat_cents), bedragNl(i.amount_cents), i.status].map(csvCel).join(";"));
  // kosten: per maand in de periode
  for (let d = new Date(van + "T00:00:00Z"); d < new Date(tot + "T00:00:00Z"); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const m = ym(d);
    for (const c of costs) {
      const v = kostInMaand(c, m); if (!v) continue;
      const btw = c.soort === "maandelijks" || c.soort === "jaarlijks" || ym(new Date(c.datum)) === m ? c.btw_cents : 0;
      regels.push(["Inkoop", c.soort === "eenmalig" ? new Date(c.datum).toISOString().slice(0, 10) : `${m}-01`, "", c.leverancier, "", "", c.omschrijving + (c.soort !== "eenmalig" ? ` (${c.soort})` : ""), CATEGORIEEN[c.categorie] || c.categorie, bedragNl(v), bedragNl(btw), bedragNl(v + btw), ""].map(csvCel).join(";"));
    }
  }
  const naam = `sitemaker-${y}${k ? `-Q${k}` : ""}.csv`;
  return new Response("﻿" + regels.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${naam}"`, "cache-control": "no-store" } });
}
export const fmt = euro;
