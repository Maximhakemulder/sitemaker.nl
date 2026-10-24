// Afdeling Domeinen (Dirk): per klant de domeinnaam, wie hem beheert, en of hij goed naar de site wijst.
// Keuzes van de klant: eigen = houdt hem bij zijn eigen provider (wij geven de instellingen), verhuizen = naar Sitemaker,
// nieuw = Sitemaker registreert hem. Registreren/verhuizen doet Maxim bij zijn registrar; HQ zet alles klaar en volgt het.
// Netlify: het domein wordt aan het Netlify-project van de klant gehangen; daarna controleert tick de DNS tot hij klopt.
import dns from "node:dns/promises";
import { q, one, str, fail, audit, env } from "./core.mjs";
import { notifyStaff } from "./mail.mjs";
import { netlifyReady } from "./netlifyapi.mjs";

export const APEX_IP = "75.2.60.5"; // Netlify load balancer (docs.netlify.com, externe DNS)
export const STATUS = { wacht_op_klant: "Wacht op de klant", aangevraagd: "Geregeld, DNS instellen", verhuizen: "Verhuizen naar Sitemaker", registreren: "Registreren", dns_klaar: "Instellingen kloppen", actief: "Actief", probleem: "Probleem", opgezegd: "Opgezegd" };

export function normDomain(v) {
  let d = String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  try { d = new URL("http://" + d).hostname; } catch { return ""; }
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) ? d : "";
}
const target = (c) => (c.site_netlify_name ? `${c.site_netlify_name}.netlify.app` : "");

// Welke DNS-instellingen de klant moet zetten.
export function instructies(d, c) {
  const t = target(c);
  return {
    target: t,
    records: t ? [
      { type: "A", naam: "@ (of leeg)", waarde: APEX_IP, uitleg: `Zorgt dat ${d.naam} naar je nieuwe website wijst.` },
      { type: "CNAME", naam: "www", waarde: t, uitleg: `Zorgt dat www.${d.naam} ook werkt.` },
    ] : [],
    letop: "Verander niets aan de MX-records: dan blijft je e-mail gewoon werken. Het kan een paar uur duren voordat een wijziging overal zichtbaar is.",
  };
}

