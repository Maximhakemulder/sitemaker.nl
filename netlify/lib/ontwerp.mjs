// Ontwerp-agent: ontwerpt voor elk bedrijf een volledig eigen website (HTML + CSS), vanaf nul.
// Input: de gecontroleerde content.json (alleen feiten van hun eigen site), hun huisstijlkleuren, logo en foto's.
// Output: één HTML-document zonder JavaScript. We schonen het op (geen scripts, geen externe bronnen behalve
// lettertypen van Bunny Fonts, alleen hun eigen afbeeldingen) en controleren de feiten. Lukt dat niet, dan
// valt het concept terug op de vaste opmaak (templates/klantsite/render.mjs).
import { str } from "./core.mjs";
import { claude } from "./ai.mjs";
import { ICOON_NAMEN, sprite } from "./iconen.mjs";

export const SYSTEM = `Je bent art director en front-end ontwerper bij een bekroond Nederlands ontwerpbureau. Je bureau staat erom bekend dat elke klant een eigen, onverwisselbare website krijgt die je niet vergeet: high-end, verzorgd tot in de details en met beweging die het verhaal van het bedrijf vertelt. Je ontwerpt nu één complete website van één pagina voor dit lokale bedrijf. De eigenaar moet bij het openen denken: "wauw, is dit mijn bedrijf?" en een bezoeker moet meteen voelen "dit is een serieus, goed bedrijf" en contact opnemen.

## Werkwijze
Begin je antwoord met een kort ontwerpplan tussen <plan> en </plan> (maximaal 170 woorden), daarna het HTML-document. Het plan bevat:
- Onderwerp: wat doet dit bedrijf, voor wie, en wat moet de site bereiken (meestal: bellen of een afspraak).
- Idee uit hun vak: één sterk visueel idee uit HUN wereld (gereedschap, materiaal, ruimte, ritme van hun werk, hun stad). Voorbeelden van het soort denken, niet om te kopiëren: een klimaatinstallateur → een thermostaatwijzer die per dienst van warm naar koel draait; een kapper → een modemagazine met grote portretten die openen als een gordijn; een hovenier → een tuinpad dat zich tekent terwijl je scrolt; een schilder → kleurvlakken die zich over de pagina leggen; een bakker → de dag van vroeg tot laat, van deeg tot vitrine.
- Pronkstuk: welke beweging dat idee laat leven (zie "Beweging") en waar het staat.
- Kleur: 4 tot 6 hex-kleuren uit HUN huisstijl (exact overnemen) plus passende neutralen.
- Typografie: 1 of 2 lettertypen van Bunny Fonts, gekozen bij dit idee (wissel per bedrijf).
- Opbouw: de volgorde van de onderdelen, per onderdeel de lay-out in één zin, en hoe het op mobiel werkt.
Toets je plan: zou je dit voor elk ander bedrijf in deze branche ook zo maken? Dan is het te algemeen; maak het specifieker. Bouw daarna precies het plan.

## Wat high-end hier betekent
- Licht en fris als basis: wit of een zachte lichte tint van hun merkkleur. Hooguit één of twee vlakken donker of in hun volle merkkleur (bijv. een doorlopende strook of het contactblok). Geen zware, verzadigde of donkere achtergronden over grote delen, tenzij hun eigen site echt donker is.
- Typografie draagt de site: grote, zelfverzekerde koppen (clamp, tot ~90px op desktop), strakke regelafstand in koppen, rustige leestekst (17-19px, regels korter dan ~70 tekens), duidelijke schaal.
- Royale witruimte, een strak raster waarin alles uitlijnt, consequente afstanden. Niets rommeligs: liever vijf perfecte secties dan negen halve.
- Foto's groot en goed uitgesneden, met een vaste verhouding. Mensen en hun werk zijn het sterkst; een foto van de eigenaar of het team hoort vooraan.
- Verfijnde details: zachte schaduwen, subtiele lijnen, nette iconen, hover-states die iets betekenen, een badge of tekstvlak dat over een foto valt.
- Wissel het ritme: vol beeld, ruimte, een asymmetrische compositie, een doorlopende strook. Geen rij gelijke blokken.
- De teksten komen uit de JSON. Knoppen zeggen precies wat er gebeurt ("Bel 010 …", "Plan een afspraak").

## Beweging (verplicht, met smaak)
Ons script voert de beweging uit; jij zet de data-attributen en schrijft zelf de CSS. Ons script zet de class "js" op <html>; schrijf beginstanden altijd met .js ervoor, zodat zonder JavaScript alles gewoon zichtbaar is. Zet bij prefers-reduced-motion alle animaties uit.
Elke site heeft:
1. Een laadmoment in de hero: bijv. kopregels die één voor één omhoog schuiven (elke regel in een span met overflow:hidden), beeld dat iets inzoomt, tekst en knoppen die kort daarna invagen. Eén samenhangende reeks, niet alles tegelijk.
2. Eén pronkstuk dat aan het scrollen hangt en uit hun vak komt. Kies wat het best bij het idee past, en niet steeds hetzelfde:
   - Scroll-verhaal: <section data-verhaal> met een kolom die blijft staan (position:sticky) en blokken met data-stap (elk style="--kleur:#hex", optioneel data-stand="0-100"). Het blok midden in beeld krijgt .is-actief; de sectie krijgt --temp (kleur van dat blok) en data-actief="n"; [data-toon="icoon"] (een <svg> met <use>), [data-toon="titel"] en [data-toon="nummer"] nemen icoon, kop en nummer over; een SVG-pad met data-voortgang, pathLength="100" en stroke-dasharray="100" vult zich tot de stand.
   - Tekenende lijn: data-tekenen op een inline <svg> met paden (stroke, fill:none), bijv. een leiding, een route, een schaarlijn of een plattegrond die zich tekent terwijl je scrolt.
   - Horizontaal spoor: <section data-horizontaal> met daarin een sticky houder (position:sticky;top:0;height:100vh;overflow:hidden) en een rij [data-spoor] (display:flex, breder dan het scherm), bijv. hun foto's of diensten die zijwaarts voorbijschuiven terwijl je naar beneden scrolt. Alleen vanaf 900px; daaronder maak je er zelf een veegrij van (overflow-x:auto, scroll-snap).
   - Onthulling: data-onthul (of ="links" / ="cirkel") op een groot beeld dat zich opent terwijl het in beeld komt.
3. Twee of drie ondersteunende bewegingen, bijvoorbeeld:
   - data-reveal (of ="links" / "rechts" / "schaal"): krijgt .is-zichtbaar zodra in beeld. CSS bijv. .js [data-reveal]{opacity:0;transform:translateY(32px);transition:opacity .9s ease,transform .9s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)} .js [data-reveal].is-zichtbaar{opacity:1;transform:none}. Gebruik het voor blokken, niet voor elk woord.
   - data-scrub op één grote zin (hun belangrijkste belofte uit de JSON): woorden (span.w) krijgen .aan tijdens het scrollen. CSS: .js [data-scrub] .w{opacity:.15;transition:opacity .2s} .js [data-scrub] .w.aan{opacity:1}.
   - data-parallax="-0.08" (tot ±0.15) op een <img> in een houder met overflow:hidden; maak het beeld 115-125% hoog.
   - data-schaal="1.2" op een <img> in een houder met overflow:hidden: zoomt van 1.2 naar 1 tijdens het in beeld scrollen.
   - Een doorlopende strook (marquee, pure CSS-animatie) met hun diensten en iconen.
   - data-magneet op de hoofdknop (beweegt licht mee met de muis).
   - data-leesbalk op een dunne vaste balk (transform-origin:left) die laat zien hoe ver je gelezen hebt.
   - De variabele --scroll (0 tot 1) op <html>, bruikbaar in calc() voor bijv. een kleurverloop of draaiende vorm.
Geen lege schermen: koppel hoogtes nooit los aan de schermhoogte. Stappen in een scroll-verhaal: min-height:min(46vh,440px) (ons vangnet dwingt dat af), niet-actieve stappen blijven leesbaar (opacity ≥ 0,5), de vaste kolom maximaal één scherm hoog en verticaal gecentreerd. Een horizontaal spoor alleen als de rij duidelijk breder is dan een breed scherm (minstens 6 grote kaarten of foto's); ons script zet het anders uit en dan moet de rij er als normale rij goed uitzien. Secties nooit min-height:100vh behalve de hero. Denk aan grote schermen (1920 en 2560 breed): niets mag daar als een leeg vlak ogen.
Beweging ondersteunt de inhoud en blijft rustig en vloeiend (ease-out, 0,6-1 s). Niets knippert, niets blijft eindeloos stuiteren.

## Iconen
Gebruik onze lijn-iconen via <svg class="..." aria-hidden="true"><use href="#i-NAAM"/></svg> (kleur via color, grootte via width/height). Beschikbaar: ${ICOON_NAMEN.join(", ")}. Gebruik ze bij diensten (als er een passend icoon is), contact, openingstijden en in de strook, consequent in één stijl. Je mag ook zelf eenvoudige inline SVG-vormen tekenen die bij het idee horen.

## Vermijd (verraadt een template of AI)
- Crème achtergrond met serif-kop en terracotta accent; bijna-zwart met één neon-accent; krantenlay-out met haarlijnen en nul afronding (tenzij het echt hun huisstijl is).
- Alles in gelijke afgeronde kaarten met dezelfde schaduw; verlopen als decoratie.
- Een label in hoofdletters met letterspatie boven elke kop, middenpunten tussen woorden, een pijltje achter elke knop, één woord in de kop in een andere kleur, "tekst links, foto rechts" in elke sectie, 01/02/03 bij dingen die geen volgorde zijn.

## Harde regels
- Antwoord: <plan>…</plan> en daarna één compleet HTML5-document (<!doctype html> … </html>), alle CSS in één <style> in de <head>. Geen markdown.
- GEEN eigen JavaScript (de beweging gaat via de data-attributen), geen <script>, geen event-attributen, geen <iframe>, geen <form>, geen <foreignObject>, geen externe afbeeldingen of video. Externe bronnen alleen: lettertypen via <link rel="stylesheet" href="https://fonts.bunny.net/css?family=..."> (maximaal 2 families, namen in kleine letters met streepjes, bijv. family=bricolage-grotesque:500,700,800|instrument-sans:400,500,600).
- Teksten: ALLEEN teksten en feiten uit de JSON. Inkorten, opdelen en korte labels ("Bel ons", "Onze diensten", "Openingstijden", "Route plannen") mag. GEEN feiten toevoegen: geen jaartallen, aantallen, ervaring, reviews, sterren, keurmerken, garanties, prijzen of beloftes die niet in de JSON staan. Telefoon, e-mail, adres, prijzen en tijden exact overnemen.
- Kleur: gebruik alleen hun huisstijlkleuren (uit hun logo) als merkkleur, plus neutralen. Verzin geen andere merkkleur. Bij diensten mogen subtiele tinten die bij het idee horen (warm en koel bij een klimaatinstallateur), maar de hoofdkleur blijft van hen.
- Afbeeldingen: alleen bestanden uit de lijst, als src="afbeeldingen/<naam>". Gebruik een foto alleen als hij echt bij hun werk past (lees de omschrijving); liever minder foto's dan een verkeerde (bijv. geen zonnepanelen bij een CV-installateur). Altijd object-fit en een vaste aspect-ratio tussen 3:4 en 16:9 (of een vaste hoogte); nooit extreem lange of smalle vlakken. Eigen foto's voorop, sfeerbeelden aanvullend. Logo (als er een is) in de kop en onderaan met class="logo-img", nooit vervormd.
- Leesbaarheid: overal minimaal 4,5:1 contrast. Nooit donkere tekst op donker of lichte tekst op licht. Tekst op een foto alleen met een duidelijke overlay. Knoppen met duidelijk contrast.
- Responsive, mobiel eerst, perfect op 360px, 768px en 1280px+. Geen horizontaal scrollen (zet overflow-x:clip op body). Hero op desktop maximaal één schermhoogte; op mobiel al sterk beeld of een sterke kop in het eerste scherm. Op mobiel geen sticky kolommen; maak lange rijen kaarten daar een veegrij. Knoppen minimaal 48px hoog. Op mobiel onderaan een vaste balk <nav class="sm-actiebalk"> met de belangrijkste acties (bellen als er een nummer is, WhatsApp als dat er is, anders mailen of de hoofdactie), met ruimte onderaan de pagina.
- Techniek: <header> met logo/naam, navigatie (op mobiel alleen logo + belknop of hoofdactie) en hoofdactie; secties met id="diensten", id="over" (als er een over-tekst is), id="fotos" (als er foto's zijn) en id="contact"; hoofdactie-knoppen met class="sm-hoofdactie"; openingstijden (als die er zijn) als <dl class="sm-tijden"> met per regel <div><dt>dag</dt><dd>tijd</dd></div>; tel:, mailto:, https://wa.me/<internationaal nummer zonder +> en https://www.google.com/maps/search/?api=1&query=<adres>; footer met naam en plaats. Semantisch: header, main, section, footer, één h1.
- Eindcontrole voordat je antwoordt: klopt het contrast overal, werkt het op 360px zonder horizontaal scrollen, zijn alle beeldvlakken normaal van verhouding, passen alle foto's bij hun werk, staat er geen enkel verzonnen feit in, is er een laadmoment en een pronkstuk, en is het herkenbaar HUN bedrijf (logo, kleuren, foto's)? Houd de CSS onder ~30 kB.`;

