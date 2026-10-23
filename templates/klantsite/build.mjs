// Sitemaker klantsite: bouwt dist/ uit content.json. Geen afhankelijkheden nodig.
// Netlify draait dit bij elke deploy (build command: node build.mjs, publish: dist).
import fs from "node:fs";
import path from "node:path";

const c = JSON.parse(fs.readFileSync("content.json", "utf8"));
const THEMAS = {
  elegant: { primair: "#141015", accent: "#D9B77C", achter: "#141015", tekst: "#F2EBE2", kaart: "#1E1820", donker: true, kop: 'Georgia, "Times New Roman", serif' },
  stoer: { primair: "#111111", accent: "#FFD400", achter: "#F4F4F0", tekst: "#111111", kaart: "#FFFFFF", donker: false, kop: '"Arial Black", Arial, sans-serif' },
  natuur: { primair: "#2F5A37", accent: "#7FA36B", achter: "#F6F1E7", tekst: "#24402B", kaart: "#FFFFFF", donker: false, kop: 'Georgia, "Times New Roman", serif' },
  zacht: { primair: "#6C4CF1", accent: "#22C3B5", achter: "#F7F5FF", tekst: "#251A57", kaart: "#FFFFFF", donker: false, kop: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
};
const t = { ...(THEMAS[c.thema] || THEMAS.natuur) };
if (c.kleuren?.primair) t.primair = c.kleuren.primair;
if (c.kleuren?.accent) t.accent = c.kleuren.accent;

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
const veiligPad = (p) => (/^(afbeeldingen\/[\w.\-]+|https:\/\/[^\s"'<>]+)$/.test(p || "") ? p : "");
const veiligeLink = (l) => (/^(#[\w-]*|tel:[+\d ]+|mailto:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/.test(l || "") ? l : "#contact");
const b = c.bedrijf || {};
const tel = (b.telefoon || "").replace(/[^\d+]/g, "");
const wa = (b.whatsapp || "").replace(/[^\d]/g, "");
const knop = (k, cls = "knop") => (k?.tekst ? `<a class="${cls}" href="${e(veiligeLink(k.link || (tel ? "tel:" + tel : "#contact")))}">${e(k.tekst)}</a>` : "");

const secties = [];
const h = c.hero || {};
secties.push(`<section class="hero">
  <div class="hero-tekst">${h.label ? `<p class="label">${e(h.label)}</p>` : ""}<h1>${e(h.titel)}</h1>${h.tekst ? `<p class="lead">${e(h.tekst)}</p>` : ""}
  <div class="acties">${knop(h.knop)}${tel ? `<a class="knop-rand" href="tel:${e(tel)}">Bel ${e(b.telefoon)}</a>` : ""}</div></div>
  ${veiligPad(h.foto) ? `<div class="hero-foto"><img src="${e(veiligPad(h.foto))}" alt="${e(b.naam)}" width="900" height="900" fetchpriority="high"></div>` : ""}
</section>`);
const d = c.diensten;
if (d?.items?.length) secties.push(`<section class="blok" id="diensten"><h2>${e(d.titel || "Diensten")}</h2><div class="kaarten">
  ${d.items.map((i) => `<article class="kaart"><h3>${e(i.titel)}</h3>${i.tekst ? `<p>${e(i.tekst)}</p>` : ""}${i.prijs ? `<p class="prijs">${e(i.prijs)}</p>` : ""}</article>`).join("")}</div></section>`);
const o = c.over;
if (o?.tekst) secties.push(`<section class="blok duo" id="over">${veiligPad(o.foto) ? `<img src="${e(veiligPad(o.foto))}" alt="" loading="lazy" width="900" height="900">` : ""}<div><h2>${e(o.titel || "Over ons")}</h2><p>${e(o.tekst).replace(/\n/g, "<br>")}</p></div></section>`);
const f = (c.fotos || []).map(veiligPad).filter(Boolean);
if (f.length) secties.push(`<section class="blok" id="fotos"><div class="galerij">${f.map((p) => `<img src="${e(p)}" alt="" loading="lazy" width="900" height="900">`).join("")}</div></section>`);
const ot = c.openingstijden || [];
const ct = c.contact || {};
secties.push(`<section class="blok contact" id="contact"><div><h2>${e(ct.titel || "Contact")}</h2>${ct.tekst ? `<p>${e(ct.tekst)}</p>` : ""}
  <div class="acties">${tel ? `<a class="knop" href="tel:${e(tel)}">Bel ${e(b.telefoon)}</a>` : ""}${b.email ? `<a class="knop-rand" href="mailto:${e(b.email)}">${e(b.email)}</a>` : ""}${wa ? `<a class="knop-rand" href="https://wa.me/${e(wa)}">WhatsApp</a>` : ""}${!tel && !b.email ? knop(ct.knop) : ""}</div></div>
  ${ot.length ? `<div class="tijden"><h3>Openingstijden</h3>${ot.map((r) => `<p><span>${e(r.dag)}</span><b>${e(r.tijd)}</b></p>`).join("")}</div>` : ""}</section>`);

const css = `:root{--p:${t.primair};--a:${t.accent};--bg:${t.achter};--tx:${t.tekst};--kaart:${t.kaart};--kop:${t.kop}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
img{max-width:100%;display:block}a{color:inherit}h1,h2,h3{font-family:var(--kop);line-height:1.1;margin:0 0 .5em;letter-spacing:-.01em}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;gap:20px;padding:18px 0}header .naam{font-family:var(--kop);font-weight:700;font-size:21px;text-decoration:none}
header nav{margin-left:auto;display:flex;gap:20px;font-size:15px}header nav a{text-decoration:none;opacity:.85}
.knop,.knop-rand{display:inline-flex;align-items:center;min-height:48px;padding:0 20px;border-radius:${c.thema === "stoer" ? "4px" : "999px"};font-weight:700;text-decoration:none}
.knop{background:${c.thema === "stoer" ? "var(--a)" : "var(--p)"};color:${c.thema === "stoer" ? "#111" : t.donker ? "#141015" : "#fff"};${c.thema === "stoer" ? "box-shadow:4px 4px 0 #111;" : ""}${t.donker ? "background:var(--a);" : ""}}
.knop-rand{box-shadow:inset 0 0 0 2px currentColor}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;padding:30px 0 60px}
.label{display:inline-block;font-weight:700;font-size:14px;color:var(--a);margin:0 0 10px}
h1{font-size:clamp(38px,6vw,64px)}.lead{font-size:19px;opacity:.85;max-width:30em}
.acties{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.hero-foto img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:${c.thema === "natuur" ? "260px 260px 24px 24px" : c.thema === "stoer" ? "0" : "28px"}}
.blok{padding:56px 0;border-top:1px solid color-mix(in srgb,var(--tx) 12%,transparent)}h2{font-size:clamp(28px,4vw,40px)}
.kaarten{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.kaart{background:var(--kaart);border-radius:18px;padding:22px;${c.thema === "stoer" ? "border-left:5px solid #111;border-radius:0;" : ""}${t.donker ? "border:1px solid color-mix(in srgb,var(--a) 30%,transparent);" : "box-shadow:0 8px 24px rgba(0,0,0,.06);"}}
.kaart p{margin:0;opacity:.8}.prijs{margin-top:10px!important;font-weight:700;color:var(--a);opacity:1!important}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}.duo img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:24px}
.galerij{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.galerij img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:18px}
.contact{display:grid;grid-template-columns:1.2fr .8fr;gap:40px}.tijden{background:var(--kaart);border-radius:18px;padding:22px}
.tijden p{display:flex;justify-content:space-between;gap:12px;margin:0;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--tx) 10%,transparent)}
footer{padding:30px 0 40px;font-size:14px;opacity:.7}
@media(max-width:760px){header nav{display:none}.hero,.duo,.contact{grid-template-columns:1fr}.hero{padding-top:10px}.hero-foto{order:-1}.knop,.knop-rand{width:100%;justify-content:center}}`;

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(c.seo?.titel || b.naam)}</title><meta name="description" content="${e(c.seo?.omschrijving || "")}">
<meta property="og:title" content="${e(c.seo?.titel || b.naam)}"><meta property="og:description" content="${e(c.seo?.omschrijving || "")}">${veiligPad(h.foto) ? `<meta property="og:image" content="${e(veiligPad(h.foto))}">` : ""}
<meta name="theme-color" content="${e(t.primair)}"><style>${css}</style></head><body><div class="wrap">
<header><a class="naam" href="#">${e(b.naam)}</a><nav>${d?.items?.length ? `<a href="#diensten">${e(d.titel || "Diensten")}</a>` : ""}${o?.tekst ? `<a href="#over">${e(o.titel || "Over ons")}</a>` : ""}<a href="#contact">Contact</a></nav></header>
${secties.join("\n")}
<footer>© ${new Date().getFullYear()} ${e(b.naam)}${b.plaats ? " · " + e(b.plaats) : ""}${b.kvk ? " · KvK " + e(b.kvk) : ""}${b.adres ? " · " + e(b.adres) : ""}</footer>
</div></body></html>`;

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", html);
if (fs.existsSync("afbeeldingen")) fs.cpSync("afbeeldingen", "dist/afbeeldingen", { recursive: true });
fs.writeFileSync("dist/robots.txt", "User-agent: *\nAllow: /\n");
console.log("Klaar: dist/index.html");
