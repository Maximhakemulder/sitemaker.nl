// Gedeelde basis: omgeving, database, het aanbod, tijd en HTTP-hulpjes.
import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";
import pg from "pg";

// Datums (DATE) als tekst "YYYY-MM-DD" teruggeven, zonder tijdzone-verschuiving.
pg.types.setTypeParser(1082, (v) => v);

export const env = (k, d = "") => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

// ---------------------------------------------------------------- het aanbod (één bron voor alle bedragen)
export const OFFER = {
  buildCents: 29995,
  monthlyCents: 6995,
  changesPerMonth: 4,
  changeHours: 48,
  deliveryText: "48 uur (2 werkdagen)",
};

// ---------------------------------------------------------------- database
let _db = null;
function db() {
  if (!_db) {
    const cs = env("SM_DB_URL");
    _db = cs ? getDatabase({ connectionString: cs }) : getDatabase();
  }
  return _db;
}
// q`...` kan niet dynamisch; daarom simpele helpers met $1-parameters.
export async function q(text, params = []) {
  const r = await db().pool.query(text, params);
  return r.rows;
}
export async function one(text, params = []) {
  return (await q(text, params))[0] || null;
}
export async function tx(fn) {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const api = {
      q: async (t, p = []) => (await client.query(t, p)).rows,
      one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
    };
    const out = await fn(api);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDb() { if (_db) { await _db.pool.end().catch(() => {}); _db = null; } }

// Vergrendeling voor geplande taken (zodat twee aanroepen niet tegelijk mailen).
export async function withLock(name, fn, ttlMs = 30000) {
  const got = await one(
    `INSERT INTO locks (name, until) VALUES ($1, NOW() + ($2 || ' milliseconds')::interval)
     ON CONFLICT (name) DO UPDATE SET until = EXCLUDED.until WHERE locks.until < NOW()
     RETURNING name`, [name, String(ttlMs)]);
  if (!got) return { locked: true };
  try { return await fn(); }
  finally { await q("DELETE FROM locks WHERE name = $1", [name]).catch(() => {}); }
}

// ---------------------------------------------------------------- instellingen
export const DEFAULT_SETTINGS = {
  // Online kennismaking boeken. Tijden in Europe/Amsterdam; week: 0 = zondag … 6 = zaterdag.
  agenda: {
    actief: true, duur: 15, interval: 30, minUren: 4, dagenVooruit: 21, maxPerDag: 0, soort: "telefoon", videoLink: "",
    week: { 0: [], 1: [["09:00", "12:00"], ["13:00", "17:00"]], 2: [["09:00", "12:00"], ["13:00", "17:00"]], 3: [["09:00", "12:00"], ["13:00", "17:00"]], 4: [["09:00", "12:00"], ["13:00", "17:00"]], 5: [["09:00", "12:00"], ["13:00", "17:00"]], 6: [] },
  },
  // Tracking op de website (alleen na toestemming via de cookiebanner).
  tracking: { metaPixelId: "" },
  company: {
    name: "Sitemaker", legalName: "", address: "", postcode: "", city: "", kvk: "", vat: "", iban: "",
    email: "", phone: "", website: "https://sitemaker.nl",
  },
  billing: {
    // De prijzen op de site (€299,95 / €69,95) zijn wat de klant betaalt; btw wordt alleen op de factuur uitgesplitst.
    pricesIncludeVat: true,
    vatRate: 21,
    paymentTermDays: 14,
    invoicePrefix: "SM",
    autoInvoices: true,
  },
  notify: { email: "" },
  b2b: {
    senderName: "",
    dailyMax: 40,
    followupDays: 5,
    sendHours: [8, 17],
    scout: { active: false, perDay: 20, categories: ["kapper", "installatiebedrijf", "schoonheidssalon", "hovenier", "schilder", "fysiotherapeut"], places: ["Rotterdam", "Den Haag", "Utrecht", "Breda", "Dordrecht", "Eindhoven"] },
    ai: { research: true },
    // Concept-websites: automatisch maken voor leads met een website (max. perDag), geldig voor geldigDagen.
    concepten: { auto: true, perDag: 20, geldigDagen: 60, wachten: true },
    templates: {
      eerste: {
        subject: "Een website die aanvragen oplevert voor {bedrijf}",
        body: "Goedendag,\n\n{intro}{concept}Ik ben {afzender} van Sitemaker. Wij bouwen professionele websites voor bedrijven, gericht op één ding: bezoekers omzetten in klanten.\n\nWat u krijgt:\n- Een professionele website, binnen 48 uur (2 werkdagen) online nadat u uw informatie hebt aangeleverd\n- Hosting inbegrepen\n- Elke maand vier wijzigingen, die we binnen 48 uur verwerken via uw eigen klantenportaal\n\nDe prijs is vast: €299,95 eenmalig en daarna €69,95 per maand. Geen onverwachte kosten.\n\nZullen we een korte kennismaking plannen? U kunt direct een moment kiezen via {link}, of gewoon op deze mail reageren.\n\nMet vriendelijke groet,\n{afzender}\nSitemaker",
      },
      opvolging: {
        subject: "Re: Een website die aanvragen oplevert voor {bedrijf}",
        body: "Goedendag,\n\nIk stuurde u onlangs een bericht over een nieuwe website voor {bedrijf}. Misschien is het toen ondergesneeuwd.\n\nKort samengevat: een professionele website binnen 48 uur (2 werkdagen) online, hosting en vier wijzigingen per maand inbegrepen, voor €299,95 eenmalig en €69,95 per maand.\n\nAls het nu niet past, hoor ik dat ook graag; dan stuur ik u niets meer.\n\nMet vriendelijke groet,\n{afzender}\nSitemaker",
      },
    },
  },
};

function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], v) : v;
  return out;
}
export async function getSettings() {
  const rows = await q("SELECT key, value FROM settings");
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return merge(DEFAULT_SETTINGS, stored);
}
export async function saveSetting(key, value) {
  await q(`INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, JSON.stringify(value)]);
}

// ---------------------------------------------------------------- tijd en geld
export const TZ = "Europe/Amsterdam";
export const monthKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
export const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
export const hourAms = (d = new Date()) => Number(d.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
export const euro = (c) => (Number(c) < 0 ? "-€" : "€") + (Math.abs(Number(c || 0)) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const centsToMollie = (c) => (Number(c) / 100).toFixed(2);
export function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0); // 31 jan + 1 maand = 28/29 feb
  return d.toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- tekst
export const EMAIL_RE = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i;
export const cleanEmail = (e) => String(e || "").trim().toLowerCase();
export const str = (v, max = 500) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function domainOf(u) {
  try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
export function normUrl(u) {
  const s = str(u, 300);
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
  try { const x = new URL(withProto); return x.protocol === "http:" || x.protocol === "https:" ? x.href.replace(/\/$/, "") : ""; } catch { return ""; }
}

// ---------------------------------------------------------------- HTTP
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export function siteUrl(req) {
  const fromEnv = env("SITE_URL") || env("URL");
  if (fromEnv && !req) return fromEnv.replace(/\/$/, "");
  if (req) { const u = new URL(req.url); return `${u.protocol}//${u.host}`; }
  return "https://sitemaker.nl";
}
// Publieke basis-URL voor links in mails en webhooks: altijd de productie-URL als die bekend is.
// Klantenportaal en HQ kunnen op een eigen subdomein staan (PORTAL_URL=https://mijn.sitemaker.nl, HQ_URL=https://hq.sitemaker.nl).
// Zonder die instellingen: <website>/portaal/ en <website>/hq/.
export const portalUrl = () => (env("PORTAL_URL") ? env("PORTAL_URL").replace(/\/+$/, "") : publicBase() + "/portaal") + "/";
export const hqUrl = () => (env("HQ_URL") ? env("HQ_URL").replace(/\/+$/, "") : publicBase() + "/hq") + "/";

export function publicBase(req) {
  const fixed = env("PUBLIC_BASE_URL") || (env("CONTEXT") === "production" ? env("URL") : "");
  return (fixed || siteUrl(req)).replace(/\/$/, "");
}

export async function audit(userId, customerId, action, detail = {}) {
  await q("INSERT INTO audit_log (user_id, customer_id, action, detail) VALUES ($1, $2, $3, $4::jsonb)",
    [userId || null, customerId || null, action, JSON.stringify(detail)]).catch(() => {});
}