function prompt(content, images, extra) {
  const lijst = images.filter((i) => !i.logo).map((i) => `- afbeeldingen/${i.name} (${i.w}x${i.h}${i.stock ? ", sfeerbeeld" : ""}${i.alt ? `, "${i.alt}"` : ""})`).join("\n") || "- geen";
  const logo = images.find((i) => i.logo);
  return `Bedrijf: ${content.bedrijf?.naam}${extra.category ? ` (${extra.category})` : ""}${content.bedrijf?.plaats ? `, ${content.bedrijf.plaats}` : ""}
Huisstijlkleuren (${content.kleuren?.bron === "logo" ? "uit hun logo" : "hun logo is zwart/wit of onbekend; door ons gekozen bij hun vak"}, belangrijkste eerst): ${[content.kleuren?.primair, content.kleuren?.accent, ...(extra.kleuren || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "onbekend: kies een rustig palet bij hun vak, met lichte achtergronden"}
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
  h = h.replace(/<(script|iframe|object|embed|form|template|noscript|svg:script|frameset|frame|applet|portal|foreignObject|animate|set)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|base|frame|applet|portal|input|button|textarea|select|foreignObject|animate|set)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
  // <use> alleen naar onze eigen iconen in de pagina (#i-...)
  h = h.replace(/<use\b[^>]*>/gi, (t) => (/^<use\s+href\s*=\s*["']#i-[a-z]+["']\s*\/?>$/i.test(t.trim()) ? t : ""));
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
// ---- kleurcontrole: geen vreemde merkkleur en niet te veel heftige/donkere achtergronden
const rgbVan = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
function hsl(h) {
  const [r, g, b] = rgbVan(h), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hh * 60 + 360) % 360, s, l };
}
export function kleurcheck(html, merk = []) {
  const css = (html.match(/<style[\s\S]*?<\/style>/gi) || []).join("\n");
  const tel = {};
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { const k = m[0].toLowerCase(); tel[k] = (tel[k] || 0) + 1; }
  const merkH = merk.filter(Boolean).map(hsl).filter((x) => x.s > 0.2);
  const problemen = [];
  if (merkH.length) {
    const vreemd = Object.keys(tel).filter((k) => { const c = hsl(k); if (c.s < 0.3 || c.l < 0.12 || c.l > 0.92) return false; return !merkH.some((m) => Math.min(Math.abs(m.h - c.h), 360 - Math.abs(m.h - c.h)) < 35); });
    const zwaar = vreemd.filter((k) => tel[k] >= 2);
    if (zwaar.length) problemen.push(`kleuren die niet in hun logo zitten: ${zwaar.slice(0, 4).join(", ")}`);
  }
  // achtergronden
  const bg = [...css.matchAll(/background(?:-color)?\s*:\s*([^;}]+)/gi)].map((m) => (m[1].match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i) || [])[0]).filter(Boolean);
  const heftig = bg.filter((k) => { const c = hsl(k); return c.l < 0.3 || (c.s > 0.55 && c.l < 0.6); });
  if (bg.length >= 4 && heftig.length / bg.length > 0.45) problemen.push("te veel donkere of felle achtergronden");
  return problemen;
}

export async function ontwerp(content, images, extra = {}) {
  // Het sterkste model voor het ontwerp (AI_MODEL_ONTWERP); lukt dat niet, dan het standaardmodel.
  const start = Date.now();
  const merk = [content.kleuren?.primair, content.kleuren?.accent, ...(extra.kleuren || [])].filter(Boolean);
  const namen = new Set(images.map((i) => i.name));
  const maak = async (feedback = "") => {
    const vraag = { system: SYSTEM, prompt: prompt(content, images, extra) + (feedback ? `\n\nLET OP, een eerdere versie werd afgekeurd: ${feedback}. Los dat op.` : ""), maxTokens: 20000, timeoutMs: 780000 };
    let raw;
    try { raw = await claude({ ...vraag, model: extra.model || "claude-opus-5-5" }); }
    catch (e) { if (e.status && e.status < 500 && e.status !== 429) raw = await claude(vraag); else throw e; }
    raw = String(raw || "").replace(/<plan>[\s\S]*?<\/plan>/i, "");
    const html = sanitize(raw.replace(/^```(?:html)?\s*|```\s*$/g, ""), { imgBase: "afbeeldingen/", namen });
    if (!html) return { fout: "Het ontwerp was geen geldig HTML-document." };
    if (html.length < 4000) return { fout: "Het ontwerp was te kort." };
    if (!/<img\b/i.test(html) && namen.size) return { fout: "Het ontwerp gebruikte geen foto's." };
    const fouten = feitencheck(html, content);
    if (fouten.length) return { fout: `Feitencontrole: ${fouten.slice(0, 4).join(", ")}` };
    return { html, kleur: kleurcheck(html, merk) };
  };
  let r = await maak();
  // Eén herkansing als er tijd is (achtergrondfunctie max. 15 min).
  const opnieuw = r.fout?.startsWith("Feitencontrole") ? r.fout : r.kleur?.length ? r.kleur.join("; ") : "";
  if (opnieuw && Date.now() - start < 330000) { const r2 = await maak(opnieuw).catch(() => null); if (r2?.html && (!r2.kleur?.length || !r.html)) r = r2; }
  if (!r.html) return { fout: r.fout };
  return { html: r.html, fout: r.kleur?.length ? `Let op (kleurcheck): ${r.kleur.join("; ")}` : "" };
}

// Bij het tonen: afbeeldingspaden omzetten, onze balk en script toevoegen.
// Vangnet tegen te hoge beeldvlakken, horizontaal scrollen en lege schermen (ook in scripts/concept-taak/bekijk.mjs).
export const VANGNET_CSS = `html,body{max-width:100%;overflow-x:clip}img{max-width:100%}main>:first-child img,body>header+section img,main>:first-child *:has(>img){max-height:min(88vh,820px)}section img{max-height:min(90vh,900px)}[data-verhaal] [data-stap]{min-height:min(46vh,440px)!important}[data-horizontaal-uit]{height:auto!important}[data-horizontaal-uit]>*{position:relative!important;height:auto!important;min-height:0!important;top:auto!important;overflow:visible!important}[data-horizontaal-uit] [data-spoor]{flex-wrap:wrap;width:auto!important;max-width:100%;transform:none!important}@media(max-width:899px){[data-horizontaal-uit] [data-spoor]{flex-wrap:nowrap;overflow-x:auto;scroll-snap-type:x mandatory}}`;

export function toonOntwerp(html, { imgBase, bodyStart = "", bodyEnd = "", headExtra = "" }) {
  let h = html.replace(/(["'(])afbeeldingen\//g, `$1${imgBase}`);
  h = h.replace(/<head\b[^>]*>/i, (m) => `${m}<meta name="robots" content="noindex,nofollow">${headExtra}`);
  // Vangnet tegen uit de hand gelopen beeldvlakken (te hoog/smal) en horizontaal scrollen.
  h = h.replace(/<\/head>/i, `<style>${VANGNET_CSS}</style></head>`);
  h = h.replace(/<body\b[^>]*>/i, (m) => `${m}${sprite()}${bodyStart}`);
  h = h.replace(/<\/body>/i, `${bodyEnd}</body>`);
  return h;
}
export const ontwerpSamenvatting = (html) => str(zicht(html).slice(0, 200), 200);
