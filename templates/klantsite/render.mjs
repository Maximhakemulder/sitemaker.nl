// Sitemaker klantsite: zet content.json om in één HTML-pagina. Wordt gebruikt door build.mjs (de echte site)
// en door Sitemaker HQ voor concept-websites (sitemaker.nl/voorbeeld/...). Geen afhankelijkheden.
//
// Ontwerp: verkopen eerst. Grote hero met hun eigen foto en kleuren, één duidelijke actie die overal terugkomt
// (kop, hero, band, contact en de vaste actiebalk op mobiel), "vandaag open tot" uit hun eigen openingstijden,
// een prijslijst als er prijzen zijn, een galerij met ritme en een contactblok met route en tijden.
export function render(c, { imgBase = "afbeeldingen/", year = new Date().getFullYear(), robots = "", extraHead = "", bodyStart = "", bodyEnd = "" } = {}) {
  // Per stijl: lettertypen (Bunny Fonts, EU, zonder tracking), basiskleuren en vorm.
  const THEMAS = {
    elegant: { primair: "#141015", accent: "#D9B77C", donker: true, kop: '"Cormorant", Georgia, serif', tekstFont: '"Jost", system-ui, sans-serif', fonts: "cormorant:500,600,700|jost:400,500,600", r: 2, kopGewicht: 600, kopCase: "none", kopSpatie: "-0.01em" },
    stoer: { primair: "#111111", accent: "#FFD400", donker: false, kop: '"Anton", Impact, sans-serif', tekstFont: '"Barlow", system-ui, sans-serif', fonts: "anton:400|barlow:400,500,600,700", r: 0, kopGewicht: 400, kopCase: "uppercase", kopSpatie: "0.01em" },
    natuur: { primair: "#2F5A37", accent: "#C8783C", donker: false, kop: '"Young Serif", Georgia, serif', tekstFont: '"Figtree", system-ui, sans-serif', fonts: "young-serif:400|figtree:400,500,600,700", r: 22, kopGewicht: 400, kopCase: "none", kopSpatie: "-0.015em" },
    zacht: { primair: "#5B3FD9", accent: "#22C3B5", donker: false, kop: '"Bricolage Grotesque", system-ui, sans-serif', tekstFont: '"Figtree", system-ui, sans-serif', fonts: "bricolage-grotesque:600,700,800|figtree:400,500,600,700", r: 18, kopGewicht: 700, kopCase: "none", kopSpatie: "-0.03em" },
  };
  const thema = THEMAS[c.thema] ? c.thema : "natuur";
  const T = { ...THEMAS[thema] };

  // Elke site anders: lettertypen, hero, diensten-opmaak, vorm en sfeer kiest Claude bij hun merk (content.ontwerp).
  // Ontbreekt een keuze, dan volgt hij uit de naam (vast per bedrijf), zodat twee kappers nooit hetzelfde ogen.
  const FONTS = {
    klassiek: { kop: '"Cormorant", Georgia, serif', tekst: '"Jost", system-ui, sans-serif', f: "cormorant:500,600,700|jost:400,500,600", g: 600, sp: "-0.01em", hoofd: "none" },
    luxe: { kop: '"Bodoni Moda", Didot, Georgia, serif', tekst: '"Manrope", system-ui, sans-serif', f: "bodoni-moda:500,600,700|manrope:400,500,600,700", g: 500, sp: "-0.02em", hoofd: "none" },
    editorial: { kop: '"DM Serif Display", Georgia, serif', tekst: '"DM Sans", system-ui, sans-serif', f: "dm-serif-display:400|dm-sans:400,500,600,700", g: 400, sp: "-0.015em", hoofd: "none" },
    warm: { kop: '"Young Serif", Georgia, serif', tekst: '"Figtree", system-ui, sans-serif', f: "young-serif:400|figtree:400,500,600,700", g: 400, sp: "-0.015em", hoofd: "none" },
    modern: { kop: '"Fraunces", Georgia, serif', tekst: '"Figtree", system-ui, sans-serif', f: "fraunces:500,600,700|figtree:400,500,600,700", g: 600, sp: "-0.025em", hoofd: "none" },
    ambacht: { kop: '"Zilla Slab", Rockwell, serif', tekst: '"Karla", system-ui, sans-serif', f: "zilla-slab:600,700|karla:400,500,600,700", g: 700, sp: "-0.01em", hoofd: "none" },
    stoer: { kop: '"Anton", Impact, sans-serif', tekst: '"Barlow", system-ui, sans-serif', f: "anton:400|barlow:400,500,600,700", g: 400, sp: "0.01em", hoofd: "uppercase" },
    strak: { kop: '"Sora", system-ui, sans-serif', tekst: '"DM Sans", system-ui, sans-serif', f: "sora:600,700|dm-sans:400,500,600,700", g: 700, sp: "-0.035em", hoofd: "none" },
    speels: { kop: '"Bricolage Grotesque", system-ui, sans-serif', tekst: '"Figtree", system-ui, sans-serif', f: "bricolage-grotesque:600,700,800|figtree:400,500,600,700", g: 700, sp: "-0.03em", hoofd: "none" },
  };
  const OPTIES = { hero: ["split", "volbeeld", "kader", "typo", "collage"], diensten: ["kaarten", "rijen", "lijst", "foto"], vorm: ["rond", "zacht", "strak"], sfeer: ["licht", "donker", "merk"], kopstijl: ["lijn", "midden", "groot"] };
  const aantalFotos = new Set([c.hero?.foto, c.over?.foto, ...(c.fotos || [])].filter(Boolean)).size;
  const STANDAARD = { elegant: { fonts: ["klassiek", "luxe", "editorial"], sfeer: "donker", vorm: "strak" }, stoer: { fonts: ["stoer", "ambacht", "strak"], sfeer: "licht", vorm: "strak" }, natuur: { fonts: ["warm", "modern", "ambacht"], sfeer: "licht", vorm: "rond" }, zacht: { fonts: ["speels", "strak", "modern"], sfeer: "licht", vorm: "zacht" } }[thema];
  let hash = 0; for (const ch of String(c.bedrijf?.naam || "x")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const kies = (lijst, n) => lijst[(hash >>> n) % lijst.length];
  const w = c.ontwerp || {};
  const O = {
    fonts: FONTS[w.fonts] ? w.fonts : kies(STANDAARD.fonts, 0),
    hero: OPTIES.hero.includes(w.hero) ? w.hero : kies(aantalFotos >= 4 ? ["split", "volbeeld", "kader", "collage"] : ["split", "volbeeld", "kader"], 3),
    diensten: OPTIES.diensten.includes(w.diensten) ? w.diensten : kies(aantalFotos >= 4 ? ["kaarten", "rijen", "foto", "foto"] : ["kaarten", "rijen"], 6),
    volgorde: kies(aantalFotos >= 5 ? [0, 1, 2] : [0, 1], 9),
    kopstijl: OPTIES.kopstijl.includes(w.kopstijl) ? w.kopstijl : kies(OPTIES.kopstijl, 12),
    vorm: OPTIES.vorm.includes(w.vorm) ? w.vorm : STANDAARD.vorm,
    sfeer: OPTIES.sfeer.includes(w.sfeer) ? w.sfeer : STANDAARD.sfeer,
  };
  const F = FONTS[O.fonts];
  Object.assign(T, { kop: F.kop, tekstFont: F.tekst, fonts: F.f, kopGewicht: F.g, kopSpatie: F.sp, kopCase: F.hoofd, donker: O.sfeer === "donker", r: { rond: 26, zacht: 14, strak: 2 }[O.vorm] });
  const rond = O.vorm === "rond", strak = O.vorm === "strak", hoofdletters = F.hoofd === "uppercase";

  // ---------- kleuren: hun huisstijl, altijd leesbaar
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : null);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (a) => "#" + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => toHex(rgb(a).map((x, i) => x + (rgb(b)[i] - x) * t));
  const lum = (h) => { const [r, g, b] = rgb(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const opTekst = (bg) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");
  // Maak een kleur donkerder/lichter tot hij genoeg contrast heeft met de achtergrond.
  const leesbaar = (kleur, bg, min = 4.5) => { let k = kleur; const naar = lum(bg) > 0.4 ? "#000000" : "#ffffff"; for (let i = 0; i < 12 && contrast(k, bg) < min; i++) k = mix(k, naar, 0.12); return k; };

  let merk = hex(c.kleuren?.primair) || THEMAS[thema].primair;
  let accent = hex(c.kleuren?.accent) || (hex(c.kleuren?.primair) ? mix(merk, T.donker ? "#ffffff" : "#000000", 0.25) : THEMAS[thema].accent);
  let bg, ink, vlak, lijn, kaart;
  if (T.donker) { bg = mix("#0d0b0e", merk, 0.07); ink = "#F4EEE7"; kaart = mix(bg, "#ffffff", 0.05); }
  else if (O.sfeer === "merk") { bg = mix("#ffffff", merk, 0.13); ink = mix("#121016", merk, 0.25); kaart = "#FFFFFF"; }
  else if (hoofdletters) { bg = "#F3F2EE"; ink = "#111111"; kaart = "#FFFFFF"; }
  else { bg = mix("#FBF9F5", merk, 0.04); ink = mix("#15131A", merk, 0.18); kaart = "#FFFFFF"; }
  if (contrast(ink, bg) < 7) ink = leesbaar(ink, bg, 7);
  vlak = T.donker ? mix(bg, accent, 0.09) : mix(bg, merk, O.sfeer === "merk" ? 0.12 : 0.07);
  lijn = mix(bg, ink, 0.14);
  // Knoppen en banden: altijd goed leesbaar (minstens 4,5:1 tussen tekst en knop, en de knop zichtbaar op de achtergrond).
  const metTekst = (k) => { let x = k; for (let i = 0; i < 14 && contrast(x, opTekst(x)) < 4.6; i++) x = mix(x, opTekst(x) === "#ffffff" ? "#000000" : "#ffffff", 0.1); return x; };
  // Eerst hun eigen merkkleuren proberen (eerste keus, dan de andere); pas als geen van beide opvalt, bijkleuren.
  const kandidaten = T.donker ? [accent, merk] : hoofdletters && lum(accent) > 0.35 ? [accent, merk] : [merk, accent];
  let knopBg = kandidaten.find((k) => contrast(k, bg) >= (hoofdletters && strak ? 1.6 : 2.2)) || leesbaar(kandidaten[0], bg, 3);
  knopBg = metTekst(knopBg);
  const knopTx = opTekst(knopBg);
  const nadruk = leesbaar(leesbaar(T.donker ? accent : merk, bg, 4.5), vlak, 4.5);
  const band = metTekst(hoofdletters && lum(accent) > 0.35 ? accent : T.donker ? mix(accent, "#000000", 0.08) : merk);
  const bandTx = opTekst(band);

  // ---------- helpers
  const e = (s) => String(s ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
  const veiligPad = (p) => (/^afbeeldingen\/[\w.\-]+$/.test(p || "") ? imgBase + p.slice(13) : /^https:\/\/[^\s"'<>]+$/.test(p || "") ? p : "");
  const veiligeLink = (l) => (/^(#[\w-]*|tel:[+\d ]+|mailto:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/.test(l || "") ? l : "#contact");
  const b = c.bedrijf || {};
  const naam = b.naam || "";
  const tel = (b.telefoon || "").replace(/[^\d+]/g, "");
  let wa = (b.whatsapp || "").replace(/[^\d]/g, "");
  if (wa.startsWith("0")) wa = "31" + wa.slice(1);
  const h = c.hero || {};
  const d = c.diensten || {};
  const items = (d.items || []).filter((i) => i?.titel);
  const o = c.over || {};
  const ct = c.contact || {};
  const ot = (c.openingstijden || []).filter((r) => r?.dag && r?.tijd);
  const heroFoto = veiligPad(h.foto);
  const overFoto = veiligPad(o.foto);
  const fotos = [...new Set((c.fotos || []).map(veiligPad).filter(Boolean))].filter((p) => p !== heroFoto && p !== overFoto);
  const logo = veiligPad(b.logo);
  const actie = { tekst: h.knop?.tekst || ct.knop?.tekst || (tel ? "Bel ons" : "Neem contact op"), link: veiligeLink(h.knop?.link || "#contact") };
  const kaartLink = b.adres || b.plaats ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([naam, b.adres, b.plaats].filter(Boolean).join(" "))}` : "";
  const telTekst = b.telefoon || "";
  const metPrijs = items.filter((i) => i.prijs).length;
  const prijslijst = items.length >= 3 && metPrijs >= Math.ceil(items.length / 2);

  const ICON = {
    tel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.3 23.6l6-1.6a11.8 11.8 0 0 0 5.6 1.4c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.2-8.1zM12 21.4c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.6.9 1-3.5-.2-.4A9.8 9.8 0 1 1 12 21.4zm5.4-7.3c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4l-.5-.4z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    klok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.2 2"/></svg>',
    pijl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6 9 7 9-7"/></svg>',
  };
  const knop = (k, cls = "knop") => `<a class="${cls}" href="${e(veiligeLink(k.link))}">${e(k.tekst)}<span class="ic">${ICON.pijl}</span></a>`;

  // ---------- secties
  const S = [];
  // Alle foto's op een rij; elk onderdeel pakt er een paar, zodat de site vol beeld staat zonder dat dezelfde foto steeds terugkomt.
  const pool = [...new Set([heroFoto, overFoto, ...fotos].filter(Boolean))];
  let wijzer = 0;
  const volgende = (behalve = []) => { if (!pool.length) return ""; for (let i = 0; i < pool.length; i++) { const p = pool[(wijzer + i) % pool.length]; if (!behalve.includes(p)) { wijzer = (wijzer + i + 1) % pool.length; return p; } } return pool[0]; };
  const img = (p, alt = "", extra = "") => (p ? `<img src="${e(p)}" alt="${e(alt)}" loading="lazy"${extra}>` : "");
  const kopBlok = (titel, intro = "") => `<div class="sectie-kop ks-${O.kopstijl}">${O.kopstijl === "groot" ? `<span class="watermerk" aria-hidden="true">${e(titel)}</span>` : ""}<h2>${e(titel)}</h2>${intro ? `<p>${e(intro)}</p>` : ""}</div>`;

  // Hero
  const heroInfo = [
    b.plaats ? `<li>${ICON.pin}<span>${e(b.plaats)}</span></li>` : "",
    ot.length ? `<li data-vandaag hidden>${ICON.klok}<span></span></li>` : "",
    tel && actie.link === "tel:" + tel ? "" : b.email ? `<li>${ICON.mail}<a href="mailto:${e(b.email)}">${e(b.email)}</a></li>` : "",
  ].join("");
  const heroTekst = (extra = "") => `<div class="hero-tekst">
      ${h.label ? `<p class="label">${e(h.label)}</p>` : ""}
      <h1>${e(h.titel || naam)}</h1>
      ${h.tekst ? `<p class="lead">${e(h.tekst)}</p>` : ""}
      <div class="acties">${knop(actie)}${tel && actie.link !== "tel:" + tel ? `<a class="knop-rand" href="tel:${e(tel)}"><span class="ic">${ICON.tel}</span>${e(telTekst)}</a>` : ""}</div>
      ${heroInfo ? `<ul class="hero-info">${heroInfo}</ul>` : ""}${extra}
    </div>`;
  const heroVariant = heroFoto ? (O.hero === "collage" && pool.length < 4 ? "split" : O.hero) : "typo";
  const gebruikt = [heroFoto];
  if (heroVariant === "volbeeld") {
    S.push(`<section class="hero v-volbeeld" id="top"><div class="vol-foto"><img src="${e(heroFoto)}" alt="${e(naam)}" fetchpriority="high"></div><div class="wrap">${heroTekst()}</div></section>`);
  } else if (heroVariant === "kader") {
    const t = volgende(gebruikt); gebruikt.push(t);
    S.push(`<section class="hero v-kader" id="top"><div class="wrap">${heroTekst()}
      <div class="kader-beeld"><div class="kader-foto"><img src="${e(heroFoto)}" alt="${e(naam)}" fetchpriority="high"></div>${t && t !== heroFoto ? `<div class="kader-klein">${img(t)}</div>` : ""}</div></div></section>`);
  } else if (heroVariant === "collage") {
    const extra = [volgende(gebruikt)]; extra.push(volgende([...gebruikt, ...extra])); extra.push(volgende([...gebruikt, ...extra]));
    S.push(`<section class="hero v-collage" id="top"><div class="wrap hero-grid">${heroTekst()}
      <div class="collage"><figure class="c0"><img src="${e(heroFoto)}" alt="${e(naam)}" fetchpriority="high"></figure>${extra.filter((p) => p && p !== heroFoto).map((p, i) => `<figure class="c${i + 1}">${img(p)}</figure>`).join("")}</div></div></section>`);
  } else if (heroVariant === "typo") {
    const strip = pool.slice(0, 3);
    S.push(`<section class="hero v-typo" id="top"><div class="wrap">${heroTekst()}</div>${strip.length ? `<div class="wrap typo-strip n${strip.length}">${strip.map((p) => `<figure>${img(p)}</figure>`).join("")}</div>` : ""}</section>`);
  } else {
    const t = volgende(gebruikt); gebruikt.push(t);
    S.push(`<section class="hero v-split" id="top"><div class="wrap hero-grid">${heroTekst()}
    <div class="hero-beeld"><div class="hero-foto"><img src="${e(heroFoto)}" alt="${e(naam)}" fetchpriority="high"></div>${t && t !== heroFoto ? `<div class="hero-klein">${img(t)}</div>` : ""}<span class="hero-vorm" aria-hidden="true"></span></div>
  </div></section>`);
  }

  // Strook met diensten (beweegt rustig; staat stil bij "minder beweging")
  if (items.length >= 3) {
    const rij = items.map((i) => `<span>${e(i.titel)}</span><i>✦</i>`).join("");
    S.push(`<div class="strook" aria-hidden="true"><div class="strook-rol">${rij}${rij}${rij}</div></div>`);
  }

  const blok = {};
  // Diensten
  if (items.length) {
    const kop = kopBlok(d.titel || "Wat we doen", d.intro);
    if (prijslijst || O.diensten === "lijst") {
      const zij = pool.length >= 3 ? volgende([heroFoto]) : "";
      blok.diensten = `<section class="blok" id="diensten"><div class="wrap">${kop}
      <div class="${zij ? "lijst-met-foto" : ""}"><ul class="prijzen${zij ? " smal" : ""}">${items.map((i) => `<li><div class="pr-kop"><h3>${e(i.titel)}</h3>${i.prijs ? `<span class="stip" aria-hidden="true"></span><b>${e(i.prijs)}</b>` : ""}</div>${i.tekst ? `<p>${e(i.tekst)}</p>` : ""}</li>`).join("")}</ul>
      ${zij ? `<figure class="lijst-foto">${img(zij)}</figure>` : ""}</div>
      <div class="na-lijst">${knop(actie)}</div></div></section>`;
    } else if (O.diensten === "rijen") {
      blok.diensten = `<section class="blok" id="diensten"><div class="wrap">${kop}
      <ol class="rijen">${items.map((i, n) => `<li><span class="rij-nr" aria-hidden="true">${String(n + 1).padStart(2, "0")}</span><h3>${e(i.titel)}</h3><div>${i.tekst ? `<p>${e(i.tekst)}</p>` : ""}${i.prijs ? `<p class="prijs">${e(i.prijs)}</p>` : ""}</div>${pool.length >= 3 ? `<figure class="rij-foto">${img(volgende([heroFoto]))}</figure>` : ""}</li>`).join("")}</ol>
      <div class="na-lijst">${knop(actie)}</div></div></section>`;
    } else if (O.diensten === "foto" && pool.length >= 2) {
      blok.diensten = `<section class="blok" id="diensten"><div class="wrap">${kop}
      <div class="fotokaarten n${Math.min(items.length, 6)}">${items.map((i) => `<article class="fotokaart"><figure>${img(volgende([heroFoto]))}</figure><div class="fk-tekst"><h3>${e(i.titel)}</h3>${i.tekst ? `<p>${e(i.tekst)}</p>` : ""}${i.prijs ? `<p class="prijs">${e(i.prijs)}</p>` : ""}</div></article>`).join("")}</div>
      <div class="na-lijst">${knop(actie)}</div></div></section>`;
    } else {
      blok.diensten = `<section class="blok" id="diensten"><div class="wrap">${kop}
      <div class="kaarten n${Math.min(items.length, 6)}">${items.map((i, n) => {
        const groot = n === 0 && items.length !== 4;
        const f = groot && pool.length >= 2 ? volgende([heroFoto]) : "";
        return `<article class="kaart${groot ? " groot" : ""}${f ? " met-foto" : ""}">${f ? `<div class="kaart-bg">${img(f)}</div>` : ""}<span class="kaart-nr" aria-hidden="true">${String(n + 1).padStart(2, "0")}</span><h3>${e(i.titel)}</h3>${i.tekst ? `<p>${e(i.tekst)}</p>` : ""}${i.prijs ? `<p class="prijs">${e(i.prijs)}</p>` : ""}</article>`;
      }).join("")}</div></div></section>`;
    }
  }

  // Over: met één foto, of een collage van twee
  if (o.tekst) {
    const zinnen = String(o.tekst).split(/(?<=[.!?])\s+/);
    const eerste = zinnen.shift() || "";
    const f1 = overFoto || volgende([heroFoto]);
    const f2 = pool.length >= 4 ? volgende([heroFoto, f1]) : "";
    blok.over = `<section class="blok over" id="over"><div class="wrap over-grid">
      ${f1 ? `<div class="over-beeld${f2 ? " duo" : ""}">${img(f1, "", ' class="o1"')}${f2 ? img(f2, "", ' class="o2"') : ""}<span class="over-vorm" aria-hidden="true"></span></div>` : ""}
      <div class="over-tekst"><p class="label">${e(o.titel || "Over ons")}</p><p class="quote">${e(eerste)}</p>${zinnen.length ? `<p>${e(zinnen.join(" ")).replace(/\n/g, "<br>")}</p>` : ""}
      <div class="acties">${knop(actie)}</div></div>
    </div></section>`;
  }

  // Galerij: alle overige foto's. Veel foto's = metselwerk (geen gaten), weinig = vaste opbouw.
  const gal = pool.filter((p) => p !== heroFoto).slice(0, 9);
  if (gal.length >= 2) {
    blok.galerij = gal.length >= 6
      ? `<section class="blok galerij-blok" id="fotos"><div class="wrap">${kopBlok("Foto's")}<div class="massa">${gal.map((p) => `<figure>${img(p)}</figure>`).join("")}</div></div></section>`
      : `<section class="blok galerij-blok" id="fotos"><div class="wrap"><div class="galerij g${Math.min(gal.length, 5)}">${gal.slice(0, 5).map((p, i) => `<figure class="f${i}">${img(p)}</figure>`).join("")}</div></div></section>`;
  }

  const VOLGORDES = [["diensten", "over", "galerij"], ["over", "diensten", "galerij"], ["galerij", "diensten", "over"]];
  for (const k of VOLGORDES[O.volgorde] || VOLGORDES[0]) if (blok[k]) S.push(blok[k]);

  // Actieband, met een foto erachter als die er is (afgedekt in hun merkkleur, dus altijd leesbaar)
  const bandFoto = pool.length >= 3 ? volgende([heroFoto]) : "";
  S.push(`<section class="band${bandFoto ? " met-foto" : ""}">${bandFoto ? `<div class="band-foto">${img(bandFoto)}</div>` : ""}<div class="wrap band-grid"><h2>${e(/^(maak|plan|bel|boek|vraag|reserveer)/i.test(ct.titel || "") ? ct.titel : h.titel || "Klaar voor de volgende stap?")}</h2><div class="acties">${knop(actie, "knop knop-band")}${tel ? `<a class="knop-rand op-band" href="tel:${e(tel)}"><span class="ic">${ICON.tel}</span>${e(telTekst)}</a>` : ""}</div></div></section>`);

  // Contact
  const regels = [
    tel ? `<a class="c-regel" href="tel:${e(tel)}"><span class="c-ic">${ICON.tel}</span><span><small>Bellen</small>${e(telTekst)}</span></a>` : "",
    wa ? `<a class="c-regel" href="https://wa.me/${e(wa)}"><span class="c-ic">${ICON.wa}</span><span><small>WhatsApp</small>Stuur een bericht</span></a>` : "",
    b.email ? `<a class="c-regel" href="mailto:${e(b.email)}"><span class="c-ic">${ICON.mail}</span><span><small>Mailen</small>${e(b.email)}</span></a>` : "",
    b.adres || b.plaats ? `<a class="c-regel" href="${e(kaartLink)}" target="_blank" rel="noopener"><span class="c-ic">${ICON.pin}</span><span><small>Route plannen</small>${e([b.adres, b.adres && b.adres.includes(b.plaats || "§") ? "" : b.plaats].filter(Boolean).join(", "))}</span></a>` : "",
  ].join("");
  S.push(`<section class="blok contact" id="contact"><div class="wrap contact-grid">
    <div>${logo ? `<img class="logo-img contact-logo" src="${e(logo)}" alt="" loading="lazy">` : ""}<p class="label">Contact</p><h2>${e(ct.titel && !/^(maak|plan|bel|boek|vraag|reserveer)/i.test(ct.titel) ? ct.titel : b.plaats ? `Langskomen in ${b.plaats}` : "Contact en openingstijden")}</h2>${ct.tekst ? `<p class="c-tekst">${e(ct.tekst)}</p>` : ""}<div class="c-lijst">${regels || knop(actie)}</div></div>
    ${ot.length ? `<div class="tijden"><h3>${ICON.klok}Openingstijden</h3><dl>${ot.map((r, i) => `<div data-dag="${i}"><dt>${e(r.dag)}</dt><dd>${e(r.tijd)}</dd></div>`).join("")}</dl></div>` : ""}
  </div></section>`);

  // ---------- stijl
  const R = T.r;
  const css = `:root{--merk:${merk};--accent:${accent};--bg:${bg};--ink:${ink};--vlak:${vlak};--lijn:${lijn};--kaart:${kaart};--knop:${knopBg};--knop-tx:${knopTx};--nadruk:${nadruk};--band:${band};--band-tx:${bandTx};--r:${R}px;--kop:${T.kop};--tekst:${T.tekstFont}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 var(--tekst);overflow-x:hidden}
img{max-width:100%;display:block}a{color:inherit}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
h1,h2,h3{font-family:var(--kop);font-weight:${T.kopGewicht};line-height:1.02;margin:0 0 .45em;letter-spacing:${T.kopSpatie};text-transform:${T.kopCase};text-wrap:balance}
h3{line-height:1.2;font-size:21px}
.wrap{width:min(1180px,100% - 40px);margin-inline:auto}
:focus-visible{outline:3px solid var(--nadruk);outline-offset:3px}
.label{display:inline-flex;align-items:center;gap:10px;font:600 14px/1.2 var(--tekst);color:var(--nadruk);margin:0 0 16px;letter-spacing:.02em}
.label::before{content:"";width:28px;height:2px;background:currentColor}
.ic{display:inline-flex;font-size:1.1em}
.knop,.knop-rand{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:54px;padding:0 26px;border-radius:${strak ? "0" : rond ? "999px" : "12px"};font:600 16px/1 var(--tekst);text-decoration:none;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;${hoofdletters ? "text-transform:uppercase;letter-spacing:.04em;" : ""}}
.knop{background:var(--knop);color:var(--knop-tx);box-shadow:${hoofdletters && strak ? "5px 5px 0 var(--ink)" : "0 10px 28px -10px color-mix(in srgb,var(--knop) 70%,transparent)"}}
.knop .ic{transition:transform .18s ease}.knop:hover{transform:translateY(-2px)}.knop:hover .ic{transform:translateX(3px)}
.knop-rand{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ink) 80%,transparent);color:var(--ink)}.knop-rand:hover{background:color-mix(in srgb,var(--ink) 6%,transparent)}
.acties{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}

/* kop */
.kop{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid transparent;transition:border-color .2s}
.kop.vast{border-bottom-color:var(--lijn)}
.kop .wrap{display:flex;align-items:center;gap:24px;min-height:74px}
.merk{display:flex;align-items:center;text-decoration:none;min-width:0}.merk img{max-height:54px;max-width:220px;width:auto;object-fit:contain}
.logo-img{transition:background .2s}.logo-img.plaat{padding:8px 12px;border-radius:${strak ? "2px" : "10px"};box-sizing:content-box}
.voet-logo{max-height:44px;max-width:180px;width:auto;object-fit:contain}.contact-logo{max-height:70px;max-width:240px;width:auto;object-fit:contain;margin-bottom:24px}
.woordmerk{font-family:var(--kop);font-weight:${T.kopGewicht};font-size:23px;letter-spacing:${T.kopSpatie};text-transform:${T.kopCase};line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kop nav{margin-left:auto;display:flex;gap:28px;font-size:15px;font-weight:500}.kop nav a{text-decoration:none;opacity:.78}.kop nav a:hover{opacity:1}
.kop .knop{min-height:44px;padding:0 18px;font-size:15px}.kop .knop .ic{display:none}

/* hero */
.hero{padding:48px 0 84px;position:relative}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center}
.hero h1{font-size:clamp(44px,6.4vw,${hoofdletters ? 96 : 84}px)}
.lead{font-size:20px;line-height:1.55;max-width:31em;opacity:.86;margin:0}
.hero-info{list-style:none;display:flex;flex-wrap:wrap;gap:10px 22px;padding:0;margin:30px 0 0;font-size:15px}
.hero-info li{display:inline-flex;align-items:center;gap:8px;opacity:.9}.hero-info svg{color:var(--nadruk);font-size:18px}.hero-info a{text-decoration:none}
.hero-info li[data-vandaag] b{color:var(--nadruk)}
.hero-beeld{position:relative;padding:0 0 36px 36px}
.hero-foto{border-radius:${rond ? "240px 240px var(--r) var(--r)" : "var(--r)"};overflow:hidden;aspect-ratio:4/5;background:var(--vlak);box-shadow:0 40px 80px -40px rgba(0,0,0,.45)}
.hero-foto img{width:100%;height:100%;object-fit:cover;animation:zoom 1.4s cubic-bezier(.2,.7,.2,1) both}
.hero-klein{position:absolute;left:0;bottom:0;width:42%;aspect-ratio:1;border-radius:${rond ? "50%" : "var(--r)"};overflow:hidden;border:6px solid var(--bg);box-shadow:0 20px 40px -20px rgba(0,0,0,.4)}
.hero-klein img{width:100%;height:100%;object-fit:cover}
.hero-vorm{position:absolute;right:-18px;top:-18px;width:46%;aspect-ratio:1;background:var(--accent);opacity:${T.donker ? ".22" : ".9"};border-radius:${strak ? "0" : "50%"};z-index:-1}
${strak ? ".hero-vorm{transform:rotate(6deg)}" : ""}
.hero-woord{aspect-ratio:1;display:grid;place-items:center;background:var(--band);color:var(--band-tx);border-radius:var(--r);padding:40px;overflow:hidden}
.hero-woord span{font-family:var(--kop);font-weight:${T.kopGewicht};font-size:clamp(48px,7vw,96px);line-height:.95;text-transform:${T.kopCase};letter-spacing:${T.kopSpatie};text-align:center;word-break:break-word}
.hero-tekst>*{animation:op .8s cubic-bezier(.2,.7,.2,1) both}.hero-tekst>*:nth-child(2){animation-delay:.08s}.hero-tekst>*:nth-child(3){animation-delay:.16s}.hero-tekst>*:nth-child(4){animation-delay:.24s}.hero-tekst>*:nth-child(5){animation-delay:.32s}
@keyframes op{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes zoom{from{transform:scale(1.08)}to{transform:none}}

/* hero-varianten */
.v-volbeeld{padding:0;min-height:min(88vh,820px);display:flex;align-items:flex-end;color:#fff;position:relative;isolation:isolate}
.vol-foto{position:absolute;inset:0;z-index:-1;overflow:hidden}.vol-foto img{width:100%;height:100%;object-fit:cover;animation:zoom 1.6s cubic-bezier(.2,.7,.2,1) both}
.vol-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.25) 35%,rgba(0,0,0,.78) 100%),linear-gradient(90deg,rgba(0,0,0,.45),transparent 70%)}
.v-volbeeld .wrap{padding:120px 0 72px}.v-volbeeld .hero-tekst{max-width:760px}.v-volbeeld .lead{opacity:.92}
.v-volbeeld .label,.v-volbeeld .hero-info svg,.v-volbeeld .hero-info li[data-vandaag] b{color:#fff}
.v-volbeeld .knop-rand{color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75)}.v-volbeeld .knop-rand:hover{background:rgba(255,255,255,.12)}
.v-kader{padding:64px 0 90px;text-align:center}.v-kader .hero-tekst{max-width:900px;margin-inline:auto}.v-kader .lead{margin-inline:auto}.v-kader .acties,.v-kader .hero-info{justify-content:center}.v-kader .label::before{display:none}
.kader-beeld{position:relative;margin-top:56px}
.kader-foto{border-radius:var(--r);overflow:hidden;aspect-ratio:21/9;box-shadow:0 50px 90px -50px rgba(0,0,0,.5)}.kader-foto img{width:100%;height:100%;object-fit:cover;animation:zoom 1.6s cubic-bezier(.2,.7,.2,1) both}
.kader-klein{position:absolute;right:4%;bottom:-36px;width:22%;aspect-ratio:1;border-radius:${rond ? "50%" : "var(--r)"};overflow:hidden;border:6px solid var(--bg)}.kader-klein img{width:100%;height:100%;object-fit:cover}
.v-typo{padding:72px 0 84px}.v-typo h1{font-size:clamp(52px,9vw,${hoofdletters ? 150 : 128}px);max-width:12ch}.v-typo .hero-tekst{position:relative}
.typo-strip{display:grid;gap:14px;margin-top:56px}.typo-strip.n3{grid-template-columns:1.4fr 1fr 1fr}.typo-strip.n2{grid-template-columns:1.4fr 1fr}
.typo-strip{grid-auto-rows:clamp(220px,26vw,360px)}.typo-strip figure{margin:0;border-radius:var(--r);overflow:hidden}.typo-strip img{width:100%;height:100%;object-fit:cover}

/* rijen */
.rijen{list-style:none;margin:0;padding:0;counter-reset:r}
.rijen li{display:grid;grid-template-columns:70px minmax(0,1fr) minmax(0,1.1fr);gap:30px;align-items:baseline;padding:30px 0;border-top:1px solid var(--lijn);transition:padding .25s ease}
.rijen li:last-child{border-bottom:1px solid var(--lijn)}.rijen li:hover{padding-left:12px}
.rij-nr{font:600 14px/1 var(--tekst);color:var(--nadruk);letter-spacing:.08em}.rijen h3{margin:0;font-size:clamp(24px,2.6vw,34px)}.rijen p{margin:0;opacity:.8}.rijen .prijs{margin-top:10px;opacity:1;color:var(--nadruk);font-weight:600}

/* collage-hero */
.collage{display:grid;grid-template-columns:1.2fr 1fr;grid-template-rows:1fr 1fr;gap:12px;aspect-ratio:1/1.05}
.collage figure{margin:0;overflow:hidden;border-radius:var(--r)}.collage img{width:100%;height:100%;object-fit:cover}
.collage .c0{grid-row:span 2}.collage .c3{display:none}
.collage figure:first-child img{animation:zoom 1.6s cubic-bezier(.2,.7,.2,1) both}

/* kopstijlen */
.sectie-kop{position:relative}
.ks-midden{display:block;text-align:center;margin-inline:auto;max-width:760px}.ks-midden p{margin:14px auto 0}
.ks-groot .watermerk{position:absolute;right:0;top:-.5em;text-align:right;font-family:var(--kop);font-size:clamp(70px,13vw,190px);line-height:1;white-space:nowrap;color:var(--ink);opacity:.05;pointer-events:none;text-transform:${T.kopCase};letter-spacing:${T.kopSpatie};overflow:hidden;max-width:100%}
.ks-groot h2{position:relative}

/* diensten met foto's */
.fotokaarten{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.fotokaarten.n4,.fotokaarten.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.fotokaart{background:var(--kaart);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;transition:transform .25s ease;${T.donker ? "border:1px solid var(--lijn);" : "box-shadow:0 1px 0 var(--lijn),0 18px 40px -28px rgba(0,0,0,.35);"}}
.fotokaart:hover{transform:translateY(-4px)}.fotokaart figure{margin:0;aspect-ratio:4/3;overflow:hidden}.fotokaart img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}.fotokaart:hover img{transform:scale(1.05)}
.fk-tekst{padding:24px 24px 28px}.fk-tekst p{margin:0;opacity:.8}
.kaart.met-foto{overflow:hidden;color:#fff;background:#000}.kaart-bg{position:absolute;inset:0}.kaart-bg img{width:100%;height:100%;object-fit:cover;opacity:.55}
.kaart.met-foto>*:not(.kaart-bg){position:relative}.kaart.met-foto p{opacity:.92}
.lijst-met-foto{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:56px;align-items:start}.prijzen.smal{grid-template-columns:1fr}
.lijst-foto{margin:0;position:sticky;top:100px;border-radius:var(--r);overflow:hidden;aspect-ratio:3/4}.lijst-foto img{width:100%;height:100%;object-fit:cover}
.rijen li{grid-template-columns:70px minmax(0,1fr) minmax(0,1.1fr) 160px}.rij-foto{margin:0;aspect-ratio:4/3;border-radius:calc(var(--r) * .6);overflow:hidden}.rij-foto img{width:100%;height:100%;object-fit:cover}
.rijen li:not(:has(.rij-foto)){grid-template-columns:70px minmax(0,1fr) minmax(0,1.1fr)}

/* over met twee foto's */
.over-beeld.duo{display:grid;grid-template-columns:1fr .8fr;gap:14px;align-items:end}.over-beeld.duo .o2{aspect-ratio:3/4;margin-bottom:-40px}
.over-beeld.duo .over-vorm{display:none}

/* metselwerk-galerij */
.massa{columns:3 280px;column-gap:14px}.massa figure{margin:0 0 14px;break-inside:avoid;border-radius:var(--r);overflow:hidden}.massa img{width:100%;height:auto;transition:transform .6s ease}.massa figure:hover img{transform:scale(1.04)}

/* band met foto */
.band.met-foto{isolation:isolate}.band-foto{position:absolute;inset:0;z-index:-1}.band-foto img{width:100%;height:100%;object-fit:cover}
.band-foto::after{content:"";position:absolute;inset:0;background:var(--band);opacity:.88}

/* strook */
.strook{background:var(--band);color:var(--band-tx);overflow:hidden;padding:18px 0;${hoofdletters ? "transform:rotate(-1.2deg);margin:0 -10px;" : ""}}
.strook-rol{display:flex;gap:28px;width:max-content;animation:rol 38s linear infinite;font-family:var(--kop);font-size:clamp(22px,2.6vw,32px);text-transform:${T.kopCase};white-space:nowrap;align-items:center}
.strook i{font-style:normal;opacity:.6;font-size:.6em}
@keyframes rol{to{transform:translateX(-33.333%)}}

/* blokken */
.blok{padding:104px 0}
.sectie-kop{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:44px}.sectie-kop h2{margin:0}.sectie-kop p{max-width:28em;margin:0;opacity:.8}
h2{font-size:clamp(36px,4.8vw,62px)}

/* prijslijst */
.prijzen{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:0 64px}
.prijzen li{padding:26px 0;border-top:1px solid var(--lijn)}
.pr-kop{display:flex;align-items:baseline;gap:14px}.pr-kop h3{margin:0;font-size:${F.g <= 500 ? "26px" : "21px"}}
.stip{flex:1;border-bottom:2px dotted color-mix(in srgb,var(--ink) 30%,transparent);transform:translateY(-5px);min-width:20px}
.pr-kop b{font-weight:600;color:var(--nadruk);white-space:nowrap;font-size:17px}
.prijzen p{margin:8px 0 0;opacity:.75;font-size:16px;max-width:34em}
.na-lijst{margin-top:40px}

/* kaarten */
.kaarten{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.kaarten.n4{grid-template-columns:repeat(2,minmax(0,1fr))}.kaarten.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.kaart{background:var(--kaart);border-radius:var(--r);padding:30px;position:relative;transition:transform .25s ease,box-shadow .25s ease;${T.donker ? "border:1px solid var(--lijn);" : strak && hoofdletters ? "border:2px solid var(--ink);" : "box-shadow:0 1px 0 var(--lijn),0 18px 40px -28px rgba(0,0,0,.35);"}}
.kaart:hover{transform:translateY(-4px)}
.kaart.groot{grid-row:span 2;background:var(--band);color:var(--band-tx);display:flex;flex-direction:column;justify-content:flex-end;min-height:320px;border:0}
.kaart.groot h3{font-size:clamp(26px,2.6vw,34px)}.kaart.groot .kaart-nr{color:inherit;opacity:.6}
.kaart-nr{display:block;font:600 14px/1 var(--tekst);color:var(--nadruk);margin-bottom:26px;letter-spacing:.08em}
.kaart p{margin:0;opacity:.8}.prijs{margin-top:16px!important;font-weight:600;color:var(--nadruk);opacity:1!important}.kaart.groot .prijs{color:inherit}

/* over */
.over{background:var(--vlak)}
.over-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:72px;align-items:center}
.over-beeld{position:relative}.over-beeld img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:${rond ? "var(--r) 200px var(--r) var(--r)" : "var(--r)"};position:relative;z-index:1}
.over-vorm{position:absolute;inset:28px -28px -28px 28px;border:2px solid var(--nadruk);border-radius:${rond ? "var(--r) 200px var(--r) var(--r)" : "var(--r)"};opacity:.5}
.quote{font-family:var(--kop);font-size:clamp(26px,3vw,38px);line-height:1.2;margin:0 0 22px;letter-spacing:${T.kopSpatie};text-transform:${hoofdletters ? "uppercase" : "none"}}
.over-tekst p:not(.quote):not(.label){opacity:.85;font-size:18px}

/* galerij */
.galerij-blok{padding-top:0}.over+.galerij-blok{padding-top:104px}
.galerij{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:230px;gap:14px;grid-auto-flow:dense}
.galerij figure{margin:0;overflow:hidden;border-radius:var(--r);background:var(--vlak)}.galerij img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}.galerij figure:hover img{transform:scale(1.04)}
.galerij .f0{grid-column:span 2;grid-row:span 2}
.g2 .f1{grid-column:span 2;grid-row:span 2}
.g3 .f1,.g3 .f2{grid-column:span 2}
.g4 .f3{grid-column:span 2}

/* band */
.band{background:var(--band);color:var(--band-tx);padding:84px 0;position:relative;overflow:hidden}
.band-grid{display:flex;justify-content:space-between;align-items:center;gap:40px;flex-wrap:wrap}.band h2{margin:0;max-width:14em;font-size:clamp(34px,4.4vw,58px)}
.band .acties{margin:0}
.knop-band{background:var(--band-tx);color:var(--band);box-shadow:none}
.op-band{color:var(--band-tx);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--band-tx) 70%,transparent)}

/* contact */
.contact-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:64px;align-items:start}
.c-tekst{font-size:18px;opacity:.85;max-width:32em}
.c-lijst{display:grid;gap:12px;margin-top:28px}
.c-regel{display:flex;align-items:center;gap:16px;padding:16px 18px;background:var(--kaart);border-radius:var(--r);text-decoration:none;transition:transform .2s ease;${T.donker ? "border:1px solid var(--lijn);" : strak && hoofdletters ? "border:2px solid var(--ink);" : "box-shadow:0 1px 0 var(--lijn),0 12px 30px -24px rgba(0,0,0,.4);"}}
.c-regel:hover{transform:translateX(4px)}
.c-regel small{display:block;font-size:13px;opacity:.65;font-weight:500}.c-regel span:last-child{font-weight:600;word-break:break-word}
.c-ic{width:46px;height:46px;border-radius:${strak ? "0" : "50%"};display:grid;place-items:center;background:var(--knop);color:var(--knop-tx);font-size:20px;flex:none}
.tijden{background:var(--kaart);border-radius:var(--r);padding:30px;${T.donker ? "border:1px solid var(--lijn);" : strak && hoofdletters ? "border:2px solid var(--ink);" : "box-shadow:0 1px 0 var(--lijn),0 18px 40px -28px rgba(0,0,0,.35);"}}
.tijden h3{display:flex;align-items:center;gap:10px;font-size:22px}.tijden h3 svg{color:var(--nadruk)}
.tijden dl{margin:0}.tijden dl div{display:flex;justify-content:space-between;gap:16px;padding:11px 12px;margin:0 -12px;border-top:1px solid var(--lijn);border-radius:8px}
.tijden dt{opacity:.8}.tijden dd{margin:0;font-weight:600;text-align:right}
.tijden dl div.nu{background:var(--vlak);border-top-color:transparent}.tijden dl div.nu dt::after{content:" · vandaag";color:var(--nadruk);font-weight:600}

