// Ontwerp-agent: ontwerpt voor elk bedrijf een volledig eigen website (HTML + CSS), vanaf nul.
// Input: de gecontroleerde content.json (alleen feiten van hun eigen site), hun huisstijlkleuren, logo en foto's.
// Output: één HTML-document zonder JavaScript. We schonen het op (geen scripts, geen externe bronnen behalve
// lettertypen van Bunny Fonts, alleen hun eigen afbeeldingen) en controleren de feiten. Lukt dat niet, dan
// valt het concept terug op de vaste opmaak (templates/klantsite/render.mjs).
import { str } from "./core.mjs";
import { claude } from "./ai.mjs";

export const SYSTEM = `Je bent een topontwerper van een gerenommeerd Nederlands webdesignbureau. Je ontwerpt voor één lokaal bedrijf een complete, unieke website van één pagina die hun klanten overtuigt om contact op te nemen. Elke site die je maakt is anders: de vorm volgt uit DIT bedrijf, hun vak, hun huisstijl en hun foto's. Geen template-gevoel.

Werkwijze (in je hoofd, niet in het antwoord):
1. Bepaal het karakter van het bedrijf (vak, doelgroep, sfeer van hun huidige site) en één sterk visueel idee dat daarbij past (bijv. voor een kapsalon een redactionele modestijl, voor een installateur een technische, krachtige stijl met heldere blokken, voor een hovenier organisch en luchtig).
2. Kies een lettertypepaar dat daarbij past (via Bunny Fonts) en een kleurpalet dat is opgebouwd uit HUN merkkleuren (exacte hex-waarden gebruiken, aangevuld met passende tinten).
3. Ontwerp de opbouw: welke onderdelen, in welke volgorde, welke lay-out per onderdeel. Wissel ritme af (vol beeld, kolommen, asymmetrie, ruimte).

Harde regels:
- Antwoord met ALLEEN één compleet HTML5-document (<!doctype html> … </html>), alle CSS in één <style> in de <head>. Geen uitleg, geen markdown.
- GEEN JavaScript, geen <script>, geen event-attributen (onclick e.d.), geen <iframe>, geen <form>, geen externe afbeeldingen of video. Externe bronnen alleen: lettertypen via <link rel="stylesheet" href="https://fonts.bunny.net/css?family=..."> (maximaal 2 families, bijv. family=fraunces:600|inter-tight:400,600; namen in kleine letters met streepjes).
- Teksten: gebruik ALLEEN de teksten en feiten uit de aangeleverde JSON. Je mag inkorten, opdelen en korte knop-/kopjeslabels toevoegen ("Bel ons", "Onze diensten", "Openingstijden", "Route plannen", "Bekijk foto's"), maar voeg GEEN feiten toe: geen jaartallen, aantallen, ervaring, reviews, sterren, keurmerken, garanties, prijzen of beloftes die niet in de JSON staan. Telefoon, e-mail, adres, prijzen en tijden exact overnemen.
- Afbeeldingen: alleen de bestanden uit de lijst, als src="afbeeldingen/<naam>". Gebruik veel beeld (alle foto's als het mooi past), met object-fit en een passende alt-tekst. Het logo (als er een is) in de kop en onderaan, met class="logo-img", nooit vervormd.
- Kleur en leesbaarheid: tekst moet overal goed leesbaar zijn (WCAG AA, minimaal 4,5:1). Nooit donkere tekst op een donkere achtergrond of lichte tekst op licht. Tekst op een foto alleen met een duidelijke donkere/kleur-overlay. Knoppen: duidelijk contrast tussen knopkleur en knoptekst.
- Responsive, mobiel eerst: perfect op 360px, 768px en 1280px+. Geen horizontaal scrollen. Vloeiende koppen met clamp(). Knoppen minimaal 48px hoog. Op mobiel onderaan een vaste balk <nav class="sm-actiebalk"> met de belangrijkste acties (bellen als er een telefoonnummer is, WhatsApp als dat er is, en de hoofdactie). Zorg dat de pagina onderaan genoeg ruimte heeft zodat de balk niets afdekt. Respecteer prefers-reduced-motion.
- Verplichte onderdelen en kenmerken (voor de techniek):
  - een kop met logo of bedrijfsnaam, navigatie (op mobiel ingeklapt tot alleen logo + belknop of hoofdactie) en de hoofdactie;
  - secties met id="diensten", id="over" (als er een over-tekst is), id="fotos" (als er foto's zijn) en id="contact";
  - de hoofdactie-knoppen met class="sm-hoofdactie";
  - openingstijden (als die er zijn) als <dl class="sm-tijden"> met per regel <div><dt>dag</dt><dd>tijd</dd></div>;
  - bellen via <a href="tel:...">, mailen via mailto:, WhatsApp via https://wa.me/<nummer in internationaal formaat zonder +>, route via https://www.google.com/maps/search/?api=1&query=<adres>;
  - een footer met bedrijfsnaam en plaats.
- Verhoudingen: elk beeldvlak krijgt een vaste aspect-ratio tussen 3:4 en 16:9 (of een vaste hoogte) met object-fit: cover. Nooit extreem lange of smalle vlakken. De hero is op desktop maximaal één schermhoogte (max ~100vh) en de tekst staat daar duidelijk in beeld naast/op het beeld, niet ver eronder.
- Eerste indruk: op mobiel moet in het eerste scherm al sterk beeld te zien zijn (een foto, of hun logo groot), niet alleen tekst. De hero is elke keer anders: kies wat bij dit bedrijf het sterkst is (bijv. foto over de volle breedte met tekst erop, een collage, een grote foto met een tekstblok dat overlapt, een gesplitst scherm, een foto in een bijzondere vorm).
- Vermijd AI-clichés: niet standaard één woord van de kop cursief of in een andere kleur, geen standaard "tekst links, foto rechts", geen generieke kaartjes met schaduw voor alles, geen hoofdletters-labels boven elke sectie.
- Kwaliteit: dit moet eruitzien als een website van €3000+ van een goed bureau. Ruimte, ritme, sterke typografie, verzorgde details (hover-states, focus-states, subtiele schaduwen of lijnen die bij de stijl passen). Hooguit één rustige animatie bij het laden.
- Houd de CSS compact (maximaal ongeveer 22 kB) en semantisch (header, main, section, footer, h1 één keer).`;

