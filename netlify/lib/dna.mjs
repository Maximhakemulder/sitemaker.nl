// Ontwerp-DNA: per concept een vaste combinatie van lay-outkeuzes, zodat niet elke site hetzelfde skelet krijgt.
// Bij elk onderdeel kiezen we iets dat in de laatste concepten niet gebruikt is. De ontwerper moet het volgen.
import crypto from "node:crypto";

export const DNA = {
  richting: {
    zwitsers: "Zwitsers/internationaal: strak raster, uitgelijnd op één as, grote typografie, veel wit, functionele details.",
    editoriaal: "Editoriaal: als een glossy tijdschrift, met kolommen, grote foto's, bijschriften en een sterke typografische hiërarchie.",
    architectonisch: "Architectonisch: maatlijnen, rasterlijnen, technische tekening-details, precisie.",
    boutique: "Luxe boutique: rust, ruimte, verfijnde letters, gedempte kleuren, kleine gouden of donkere accenten.",
    speels: "Speels en vriendelijk: ronde vormen, warme kleurvlakken, iets scheve elementen, sticker-achtige labels.",
    werkplaats: "Ambachtelijk/werkplaats: materialen en texturen (hout, beton, papier), stempel-achtige details, eerlijk en stoer.",
    blokken: "Grafisch en krachtig: grote kleurblokken, harde typografie, sterke contrasten, maar netjes uitgelijnd.",
    scandinavisch: "Scandinavisch minimal: licht, zacht, veel lucht, dunne lijnen, natuurlijke tinten.",
    precisie: "Tech/precisie: strak, koel, details als meters, schalen, labels en coördinaten.",
    botanisch: "Botanisch/natuurlijk: organische vormen, bladmotieven, zachte groenen of aardetinten, golvende lijnen.",
    galerie: "Kunstgalerie: hun werk als kunst gepresenteerd, veel wit, grote beelden, kleine bijschriften.",
    lokaal: "Lokaal en trots: hun stad/wijk centraal, kaartdetails, straatnamen, buurtgevoel.",
  },
  hero: {
    volbeeld: "Foto over de volle breedte (max. één scherm hoog), grote kop linksonder op een donker verloop; geen kaart, geen badge.",
    typografisch: "De kop ís het beeld: gigantisch (tot ~11vw), over de volle breedte; een foto klein als uitsnede tussen of naast de letters.",
    gesplitst: "Scherm 50/50 tot aan de randen: foto loopt door tot de rand (geen afgeronde kaart), tekstkant op een zachte tint van hun kleur.",
    collage: "3 of 4 eigen foto's in een asymmetrische compositie van verschillende formaten die licht overlappen; de kop ertussen.",
    tijdschrift: "Als een tijdschriftcover: naam/logo groot bovenaan, één staande portretfoto in het midden, kop en korte regels eromheen.",
    panorama: "Kop en tekst gecentreerd bovenaan, daaronder een brede panoramafoto die tijdens het scrollen inzoomt of breder wordt (data-schaal).",
    schuin: "Foto in een schuin afgesneden vlak (clip-path polygon) aan één kant, tekst op wit ernaast; de schuine lijn komt verderop terug.",
    fotostrook: "Een rij van 3 tot 5 staande foto's die bij het laden één voor één omhoog schuiven, de kop groot eronder of eroverheen.",
    vorm: "Foto uitgesneden in een vorm uit hun logo of vak (zeshoek, druppel, cirkel, boog, ruit), grote kop eromheen; die vorm is het motief van de site.",
    kader: "Grote liggende foto in een dik kader in hun kleur, kop deels over het kader heen, kleine feitenblokjes uit de tekst eromheen.",
  },
  diensten: {
    index: "Grote genummerde regels als een register; bij hover verschijnt een foto naast de regel (op mobiel staat de foto erboven).",
    bento: "Bento-raster: tegels van verschillende grootte, één of twee tegels met een foto, één tegel in hun volle kleur.",
    zigzag: "Om en om grote foto en tekst per dienst, met veel ruimte; elke rij een andere verhouding.",
    menukaart: "Als een menukaart of prijslijst: twee kolommen met stippellijnen naar de prijs (of zonder prijs), heel typografisch.",
    iconen: "Raster met grote eigen iconen of kleine illustraties per dienst, korte tekst, geen kaartranden.",
    spoor: "Grote kaarten met foto in een horizontaal spoor (data-horizontaal) dat zijwaarts schuift bij het scrollen.",
    accordeon: "Uitklaplijst met <details>/<summary>: grote koppen, bij openen de uitleg met een foto.",
    verhaal: "Scroll-verhaal: een vaste afbeelding of illustratie die per dienst verandert (data-verhaal/data-stap).",
  },
  navigatie: {
    balk: "Klassieke balk bovenaan, logo links, menu rechts.",
    midden: "Logo in het midden, menu-items links en rechts ervan verdeeld.",
    pil: "Zwevende afgeronde menubalk (pil) die over de hero ligt.",
    zijkant: "Op desktop een smalle verticale balk aan de linkerkant met logo en knop; op mobiel een normale kop.",
    minimaal: "Alleen logo en één grote knop; het menu als ankerlinks onderaan de hero.",
  },
  beeld: {
    puur: "Foto's puur en groot, harde rechte uitsnedes.",
    duotone: "Eén of twee beelden met een subtiele kleurtoon in hun merkkleur (mix-blend of overlay), de rest puur.",
    kader: "Foto's met een witte rand of passe-partout, als afdrukken.",
    vormen: "Foto's in vormen die bij de vormtaal horen (bogen, cirkels, schuin).",
    overlap: "Foto's die over sectiegrenzen heen lopen en elkaar deels overlappen.",
    zwartwit: "Sfeerbeelden licht gedesatureerd, hun eigen werk in volle kleur zodat dat opvalt.",
  },
  extra: {
    kernzin: "Een sectie met alleen één grote kernzin uit hun tekst.",
    gebied: "Hun werkgebied of plaatsen (alleen als die in de tekst staan), als grote lijst of kaartdetail.",
    tijden: "Openingstijden groot en prominent (alleen als die er zijn), anders een sectie 'Zo werken we'.",
    galerij: "Een masonry-fotogalerij met hun eigen werk.",
    doelgroep: "Voor wie ze werken (alleen uit de tekst), als grote woorden of chips.",
    vragen: "Een paar vragen en antwoorden die echt uit hun tekst volgen (met <details>), anders een kernzin.",
  },
  pronkstuk: {
    verhaal: "Scroll-verhaal met een vast element uit hun vak dat per stap verandert.",
    tekenen: "Een grote lijntekening uit hun vak (route, leiding, plattegrond, schets) die zich tekent tijdens het scrollen (data-tekenen).",
    spoor: "Een horizontaal spoor met hun foto's of werkwijze dat zijwaarts schuift tijdens het scrollen.",
    onthulling: "Een groot beeld dat zich opent in een vorm uit hun vak (data-onthul cirkel of van links) met een kernzin erover.",
    zoom: "Een foto over de volle breedte die tijdens het scrollen van dichtbij naar het hele beeld uitzoomt (data-schaal), met tekst die eroverheen schuift.",
    woorden: "Hun belangrijkste belofte als enorme tekst over de volle breedte die woord voor woord oplicht (data-scrub), met beelden die erlangs parallax-schuiven.",
  },
  over: {
    citaat: "Groot citaat of kernzin uit hun tekst met een portret ernaast; de naam als handtekening-achtig detail.",
    kolommen: "Tekst in twee rustige kolommen onder een grote kop, met een rij kleine foto's eronder.",
    overlap: "Foto over de volle breedte met een tekstvlak dat er deels overheen schuift.",
    werkwijze: "Hun werkwijze als korte tijdlijn of stappen (alleen als hun tekst dat echt beschrijft), anders een korte feitenrij uit de tekst.",
    portret: "Portret in de vormtaal van de site, met de tekst eromheen gezet als in een tijdschrift.",
  },
  contact: {
    band: "Brede band in hun volle kleur met een enorm telefoonnummer of hoofdactie, gegevens klein eronder.",
    gesplitst: "Links de gegevens en knoppen, rechts een grote foto tot aan de rand.",
    wit: "Rustige witte afsluiting: grote kop, drie grote knoppen naast elkaar, gegevens in een rij.",
    route: "Een getekende mini-kaart of route-illustratie met hun adres, naast de gegevens.",
  },
  letters: {
    serif: "Een karaktervolle serif voor koppen met een strakke sans voor tekst.",
    breed: "Een brede, zware grotesk voor koppen (letterspatie iets negatief).",
    smal: "Een smalle (condensed) hoge letter voor koppen, groot en in hoofdletters mag hier.",
    rond: "Een ronde, vriendelijke sans voor koppen en tekst.",
    geometrisch: "Een geometrische moderne sans met een duidelijke typeschaal.",
    klassiek: "Een elegante klassieke letter met veel wit en fijne lijnen.",
  },
  basis: {
    wit: "Wit als basis met één of twee banden in een zachte tint van hun kleur.",
    tint: "Een zachte, lichte tint van hun hoofdkleur als basis over de hele pagina.",
    kleurvlak: "Wit als basis met één grote sectie in hun volle merkkleur.",
    papier: "Warm wit/papier als basis met fijne lijnen als structuur.",
  },
  vormen: {
    hoekig: "Scherpe hoeken, rechte lijnen, nul of minimale afronding.",
    bogen: "Grote bogen en boogvormige uitsnedes.",
    cirkels: "Cirkels en ronde uitsnedes als terugkerend motief.",
    schuin: "Schuine randen en diagonale lijnen tussen secties.",
    organisch: "Zachte, organische vormen en golvende scheidingen.",
  },
};

