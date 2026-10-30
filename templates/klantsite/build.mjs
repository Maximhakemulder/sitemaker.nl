// Sitemaker klantsite: bouwt dist/. Geen afhankelijkheden nodig.
// Netlify draait dit bij elke deploy (build command: node build.mjs, publish: dist).
// - Staat er een ontwerp.html (eigen ontwerp van de Sitemaker-ontwerper)? Dan is dat de site,
//   met ons bewegingsscript (beweging.js), de iconen (sprite.svg) en een vangnet (vangnet.css).
// - Anders: de vaste opmaak uit content.json (render.mjs).
import fs from "node:fs";
import { render } from "./render.mjs";

const lees = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const PAGINAS = ["algemene-voorwaarden.html", "privacy.html"];
const verrijk = (h) => h
  .replace(/<\/head>/i, () => `${lees("vangnet.css") ? `<style>${lees("vangnet.css")}</style>` : ""}</head>`)
  .replace(/<body([^>]*)>/i, (m) => m + lees("sprite.svg"))
  .replace(/<\/body>/i, () => `${fs.existsSync("beweging.js") ? '<script src="/beweging.js" defer></script>' : ""}</body>`);
// SEO-basis (besluit Maxim 30-10-2026): taal, titel en omschrijving, canonical, Open Graph, bedrijfsgegevens voor Google
// (schema.org LocalBusiness, alleen echte gegevens uit content.json), sitemap.xml en robots.txt. Bestaat iets al in het ontwerp, dan blijft dat.
const content = (() => { try { return JSON.parse(lees("content.json") || "{}"); } catch { return {}; } })();
const SITE = String(process.env.URL || "").replace(/\/$/, "");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function seo(h, pad = "/") {
  const b = content.bedrijf || {}, s = content.seo || {};
  const titel = s.titel || b.naam || "", oms = s.omschrijving || "", kop = [];
  if (!/<html[^>]*\slang=/i.test(h)) h = h.replace(/<html/i, '<html lang="nl"');
  if (titel && !/<title>/i.test(h)) kop.push(`<title>${esc(titel)}</title>`);
  if (oms && !/<meta[^>]+name=["']description/i.test(h)) kop.push(`<meta name="description" content="${esc(oms)}">`);
  if (SITE && !/rel=["']canonical/i.test(h)) kop.push(`<link rel="canonical" href="${esc(SITE + pad)}">`);
  if (titel && !/property=["']og:title/i.test(h)) kop.push(`<meta property="og:type" content="website"><meta property="og:locale" content="nl_NL"><meta property="og:title" content="${esc(titel)}">${oms ? `<meta property="og:description" content="${esc(oms)}">` : ""}${SITE ? `<meta property="og:url" content="${esc(SITE + pad)}">` : ""}`);
  if (pad === "/" && b.naam && !/application\/ld\+json/i.test(h)) {
    const ld = { "@context": "https://schema.org", "@type": "LocalBusiness", name: b.naam };
    if (SITE) ld.url = SITE + "/";
    if (oms) ld.description = oms;
    if (b.telefoon) ld.telephone = b.telefoon;
    if (b.email) ld.email = b.email;
    if (b.adres || b.plaats) ld.address = { "@type": "PostalAddress", ...(b.adres ? { streetAddress: b.adres } : {}), ...(b.plaats ? { addressLocality: b.plaats } : {}), addressCountry: "NL" };
    else if (b.plaats) ld.areaServed = b.plaats;
    kop.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  }
  return kop.length ? h.replace(/<\/head>/i, () => kop.join("") + "</head>") : h;
}
let html;
if (fs.existsSync("ontwerp.html")) {
  html = verrijk(lees("ontwerp.html"));
} else {
  html = render(JSON.parse(fs.readFileSync("content.json", "utf8")));
}
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", seo(html));
for (const p of PAGINAS) if (fs.existsSync(p)) fs.writeFileSync(`dist/${p}`, seo(verrijk(lees(p)), "/" + p));
if (fs.existsSync("beweging.js")) fs.copyFileSync("beweging.js", "dist/beweging.js");
if (fs.existsSync("afbeeldingen")) fs.cpSync("afbeeldingen", "dist/afbeeldingen", { recursive: true });
if (SITE) {
  const urls = ["/", ...PAGINAS.filter((p) => fs.existsSync(p)).map((p) => "/" + p)];
  const vandaag = new Date().toISOString().slice(0, 10);
  fs.writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(SITE + u)}</loc><lastmod>${vandaag}</lastmod></url>`).join("\n")}\n</urlset>\n`);
}
fs.writeFileSync("dist/robots.txt", `User-agent: *\nAllow: /\n${SITE ? `Sitemap: ${SITE}/sitemap.xml\n` : ""}`);
console.log("Klaar: dist/index.html");