function prompt(content, images, extra) {
  const lijst = images.filter((i) => !i.logo).map((i) => `- afbeeldingen/${i.name} (${i.w}x${i.h}${i.stock ? ", sfeerbeeld" : ""}${i.alt ? `, "${i.alt}"` : ""})`).join("\n") || "- geen";
  const logo = images.find((i) => i.logo);
  return `Bedrijf: ${content.bedrijf?.naam}${extra.category ? ` (${extra.category})` : ""}${content.bedrijf?.plaats ? `, ${content.bedrijf.plaats}` : ""}
Huisstijlkleuren (van hun site, belangrijkste eerst): ${[content.kleuren?.primair, content.kleuren?.accent, ...(extra.kleuren || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "onbekend: kies een passend palet bij hun vak"}
Sfeer van hun huidige site: ${content.thema || "onbekend"}${extra.platform ? ` (gemaakt met ${extra.platform})` : ""}
Logo: ${logo ? `afbeeldingen/${logo.name} (${logo.w}x${logo.h})` : "geen; gebruik de bedrijfsnaam als woordmerk"}
Foto's:
${lijst}
${extra.instructie ? `\nWens van Sitemaker: ${extra.instructie}\n` : ""}
Inhoud (alleen deze feiten gebruiken):
${JSON.stringify({ ...content, ontwerp: undefined, stock: undefined }, null, 1)}`;
}