footer{padding:40px 0 48px;font-size:14px;border-top:1px solid var(--lijn)}footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;opacity:.72}
footer .woordmerk{font-size:19px;opacity:1}

/* vaste actiebalk op mobiel */
.actiebalk{display:none}

@media (max-width:980px){
  .hero-grid,.over-grid,.contact-grid{grid-template-columns:1fr;gap:44px}
  .prijzen{grid-template-columns:1fr}
  .kaarten,.kaarten.n4{grid-template-columns:1fr 1fr}.kaart.groot{grid-row:auto;grid-column:span 2;min-height:220px}
  .fotokaarten{grid-template-columns:1fr 1fr}.rijen li{grid-template-columns:60px minmax(0,1fr) minmax(0,1fr)}.rij-foto{display:none}
  .hero-beeld{max-width:560px}
}
@media (max-width:760px){
  .v-volbeeld{min-height:86vh}.v-volbeeld .wrap{padding:110px 0 40px}
  .v-kader{padding:28px 0 64px;text-align:left}.v-kader .acties,.v-kader .hero-info{justify-content:flex-start}.kader-beeld{margin-top:36px}.kader-foto{aspect-ratio:4/3}.kader-klein{width:34%;bottom:-24px;border-width:4px}
  .v-typo{padding:36px 0 56px}.v-typo h1{font-size:clamp(46px,14vw,72px)}.typo-strip{margin-top:36px;gap:8px}.typo-strip{grid-auto-rows:150px}.typo-strip.n3{grid-template-columns:1fr 1fr}.typo-strip.n3 figure:first-child{grid-column:span 2;grid-row:span 1}.typo-strip.n3 figure:first-child img{height:100%}
  .rijen li,.rijen li:not(:has(.rij-foto)){grid-template-columns:1fr;gap:8px;padding:24px 0}.rij-foto{order:-1;aspect-ratio:16/9}
  .fotokaarten,.fotokaarten.n4,.fotokaarten.n2{grid-template-columns:1fr}
  .lijst-met-foto{grid-template-columns:1fr;gap:28px}.lijst-foto{position:static;aspect-ratio:16/10;order:-1}
  .collage{aspect-ratio:1/1;gap:8px}
  .massa{columns:2;column-gap:8px}.massa figure{margin-bottom:8px}
  .over-beeld.duo .o2{margin-bottom:-24px}
  .ks-groot .watermerk{top:-.4em}
  body{font-size:16px;padding-bottom:76px}
  .kop nav{display:none}.kop .wrap{min-height:64px;gap:12px}.kop .knop{display:none}.woordmerk{font-size:19px}.merk img{max-height:44px;max-width:170px}
  .hero{padding:16px 0 56px}.hero-grid{gap:30px}
  .hero-beeld{order:-1;padding:0 0 26px 26px}.hero-foto{aspect-ratio:5/4;border-radius:${rond ? "140px 140px var(--r) var(--r)" : "var(--r)"}}.hero-klein{width:36%;border-width:5px}
  .hero-woord{aspect-ratio:auto;padding:46px 24px}
  .hero h1{font-size:clamp(38px,11vw,54px)}.lead{font-size:18px}
  .acties{flex-direction:column}.knop,.knop-rand{width:100%}
  .blok{padding:72px 0}.galerij-blok{padding-top:0}.over+.galerij-blok{padding-top:72px}
  .sectie-kop{display:block;margin-bottom:28px}.sectie-kop p{margin-top:12px}
  .kaarten,.kaarten.n4,.kaarten.n2{grid-template-columns:1fr}.kaart.groot{grid-column:auto}
  .over-vorm{inset:16px -12px -16px 16px}
  .galerij{grid-template-columns:1fr 1fr;grid-auto-rows:150px;gap:10px}.galerij figure{grid-column:span 1!important;grid-row:span 1!important}.galerij .f0{grid-column:span 2!important;grid-row:span 2!important}.galerij figure:last-child:nth-child(even){grid-column:span 2!important}
  .band{padding:60px 0}.band .acties{width:100%}
  .actiebalk{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--lijn)}
  .actiebalk a{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border-radius:${strak ? "0" : "14px"};font-weight:600;text-decoration:none;font-size:15px;background:var(--kaart);color:var(--ink);${T.donker ? "border:1px solid var(--lijn);" : "box-shadow:inset 0 0 0 1.5px var(--lijn);"}}
  .actiebalk a.hoofd{flex:1.6;background:var(--knop);color:var(--knop-tx);box-shadow:none;border:0}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto}}`;

  // Vandaag open (uit hun eigen openingstijden) + kop met lijn bij scrollen. Klein en zonder afhankelijkheden.
  const script = ot.length || true ? `<script>(function(){
/* Logo altijd zichtbaar: meet hoe licht het logo is; valt het weg tegen de achtergrond, dan krijgt het een plaatje in een contrasterende kleur. */
function L(r,g,b){return(0.2126*r+0.7152*g+0.0722*b)/255}
function bgL(el){var n=el;while(n&&n!==document.documentElement){var c=getComputedStyle(n).backgroundColor,m=c.match(/[\d.]+/g);if(m&&(m.length<4||+m[3]>0.5))return L(+m[0],+m[1],+m[2]);n=n.parentElement}var m2=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);return m2?L(+m2[0],+m2[1],+m2[2]):1}
function check(img){try{var w=Math.min(120,img.naturalWidth),h=Math.max(1,Math.round(w*img.naturalHeight/img.naturalWidth));var cv=document.createElement("canvas");cv.width=w;cv.height=h;var x=cv.getContext("2d");x.drawImage(img,0,0,w,h);var d=x.getImageData(0,0,w,h).data,s=0,n=0,ondoorz=0;for(var i=0;i<d.length;i+=4){if(d[i+3]>40){s+=L(d[i],d[i+1],d[i+2]);n++}if(d[i+3]>240)ondoorz++}if(!n)return;var lg=s/n,achter=bgL(img.parentElement);var vol=ondoorz>d.length/4*0.9;if(vol)return;if(Math.abs(lg-achter)<0.28){img.classList.add("plaat");img.style.background=lg>0.5?"#16151a":"#ffffff"}}catch(e){}}
document.querySelectorAll(".logo-img").forEach(function(i){i.complete&&i.naturalWidth?check(i):i.addEventListener("load",function(){check(i)})});
var k=document.querySelector(".kop");addEventListener("scroll",function(){k&&k.classList.toggle("vast",scrollY>8)},{passive:true});
var D=["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"],nu=new Date(),vd=nu.getDay(),rows=document.querySelectorAll(".tijden [data-dag]"),hit=null;
function dagen(t){t=t.toLowerCase();var r=[],m=t.match(/(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)\\s*(?:t\\/m|tot en met|-|–|—)\\s*(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)/);
if(m){var a=D.indexOf(m[1]),b=D.indexOf(m[2]);for(var i=a;;i=(i+1)%7){r.push(i);if(i===b||r.length>7)break}return r}D.forEach(function(d,i){if(t.indexOf(d)>-1||t.indexOf(d.slice(0,2)+" ")===0)r.push(i)});return r}
rows.forEach(function(el){var dt=el.querySelector("dt").textContent;if(dagen(dt).indexOf(vd)>-1&&!hit){hit=el;el.classList.add("nu")}});
var li=document.querySelector("[data-vandaag]");if(li&&hit){var tijd=hit.querySelector("dd").textContent.trim(),m2=tijd.match(/(\\d{1,2})[:.](\\d{2})\\s*[-–—]\\s*(\\d{1,2})[:.](\\d{2})/),txt="";
if(/gesloten/i.test(tijd))txt="Vandaag gesloten";else if(m2){var mins=nu.getHours()*60+nu.getMinutes(),o=+m2[1]*60+ +m2[2],s=+m2[3]*60+ +m2[4];txt=mins<o?"Vandaag open vanaf <b>"+m2[1]+":"+m2[2]+"</b>":mins<s?"Nu open tot <b>"+m2[3]+":"+m2[4]+"</b>":"Vandaag open tot "+m2[3]+":"+m2[4]}
if(txt){li.querySelector("span").innerHTML=txt;li.hidden=false}}})();</script>` : "";

  const fontsLink = `<link rel="preconnect" href="https://fonts.bunny.net"><link rel="stylesheet" href="https://fonts.bunny.net/css?family=${T.fonts}&display=swap">`;
  const nav = [items.length ? `<a href="#diensten">${e(d.titel || "Diensten")}</a>` : "", o.tekst ? `<a href="#over">${e(o.titel && o.titel.length < 18 ? o.titel : "Over ons")}</a>` : "", gal.length >= 2 ? `<a href="#fotos">Foto's</a>` : "", `<a href="#contact">Contact</a>`].join("");
  const balk = `<nav class="actiebalk" aria-label="Snel contact">${tel ? `<a href="tel:${e(tel)}">${ICON.tel}Bel</a>` : ""}${wa ? `<a href="https://wa.me/${e(wa)}">${ICON.wa}WhatsApp</a>` : !tel && b.email ? `<a href="mailto:${e(b.email)}">${ICON.mail}Mail</a>` : ""}<a class="hoofd" href="${e(actie.link)}">${e(actie.tekst)}</a></nav>`;

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${e(c.seo?.titel || naam)}</title><meta name="description" content="${e(c.seo?.omschrijving || "")}">
<meta property="og:title" content="${e(c.seo?.titel || naam)}"><meta property="og:description" content="${e(c.seo?.omschrijving || "")}">${heroFoto ? `<meta property="og:image" content="${e(heroFoto)}">` : ""}
<meta name="theme-color" content="${e(bg)}">${robots ? `<meta name="robots" content="${e(robots)}">` : ""}${fontsLink}<style>${css}</style>${extraHead}</head><body>${bodyStart}
<header class="kop"><div class="wrap"><a class="merk" href="#top" aria-label="${e(naam)}">${logo ? `<img class="logo-img" src="${e(logo)}" alt="${e(naam)}">` : `<span class="woordmerk">${e(naam)}</span>`}</a><nav aria-label="Menu">${nav}</nav>${knop(actie)}</div></header>
<main>${S.join("\n")}</main>
<footer><div class="wrap">${logo ? `<img class="logo-img voet-logo" src="${e(logo)}" alt="${e(naam)}" loading="lazy">` : `<span class="woordmerk">${e(naam)}</span>`}<span>© ${year} ${e(naam)}${b.plaats ? " · " + e(b.plaats) : ""}${b.kvk ? " · KvK " + e(b.kvk) : ""}</span></div></footer>
${balk}${script}${bodyEnd}</body></html>`;
}