const kies = (opties, recent, rnd) => {
  const vrij = opties.filter((o) => !recent.includes(o));
  const lijst = vrij.length ? vrij : opties;
  return lijst[Math.floor(rnd() * lijst.length)];
};

// recentDNA = lijst van eerdere dna-objecten (nieuwste eerst). Seed = concept-id, zodat het reproduceerbaar is.
export function maakDNA(recentDNA = [], seed = "") {
  let i = 0;
  const h = crypto.createHash("sha256").update(String(seed) + Date.now()).digest();
  const rnd = () => h[i++ % h.length] / 256;
  const dna = {};
  const venster = { richting: 9, hero: 8, navigatie: 3, beeld: 4, extra: 4, diensten: 6, pronkstuk: 5, over: 4, contact: 3, letters: 5, basis: 3, vormen: 4 };
  for (const [k, opties] of Object.entries(DNA)) {
    const recent = recentDNA.slice(0, venster[k] || 3).map((d) => d?.[k]).filter(Boolean);
    dna[k] = kies(Object.keys(opties), recent, rnd);
  }
  // diensten en pronkstuk niet allebei hetzelfde mechanisme
  if ((dna.diensten === "verhaal" && dna.pronkstuk === "verhaal") || (dna.diensten === "spoor" && dna.pronkstuk === "spoor")) dna.pronkstuk = kies(Object.keys(DNA.pronkstuk).filter((x) => x !== dna.pronkstuk), [], rnd);
  dna.strook = rnd() < 0.3; // doorlopende strook alleen soms
  // volgorde van het middendeel wisselt
  const midden = ["diensten", "pronkstuk", "over", "extra", "fotos"];
  for (let j = midden.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [midden[j], midden[k]] = [midden[k], midden[j]]; }
  dna.volgorde = ["hero", ...midden, "contact"];
  return dna;
}

