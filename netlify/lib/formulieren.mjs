// Werkende formulieren op klantsites (offerte, intake, afspraak, contact).
// Het formulier post naar /api/formulier/<klant>/<handtekening>; wij mailen het bericht naar de klant (antwoorden gaat
// rechtstreeks naar de bezoeker) en bewaren het. Geen uploads; spam: verborgen veld, tijd en een limiet per uur.
import crypto from "node:crypto";
import { q, one, str, env, escH, sha256, EMAIL_RE, publicBase } from "./core.mjs";
import { sendMail, brandHtml } from "./mail.mjs";
import { FORMULIER_ACTIE } from "./ontwerp.mjs";

const sig = (id) => crypto.createHmac("sha256", env("AUTH_SECRET", "sitemaker-local-dev")).update(`formulier:${id}`).digest("base64url").slice(0, 24);
export const formulierUrl = (customerId) => `${publicBase()}/api/formulier/${customerId}/${sig(customerId)}`;
export const vulFormulierActie = (html, customerId) => String(html || "").split(FORMULIER_ACTIE).join(formulierUrl(customerId));

function pagina(titel, tekst, terug) {
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escH(titel)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;background:#f4f5f7;color:#1a1a1a;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}main{background:#fff;border-radius:16px;padding:32px;max-width:460px;box-shadow:0 10px 30px rgba(0,0,0,.08)}h1{font-size:24px;margin:0 0 12px}p{line-height:1.55;margin:0 0 20px}a{display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:600}</style></head>
<body><main><h1>${escH(titel)}</h1><p>${escH(tekst)}</p>${terug ? `<a href="${escH(terug)}">Terug naar de website</a>` : ""}</main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export async function ontvang(req, id, handtekening, ip) {
  const klantId = Number(id);
  const a = Buffer.from(String(handtekening || "")), b = Buffer.from(sig(klantId));
  if (!klantId || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return pagina("Versturen lukte niet", "Dit formulier is niet (meer) geldig. Neem telefonisch of per mail contact op.", "");
  const c = await one("SELECT id, company, email, site_url FROM customers WHERE id = $1", [klantId]);
  if (!c) return pagina("Versturen lukte niet", "Dit formulier is niet (meer) geldig.", "");
  let terug = "";
  try { const r = new URL(req.headers.get("referer") || ""); if (/^https?:$/.test(r.protocol)) terug = r.origin + r.pathname; } catch {}
  terug = terug || c.site_url || "";
  let data;
  try { data = await req.formData(); } catch { return pagina("Versturen lukte niet", "Het formulier kon niet worden gelezen. Probeer het nog eens.", terug); }
  if (str(data.get("website_url"))) return pagina("Bedankt!", "Je bericht is verstuurd.", terug); // spambot
  const formulier = str(data.get("_formulier"), 60) || "Formulier";
  const velden = [];
  for (const [k, v] of data.entries()) {
    if (k === "website_url" || k.startsWith("_") || typeof v !== "string") continue;
    const waarde = str(v, 3000);
    if (!waarde) continue;
    const bestaand = velden.find((x) => x.naam === k);
    if (bestaand) bestaand.waarde += `, ${waarde}`; else if (velden.length < 30) velden.push({ naam: str(k.replace(/[_\-[\]]+/g, " "), 60), waarde });
  }
  if (!velden.length) return pagina("Versturen lukte niet", "Het formulier was leeg. Vul het in en probeer het opnieuw.", terug);
  const email = velden.map((v) => v.waarde.trim().toLowerCase()).find((w) => EMAIL_RE.test(w)) || "";
  const ipHash = sha256(`${env("AUTH_SECRET", "x")}:${ip}`).slice(0, 32);
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM formulier_berichten WHERE customer_id = $1 AND (ip_hash = $2 OR created_at > NOW() - INTERVAL '10 minutes') AND created_at > NOW() - INTERVAL '1 hour'", [klantId, ipHash]);
  if (n >= 20) return pagina("Even wachten", "Er zijn net veel berichten verstuurd. Probeer het over een uur opnieuw, of bel of mail ons.", terug);
  const r = await one("INSERT INTO formulier_berichten (customer_id, formulier, velden, email, ip_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id", [klantId, formulier, JSON.stringify(velden), email, ipHash]);
  const u = await one("SELECT email FROM users WHERE customer_id = $1 AND active ORDER BY id LIMIT 1", [klantId]);
  const aan = c.email || u?.email;
  if (aan) {
    const regels = velden.map((v) => `${v.naam}: ${v.waarde}`);
    const res = await sendMail({ to: aan, replyTo: email || undefined, kind: "klantsite-formulier", ref: `customer:${klantId}`,
      subject: `Nieuw bericht via je website: ${formulier}`,
      text: `Er is een nieuw bericht binnengekomen via het formulier "${formulier}" op je website.\n\n${regels.join("\n")}\n\n${email ? "Beantwoorden? Klik gewoon op Beantwoorden in je mail." : "De bezoeker heeft geen e-mailadres ingevuld."}\n\nSitemaker`,
      html: brandHtml({ title: `Nieuw bericht: ${formulier}`, intro: [`Er is een nieuw bericht binnengekomen via het formulier "${escH(formulier)}" op je website.`, ...velden.map((v) => `<b>${escH(v.naam)}</b>: ${escH(v.waarde).replace(/\n/g, "<br>")}`), email ? "Beantwoorden? Klik gewoon op Beantwoorden in je mail." : "De bezoeker heeft geen e-mailadres ingevuld."] }),
    }).catch(() => ({ ok: false }));
    if (res?.ok) await q("UPDATE formulier_berichten SET gemaild = TRUE WHERE id = $1", [r.id]);
  }
  return pagina("Bedankt, je bericht is verstuurd!", `${c.company} heeft je bericht ontvangen en neemt zo snel mogelijk contact met je op.`, terug);
}
