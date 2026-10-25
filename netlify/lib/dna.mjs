// Ontwerp-DNA: per concept een vaste combinatie van lay-outkeuzes, zodat niet elke site hetzelfde skelet krijgt.
// Bij elk onderdeel kiezen we iets dat in de laatste concepten niet gebruikt is. De ontwerper moet het volgen.
import crypto from "node:crypto";

export const DNA = {
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
  const venster = { hero: 7, diensten: 5, pronkstuk: 4, over: 3, contact: 3, letters: 4, basis: 2, vormen: 3 };
  for (const [k, opties] of Object.entries(DNA)) {
    const recent = recentDNA.slice(0, venster[k] || 3).map((d) => d?.[k]).filter(Boolean);
    dna[k] = kies(Object.keys(opties), recent, rnd);
  }
  // diensten en pronkstuk niet allebei hetzelfde mechanisme
  if ((dna.diensten === "verhaal" && dna.pronkstuk === "verhaal") || (dna.diensten === "spoor" && dna.pronkstuk === "spoor")) dna.pronkstuk = kies(Object.keys(DNA.pronkstuk).filter((x) => x !== dna.pronkstuk), [], rnd);
  dna.strook = rnd() < 0.4; // doorlopende strook alleen soms
  return dna;
}

export function dnaTekst(dna) {
  return [
    `Hero: ${DNA.hero[dna.hero]}`,
    `Diensten: ${DNA.diensten[dna.diensten]}`,
    `Pronkstuk: ${DNA.pronkstuk[dna.pronkstuk]}`,
    `Over: ${DNA.over[dna.over]}`,
    `Contact: ${DNA.contact[dna.contact]}`,
    `Letters: ${DNA.letters[dna.letters]}`,
    `Basis: ${DNA.basis[dna.basis]}`,
    `Vormen: ${DNA.vormen[dna.vormen]}`,
    dna.strook ? "Strook: een doorlopende strook (marquee) mag." : "Strook: GEEN doorlopende strook in dit ontwerp.",
  ].join("\n");
}