// Beschikbaarheid via RDAP (openbaar register). 404 = vrij.
export async function beschikbaar(naam) {
  const d = normDomain(naam);
  if (!d) fail(400, "Vul een geldige domeinnaam in, bijvoorbeeld jouwbedrijf.nl.", { field: "naam" });
  if (env("DOMAIN_FAKE")) return { naam: d, vrij: !/bezet/.test(d) };
  const url = d.endsWith(".nl") ? `https://rdap.sidn.nl/domain/${d}` : `https://rdap.org/domain/${d}`;
  try {
    const r = await fetch(url, { headers: { accept: "application/rdap+json" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return { naam: d, vrij: true };
    if (r.ok) return { naam: d, vrij: false };
    return { naam: d, vrij: null };
  } catch { return { naam: d, vrij: null }; }
}

// ---------------------------------------------------------------- DNS controleren en koppelen
async function resolveAll(host) {
  const r = new dns.Resolver(); r.setServers(["1.1.1.1", "8.8.8.8"]);
  const [a, cname] = await Promise.all([r.resolve4(host).catch(() => []), r.resolveCname(host).catch(() => [])]);
  return { a, cname: cname.map((x) => x.toLowerCase().replace(/\.$/, "")) };
}
export async function checkDns(d, c) {
  if (env("DOMAIN_FAKE")) { const ok = !/fout/.test(d.naam); return { at: new Date().toISOString(), apexOk: ok, wwwOk: ok, ok, uitleg: ok ? "Beide instellingen kloppen." : "Het A-record wijst nog niet naar Netlify." }; }
  const t = target(c);
  const [apex, www, net] = await Promise.all([resolveAll(d.naam), resolveAll("www." + d.naam), t ? resolveAll(t) : { a: [] }]);
  const netIps = new Set([APEX_IP, ...net.a]);
  const apexOk = apex.a.some((ip) => netIps.has(ip));
  const wwwOk = (t && www.cname.includes(t)) || www.a.some((ip) => netIps.has(ip));
  const uitleg = !t ? "De website van deze klant heeft nog geen Netlify-project." : apexOk && wwwOk ? "Beide instellingen kloppen." :
    [!apexOk && (apex.a.length ? `${d.naam} wijst nog naar ${apex.a.join(", ")} in plaats van ${APEX_IP}.` : `${d.naam} heeft nog geen A-record.`),
      !wwwOk && (www.cname.length ? `www wijst naar ${www.cname[0]} in plaats van ${t}.` : `www.${d.naam} heeft nog geen CNAME naar ${t}.`)].filter(Boolean).join(" ");
  return { at: new Date().toISOString(), apex, www: { a: www.a, cname: www.cname }, apexOk, wwwOk, ok: apexOk && wwwOk, uitleg };
}

// Hang het domein aan het Netlify-project van de klant (Netlify voegt www vanzelf toe en regelt https).
export async function linkNetlify(d, c) {
  if (env("NETLIFY_FAKE")) return true;
  if (!c.site_netlify_id || !netlifyReady()) return false;
  const r = await fetch(`https://api.netlify.com/api/v1/sites/${c.site_netlify_id}`, {
    method: "PATCH", headers: { authorization: `Bearer ${env("NETLIFY_API_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ custom_domain: d.naam }), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`Netlify: ${e.message || r.status}`); }
  return true;
}

export async function controleer(id, { user = null } = {}) {
  const d = await one("SELECT * FROM domains WHERE id = $1", [id]);
  if (!d) fail(404, "Domein niet gevonden.");
  const c = await one("SELECT * FROM customers WHERE id = $1", [d.customer_id]);
  let gekoppeld = d.netlify_gekoppeld;
  if (!gekoppeld && c.site_netlify_id) { try { gekoppeld = await linkNetlify(d, c); } catch (e) { console.log("[domein]", e.message); } }
  const res = await checkDns(d, c);
  let status = d.status;
  if (res.ok && gekoppeld) status = "actief";
  else if (res.ok) status = "dns_klaar";
  else if (d.status === "actief") status = "probleem";
  await q("UPDATE domains SET dns = $2::jsonb, dns_at = NOW(), status = $3, netlify_gekoppeld = $4, updated_at = NOW() WHERE id = $1", [d.id, JSON.stringify(res), status, gekoppeld]);
  if (status !== d.status) {
    await audit(user?.id || null, d.customer_id, `domein.${status}`, { naam: d.naam });
    if (status === "actief") {
      // De klantsite heeft nu zijn eigen adres.
      await q("UPDATE customers SET site_url = $2, updated_at = NOW() WHERE id = $1 AND (site_url = '' OR site_url LIKE '%netlify.app%')", [c.id, `https://${d.naam}`]);
      await notifyStaff(`Domein actief: ${d.naam}`, [`${d.naam} wijst nu naar de site van ${c.company}. Netlify regelt de beveiligde verbinding (https).`], `/hq/#domeinen`).catch(() => {});
    }
    if (status === "probleem") await notifyStaff(`Domein klopt niet meer: ${d.naam}`, [`${d.naam} (${c.company}) wijst niet meer naar de site.`, res.uitleg], `/hq/#domeinen`).catch(() => {});
  }
  return { status, dns: res, gekoppeld };
}

// tick: domeinen die nog niet klaar zijn elke 30 minuten, actieve één keer per dag; en verloopwaarschuwingen.
export async function runDomainChecks({ max = 4 } = {}) {
  const todo = await q(`SELECT d.id FROM domains d JOIN customers c ON c.id = d.customer_id WHERE d.status NOT IN ('opgezegd','registreren','verhuizen') AND c.site_netlify_name <> ''
                        AND (d.dns_at IS NULL OR (d.status <> 'actief' AND d.dns_at < NOW() - INTERVAL '30 minutes') OR (d.status = 'actief' AND d.dns_at < NOW() - INTERVAL '1 day'))
                        ORDER BY d.dns_at NULLS FIRST LIMIT $1`, [max]);
  for (const t of todo) await controleer(t.id).catch((e) => console.log("[domein]", e.message));
  const verloop = await q(`SELECT d.*, c.company FROM domains d JOIN customers c ON c.id = d.customer_id WHERE d.keuze <> 'eigen' AND d.status <> 'opgezegd' AND d.verloopt_op IS NOT NULL
                           AND d.verloopt_op < CURRENT_DATE + 30 AND (d.waarschuwing_at IS NULL OR d.waarschuwing_at < NOW() - INTERVAL '14 days')`);
  for (const d of verloop) {
    await q("UPDATE domains SET waarschuwing_at = NOW() WHERE id = $1", [d.id]);
    await notifyStaff(`Domein verloopt binnenkort: ${d.naam}`, [`${d.naam} van ${d.company} verloopt op ${new Date(d.verloopt_op).toLocaleDateString("nl-NL")}. De klant verlengt hem zelf bij ${d.provider || "zijn provider"}; herinner hem er even aan.`], `/hq/#domeinen`).catch(() => {});
  }
  return { checked: todo.length };
}

// ---------------------------------------------------------------- klant (portaal)
export const publicDomain = (d, c) => d ? ({ id: d.id, naam: d.naam, keuze: d.keuze, status: d.status, statusLabel: STATUS[d.status], provider: d.provider, dnsOk: !!d.dns?.ok, uitleg: d.dns?.uitleg || "", dnsAt: d.dns_at, instructies: d.keuze === "eigen" ? instructies(d, c) : null }) : null;

export async function portalDomain(customerId) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  const d = await one("SELECT * FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [customerId]);
  return { domein: publicDomain(d, c), siteKlaar: !!c.site_netlify_name, suggestie: c.intake?.domein || "" };
}

export async function chooseDomain(user, b) {
  // Sitemaker registreert en beheert geen domeinen: de klant koopt het zelf, wij verbinden het.
  const keuze = "eigen";
  const naam = normDomain(b.naam);
  if (!naam) fail(400, "Vul een geldige domeinnaam in, bijvoorbeeld jouwbedrijf.nl.", { field: "naam" });
  if (await one("SELECT 1 FROM domains WHERE naam = $1 AND status <> 'opgezegd' AND customer_id <> $2", [naam, user.customer_id])) fail(409, "Deze domeinnaam is al aan een andere klant gekoppeld. Neem contact met ons op.", { field: "naam" });
  const bestaand = await one("SELECT id FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [user.customer_id]);
  const status = keuze === "eigen" ? "wacht_op_klant" : keuze === "verhuizen" ? "verhuizen" : "registreren";
  const vals = [naam, keuze, status, str(b.provider, 80), str(b.verhuiscode, 120)];
  const d = bestaand
    ? await one("UPDATE domains SET naam = $2, keuze = $3, status = $4, provider = $5, verhuiscode = $6, dns = '{}'::jsonb, dns_at = NULL, netlify_gekoppeld = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *", [bestaand.id, ...vals])
    : await one("INSERT INTO domains (customer_id, naam, keuze, status, provider, verhuiscode) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [user.customer_id, ...vals]);
  await audit(user.id, user.customer_id, `domein.${keuze}`, { naam });
  const c = await one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
  const wat = { eigen: "houdt het domein zelf en zet de DNS-instellingen", verhuizen: "wil het domein naar Sitemaker verhuizen", nieuw: "wil een nieuw domein laten registreren" }[keuze];
  await notifyStaff(`Domein: ${c.company} ${wat}`, [`${c.company}: ${naam}`, keuze === "eigen" ? "HQ controleert de instellingen automatisch." : keuze === "verhuizen" ? `Verhuis het domein${d.provider ? ` vanaf ${d.provider}` : ""}${d.verhuiscode ? " (verhuiscode staat in HQ)" : "; de klant heeft nog geen verhuiscode gegeven"}.` : "Registreer het domein op naam van de klant bij je registrar en zet daarna in HQ de status bij."], `/hq/#domeinen`).catch(() => {});
  if (keuze === "eigen" && c.site_netlify_id) await linkNetlify(d, c).then((ok) => ok && q("UPDATE domains SET netlify_gekoppeld = TRUE WHERE id = $1", [d.id])).catch(() => {});
  return portalDomain(user.customer_id);
}

export async function portalRecheck(user) {
  const d = await one("SELECT id FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [user.customer_id]);
  if (!d) fail(404, "Je hebt nog geen domein gekozen.");
  await controleer(d.id, { user });
  return portalDomain(user.customer_id);
}

// ---------------------------------------------------------------- HQ
export async function listDomains() {
  const rows = await q("SELECT d.*, c.company, c.site_netlify_name, c.site_url FROM domains d JOIN customers c ON c.id = d.customer_id ORDER BY (d.status IN ('verhuizen','registreren','probleem','aangevraagd')) DESC, d.updated_at DESC");
  return rows.map((d) => ({ ...publicDomain(d, d), customerId: d.customer_id, company: d.company, verhuiscode: d.verhuiscode, verlooptOp: d.verloopt_op, notitie: d.notitie, netlify: d.netlify_gekoppeld, siteNaam: d.site_netlify_name, dns: d.dns, updatedAt: d.updated_at }));
}
export async function updateDomain(id, b, user) {
  const d = await one("SELECT * FROM domains WHERE id = $1", [id]);
  if (!d) fail(404, "Domein niet gevonden.");
  const status = STATUS[b.status] ? b.status : d.status;
  const verloopt = b.verlooptOp === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(b.verlooptOp || "") ? b.verlooptOp : d.verloopt_op;
  await q(`UPDATE domains SET status = $2, provider = $3, verloopt_op = $4, notitie = $5, verhuiscode = CASE WHEN $2 IN ('dns_klaar','actief') THEN '' ELSE $6 END, updated_at = NOW() WHERE id = $1`,
    [id, status, str(b.provider ?? d.provider, 80), verloopt, str(b.notitie ?? d.notitie, 1000), str(b.verhuiscode ?? d.verhuiscode, 120)]);
  if (status !== d.status) await audit(user.id, d.customer_id, `domein.${status}`, { naam: d.naam });
  return { ok: true };
}
