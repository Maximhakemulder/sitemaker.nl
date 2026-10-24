// Ontwerp-agent: ontwerpt voor elk bedrijf een volledig eigen website (HTML + CSS), vanaf nul.
// Input: de gecontroleerde content.json (alleen feiten van hun eigen site), hun huisstijlkleuren, logo en foto's.
// Output: één HTML-document zonder JavaScript. We schonen het op (geen scripts, geen externe bronnen behalve
// lettertypen van Bunny Fonts, alleen hun eigen afbeeldingen) en controleren de feiten. Lukt dat niet, dan
// valt het concept terug op de vaste opmaak (templates/klantsite/render.mjs).
import { str } from "./core.mjs";
import { claude } from "./ai.mjs";
import { ICOON_NAMEN, sprite } from "./iconen.mjs";

export const SYSTEM = `Je bent art director en front-end ontwerper bij een bekroond Nederlands ontwerpbureau dat elke klant een eigen, onverwisselbare visuele identiteit geeft. Deze klant heeft eerdere voorstellen afgewezen omdat ze "template-achtig" en "standaard" voelden. Je ontwerpt nu één complete website van één pagina voor dit specifieke lokale bedrijf. Doel: een bezoeker voelt meteen "dit is een serieus, goed bedrijf" en neemt contact op.
Niveau: high-end, alsof een gerenommeerd ontwerpbureau het voor een flink budget maakte. Dat zie je aan: royale witruimte, een strak raster waarin alles uitlijnt, een duidelijke typografische schaal (grote, zelfverzekerde koppen; rustige leesbare tekst), weinig maar uitstekende elementen, foto's groot en goed uitgesneden, verfijnde details (subtiele lijnen, zachte schaduwen, nette iconen, mooie hover-states) en niets rommeligs. Liever minder secties die perfect zijn dan veel secties die half af zijn. Licht, fris en verzorgd is de basis.

## Werkwijze
Begin je antwoord met een kort ontwerpplan tussen <plan> en </plan> (maximaal 150 woorden), daarna het HTML-document. Het plan bevat:
- Onderwerp en publiek: wat doet dit bedrijf, voor wie, en wat is het belangrijkste dat de site moet bereiken.
- Concept: één sterk visueel idee dat uit HUN vak komt (materialen, gereedschap, ruimte, licht, vakjargon, hun straat/stad). Bijvoorbeeld: een installateur → technische tekening-esthetiek met maatlijnen en een strak raster; een hovenier → seizoenen en organische vormen; een kapsalon → modemagazine met grote portretfoto's; een loodgieter → helder, betrouwbaar, waterblauw met ronde vormen. Verzin het per bedrijf opnieuw.
- Kleur: 4 tot 6 kleuren met hex, opgebouwd uit HUN huisstijlkleuren (die komen uit hun logo; exact overnemen) plus neutralen die daarbij passen. Gebruik GEEN kleur die niet in hun logo of op hun site zit als merkkleur (dus geen paars als hun logo blauw/groen is).
- Achtergronden: standaard LICHT. Wit of een zachte, lichte tint van hun merkkleur als basis. Hooguit één of twee vlakken in hun volle merkkleur of donker (bijv. een CTA-band of de footer), niet de hele pagina. Geen heftige, verzadigde of donkere achtergronden over grote delen, tenzij hun eigen site zelf duidelijk donker is.
- Typografie: 1 of 2 lettertypen van Bunny Fonts met hun rol, gekozen bij dit concept (niet steeds dezelfde).
- Opbouw: de volgorde van de onderdelen en per onderdeel de lay-out in één zin.
- Signatuur: het ene element waardoor deze site onthouden wordt.
Toets daarna je plan: lijkt het op wat je voor elk ander bedrijf in deze branche zou maken? Pas het dan aan. Bouw daarna het plan.

## Ontwerpprincipes
- Gebruik je durf op één plek: één memorabel element, de rest rustig en gedisciplineerd. Haal één accessoire weg voordat je klaar bent.
- Typografie draagt de persoonlijkheid. Een duidelijke typeschaal, bewuste gewichten en regelafstand, regels korter dan ~75 tekens. Koppen mogen groot en uitgesproken zijn.
- De hero opent met het meest kenmerkende uit hun wereld, in de vorm die het beste werkt (grote foto, collage, typografie, beeld met overlappend tekstvlak). Elke hero anders.
- Structuur is informatie: nummers alleen als iets echt een volgorde is (zoals een werkwijze), lijnen en labels alleen als ze iets betekenen.
- Ritme: wissel af tussen vol beeld, ruimte, kolommen en asymmetrie, zodat het geen rij gelijke blokken wordt.
- Schrijf geen nieuwe verkooppraat: de teksten komen uit de JSON. Knoppen zeggen precies wat er gebeurt ("Bel 010 …", "Plan een afspraak").

## Beweging en iconen (mag en moet, met smaak)
- Beweging bij het scrollen: geef blokken die mooi binnen mogen komen het attribuut data-reveal (eventueel data-reveal="links", "rechts", "schaal"). Ons script zet de class "js" op <html> en de class "is-zichtbaar" op een element zodra het in beeld komt. Schrijf daarvoor zelf de CSS, bijv. .js [data-reveal]{opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.7,.2,1)} .js [data-reveal].is-zichtbaar{opacity:1;transform:none}, met vertraging via style-variabele of :nth-child voor reeksen. Zonder "js" moet alles gewoon zichtbaar zijn. Daarnaast mag: een rustige laadanimatie in de hero, een doorlopende strook (marquee) met hun diensten, subtiele parallax met CSS, hover-effecten op foto's en knoppen. Alles uit bij prefers-reduced-motion.
- Woorden die oplichten: zet data-scrub op één grote zin (bijv. hun belangrijkste belofte uit de JSON); ons script laat de woorden één voor één oplichten tijdens het scrollen. Schrijf zelf de CSS: [data-scrub] .w{opacity:.16;transition:opacity .2s} [data-scrub] .w.aan{opacity:1}.
- Parallax: data-parallax="-0.08" (of 0.12 enz.) op een <img> in een container met overflow:hidden; maak de afbeelding ~115-125% hoog zodat er ruimte is om te bewegen.
- Verhaal bij het scrollen (het pronkstuk, gebruik het één keer, meestal bij de diensten): een sectie met data-verhaal, daarin een kolom die blijft staan (position:sticky) en een reeks blokken met data-stap (elk met style="--kleur:#hex" en eventueel data-stand="0-100"). Het blok dat midden in beeld staat krijgt de class is-actief; de sectie krijgt --temp = de kleur van dat blok; elementen met data-toon="icoon" (een <svg> met <use>) en data-toon="titel" nemen het icoon en de kop van dat blok over; een SVG-pad met data-voortgang en pathLength="100" stroke-dasharray="100" krijgt stroke-dashoffset = 100 - stand. Bedenk een visueel idee uit HUN vak voor dat vaste element (een thermostaatwijzer voor een installateur, een kaart met route voor een verhuizer, een stapel lagen voor een stukadoor). Op mobiel geen sticky: daar bijvoorbeeld een veegrij (scroll-snap).
- Iconen: gebruik onze lijn-iconen via <svg class="..." aria-hidden="true"><use href="#i-NAAM"/></svg> (kleur via color, grootte via width/height). Beschikbaar: ${ICOON_NAMEN.join(", ")}. Gebruik ze waar ze helpen (contact, openingstijden, diensten als er een passend icoon is), consequent in één stijl.

## Vermijd deze standaardpatronen (verraden een template of AI)
- Crème achtergrond met een serif-kop en terracotta accent; bijna-zwart met één fel neon-accent; krantenlay-out met haarlijnen en nul afronding — tenzij het echt uit hun huisstijl komt.
- De SaaS-kaartjes-set: alles in gelijke afgeronde kaarten met dezelfde zachte schaduw en verlopen als decoratie.
- Template-franje: een label in hoofdletters met letterspatie boven elke kop, opsommingen met middenpunten, een pijltje achter elke knop, monospace voor kleine labels, één woord in de kop cursief of in een andere kleur, standaard "tekst links, foto rechts" in elke sectie, 01/02/03 bij dingen die geen volgorde zijn.

## Harde regels
- Antwoord: <plan>…</plan> en daarna één compleet HTML5-document (<!doctype html> … </html>), alle CSS in één <style> in de <head>. Geen markdown.
- GEEN eigen JavaScript (ons script doet de beweging via de data-attributen hierboven), geen <script>, geen event-attributen, geen <iframe>, geen <form>, geen <foreignObject>, geen externe afbeeldingen of video. Inline SVG voor eenvoudige vormen en iconen mag. Externe bronnen alleen: lettertypen via <link rel="stylesheet" href="https://fonts.bunny.net/css?family=..."> (maximaal 2 families, namen in kleine letters met streepjes, bijv. family=instrument-serif:400|manrope:400,600).
- Teksten: ALLEEN teksten en feiten uit de JSON. Inkorten, opdelen en korte knop-/kopjeslabels ("Bel ons", "Onze diensten", "Openingstijden", "Route plannen") mag. GEEN feiten toevoegen: geen jaartallen, aantallen, ervaring, reviews, sterren, keurmerken, garanties, prijzen of beloftes die niet in de JSON staan. Telefoon, e-mail, adres, prijzen en tijden exact overnemen.
- Afbeeldingen: alleen bestanden uit de lijst, als src="afbeeldingen/<naam>". Gebruik ze ruim (bij voorkeur allemaal), altijd met object-fit en een vaste aspect-ratio tussen 3:4 en 16:9 (of een vaste hoogte), nooit extreem lange of smalle vlakken. Logo (als er een is) in de kop en onderaan met class="logo-img", nooit vervormd. Sfeerbeelden mogen, maar zet hun eigen foto's voorop.
- Leesbaarheid: overal minimaal 4,5:1 contrast (WCAG AA). Nooit donkere tekst op donker of lichte tekst op licht. Tekst op een foto alleen met een duidelijke overlay. Knoppen met duidelijk contrast.
- Responsive, mobiel eerst, perfect op 360px, 768px en 1280px+. Geen horizontaal scrollen. Hero op desktop maximaal één schermhoogte; op mobiel al sterk beeld in het eerste scherm. Koppen met clamp(). Knoppen minimaal 48px hoog. Op mobiel onderaan een vaste balk <nav class="sm-actiebalk"> met de belangrijkste acties (bellen als er een nummer is, WhatsApp als dat er is, de hoofdactie), met genoeg ruimte onderaan de pagina.
- Techniek: kop met logo/naam, navigatie (op mobiel alleen logo + belknop of hoofdactie) en hoofdactie; secties met id="diensten", id="over" (als er een over-tekst is), id="fotos" (als er foto's zijn) en id="contact"; hoofdactie-knoppen met class="sm-hoofdactie"; openingstijden (als die er zijn) als <dl class="sm-tijden"> met per regel <div><dt>dag</dt><dd>tijd</dd></div>; tel:, mailto:, https://wa.me/<internationaal nummer zonder +> en https://www.google.com/maps/search/?api=1&query=<adres>; footer met naam en plaats. Semantisch: header, main, section, footer, één h1.
- Eindcontrole voordat je antwoordt: klopt het contrast overal, werkt het op 360px zonder horizontaal scrollen, zijn alle beeldvlakken normaal van verhouding, staat er geen enkel verzonnen feit in, en is het herkenbaar HUN bedrijf (logo, kleuren, foto's)? Houd de CSS onder ~26 kB.`;

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
export function toonOntwerp(html, { imgBase, bodyStart = "", bodyEnd = "", headExtra = "" }) {
  let h = html.replace(/(["'(])afbeeldingen\//g, `$1${imgBase}`);
  h = h.replace(/<head\b[^>]*>/i, (m) => `${m}<meta name="robots" content="noindex,nofollow">${headExtra}`);
  // Vangnet tegen uit de hand gelopen beeldvlakken (te hoog/smal) en horizontaal scrollen.
  h = h.replace(/<\/head>/i, `<style>html,body{max-width:100%;overflow-x:hidden}img{max-width:100%}main>:first-child img,body>header+section img,main>:first-child *:has(>img){max-height:min(88vh,820px)}section img{max-height:min(90vh,900px)}</style></head>`);
  h = h.replace(/<body\b[^>]*>/i, (m) => `${m}${sprite()}${bodyStart}`);
  h = h.replace(/<\/body>/i, `${bodyEnd}</body>`);
  return h;
}
export const ontwerpSamenvatting = (html) => str(zicht(html).slice(0, 200), 200);