// ---------------------------------------------------------------- opschonen
export function sanitize(html, { imgBase, namen }) {
  let h = String(html || "");
  const s = h.indexOf("<!doctype"), s2 = h.toLowerCase().indexOf("<html");
  const start = s >= 0 ? s : s2;
  const eind = h.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || eind < 0) return null;
  h = h.slice(start, eind + 7);
  // gevaarlijke elementen helemaal weg
  h = h.replace(/<(script|iframe|object|embed|form|template|noscript|svg:script|frameset|frame|applet|portal)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|base|frame|applet|portal|input|button|textarea|select)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
  // event-attributen en gevaarlijke attributen
  h = h.replace(/\s(on[a-z]+|srcdoc|formaction|xlink:href|ping)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // links: alleen fonts.bunny.net als stylesheet/preconnect
  h = h.replace(/<link\b[^>]*>/gi, (t) => (/href\s*=\s*["']https:\/\/fonts\.bunny\.net\//i.test(t) && /rel\s*=\s*["'](stylesheet|preconnect)["']/i.test(t) ? t : ""));
  // href: geen javascript:/data:/vbscript:
  h = h.replace(/\shref\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, q, a, b) => { const v = (a ?? b ?? "").trim(); return /^(javascript|data|vbscript):/i.test(v.replace(/\s/g, "")) ? ' href="#contact"' : m; });
  // afbeeldingen: alleen hun eigen bestanden
  let ok = true;
  h = h.replace(/<img\b[^>]*>/gi, (t) => {
    const m = t.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    const p = m?.[1] || "";
    const naam = p.replace(/^\.?\/?afbeeldingen\//, "");
    if (!/^\.?\/?afbeeldingen\/[\w.\-]+$/.test(p) || !namen.has(naam)) return "";
    return t.replace(m[0], ` src="${imgBase}${naam}"`).replace(/\s(srcset|sizes)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  });
  // CSS: geen @import (behalve bunny), url() alleen naar eigen afbeeldingen
  h = h.replace(/@import\s+(url\()?["']?([^"')\s;]+)["']?\)?[^;]*;/gi, (m, u, url) => (/^https:\/\/fonts\.bunny\.net\//.test(url) ? m : ""));
  h = h.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, u) => {
    const naam = u.replace(/^\.?\/?afbeeldingen\//, "");
    if (/^\.?\/?afbeeldingen\/[\w.\-]+$/.test(u) && namen.has(naam)) return `url("${imgBase}${naam}")`;
    if (/^https:\/\/fonts\.bunny\.net\//.test(u) || /^data:image\/(svg\+xml|png|gif);/i.test(u)) return m;
    return "none";
  });
  if (/<script|javascript:/i.test(h)) ok = false;
  return ok ? h : null;
}

// ---------------------------------------------------------------- feiten controleren
const zicht = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&euro;/g, "€").replace(/\s+/g, " ");
const cijfers = (s) => String(s || "").replace(/\D/g, "");
export function feitencheck(html, content) {
  const bron = JSON.stringify(content);
  const bronCijfers = cijfers(bron);
  const tekst = zicht(html);
  const fouten = [];
  // telefoonnummers (ook in tel:-links)
  for (const m of html.matchAll(/tel:([+\d ()-]{8,})/gi)) if (!bronCijfers.includes(cijfers(m[1]).slice(-9))) fouten.push(`telefoon ${m[1]}`);
  for (const m of tekst.matchAll(/(?:\+31|0)[\d\s()-]{8,14}\d/g)) if (cijfers(m[0]).length >= 9 && !bronCijfers.includes(cijfers(m[0]).slice(-9))) fouten.push(`nummer ${m[0]}`);
  // e-mail
  for (const m of (html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])) if (!bron.toLowerCase().includes(m.toLowerCase())) fouten.push(`e-mail ${m}`);
  // prijzen
  for (const m of tekst.matchAll(/€\s?\d[\d.,]*/g)) { const g = cijfers(m[0]).replace(/0+$/, ""); if (g && !bronCijfers.includes(g)) fouten.push(`prijs ${m[0]}`); }
  // jaartallen, ervaring, aantallen klanten, procenten en sterren die niet in de bron staan
  const jaar = new Date().getFullYear();
  for (const m of tekst.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)) if (Number(m[1]) !== jaar && !bron.includes(m[1])) fouten.push(`jaartal ${m[1]}`);
  for (const m of tekst.matchAll(/\b(\d+)\+?\s*(jaar|klanten|projecten|reviews|sterren|%|procent)\b/gi)) if (!bron.includes(m[1])) fouten.push(`claim ${m[0]}`);
  if (/★|⭐|\b\d[.,]\d\s*\/\s*(5|10)\b/.test(tekst) && !/★|\/\s*(5|10)/.test(bron)) fouten.push("beoordeling");
  return fouten;
}

// ---------------------------------------------------------------- ontwerpen
export async function ontwerp(content, images, extra = {}) {
  const raw = await claude({ system: SYSTEM, prompt: prompt(content, images, extra), maxTokens: 20000, timeoutMs: 600000, model: extra.model });
  const namen = new Set(images.map((i) => i.name));
  const html = sanitize(raw.replace(/^```(?:html)?\s*|```\s*$/g, ""), { imgBase: "afbeeldingen/", namen });
  if (!html) return { fout: "Het ontwerp was geen geldig HTML-document." };
  if (html.length < 4000) return { fout: "Het ontwerp was te kort." };
  if (!/<img\b/i.test(html) && namen.size) return { fout: "Het ontwerp gebruikte geen foto's." };
  const fouten = feitencheck(html, content);
  if (fouten.length) return { fout: `Feitencontrole: ${fouten.slice(0, 4).join(", ")}` };
  return { html };
}

// Bij het tonen: afbeeldingspaden omzetten, onze balk en script toevoegen.
export function toonOntwerp(html, { imgBase, bodyStart = "", bodyEnd = "", headExtra = "" }) {
  let h = html.replace(/(["'(])afbeeldingen\//g, `$1${imgBase}`);
  h = h.replace(/<head\b[^>]*>/i, (m) => `${m}<meta name="robots" content="noindex,nofollow">${headExtra}`);
  // Vangnet tegen uit de hand gelopen beeldvlakken (te hoog/smal) en horizontaal scrollen.
  h = h.replace(/<\/head>/i, `<style>html,body{max-width:100%;overflow-x:hidden}img{max-width:100%}main>:first-child img,body>header+section img,main>:first-child *:has(>img){max-height:min(88vh,820px)}section img{max-height:min(90vh,900px)}</style></head>`);
  h = h.replace(/<body\b[^>]*>/i, (m) => `${m}${bodyStart}`);
  h = h.replace(/<\/body>/i, `${bodyEnd}</body>`);
  return h;
}
export const ontwerpSamenvatting = (html) => str(zicht(html).slice(0, 200), 200);