export function dnaTekst(dna) {
  return [
    `Richting (art direction): ${DNA.richting[dna.richting]}`,
    `Navigatie: ${DNA.navigatie[dna.navigatie]}`,
    `Hero: ${DNA.hero[dna.hero]}`,
    `Diensten: ${DNA.diensten[dna.diensten]}`,
    `Pronkstuk: ${DNA.pronkstuk[dna.pronkstuk]}`,
    `Over: ${DNA.over[dna.over]}`,
    `Contact: ${DNA.contact[dna.contact]}`,
    `Letters: ${DNA.letters[dna.letters]}`,
    `Basis: ${DNA.basis[dna.basis]}`,
    `Vormen: ${DNA.vormen[dna.vormen]}`,
    `Beeld: ${DNA.beeld[dna.beeld]}`,
    `Extra sectie: ${DNA.extra[dna.extra]}`,
    `Volgorde: ${(dna.volgorde || []).join(" → ")} (fotos = een fotosectie als er genoeg goede foto's zijn; mag samenvallen met een ander onderdeel)`,
    dna.strook ? "Strook: een doorlopende strook (marquee) mag." : "Strook: GEEN doorlopende strook in dit ontwerp.",
  ].join("\n");
}

// Lettertypen die recent al gebruikt zijn (uit de opgeslagen HTML), om herhaling te voorkomen.
export function lettertypenUit(html) {
  return [...String(html || "").matchAll(/fonts\.bunny\.net\/css2?\?family=([^"'&]+)/g)].flatMap((m) => decodeURIComponent(m[1]).split("|")).map((f) => f.split(":")[0]);
}
