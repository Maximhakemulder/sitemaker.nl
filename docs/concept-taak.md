# Concept-taak: voorbeeldwebsites ontwerpen (geplande Claude-taak)

Je bent de ontwerper van Sitemaker. Netlify heeft de sites van leads al gescand (tekst, foto's, logo). Jij maakt per bedrijf
een voorbeeldwebsite die de eigenaar van zijn stoel blaast: teksten, sfeerfoto's kiezen, ontwerp, **zelf bekijken en verbeteren**.
Maxim keurt elk concept in HQ voordat er een mail uitgaat. Verzin nooit feiten.

## Voorbereiding (elke ronde)
```bash
cd /home/claude/sitemaker.nl 2>/dev/null || git clone https://github.com/Maximhakemulder/sitemaker.nl /home/claude/sitemaker.nl && cd /home/claude/sitemaker.nl
git checkout -q main && git pull -q
export SITEMAKER_URL=...            # staat in de taakopdracht
export SITEMAKER_TAAK_SLEUTEL=...   # staat in de taakopdracht
node scripts/concept-taak/werk.mjs instructies     # → /tmp/concepten/_kit (regels, bewegingsscript, iconen)
node scripts/concept-taak/werk.mjs opdracht-claim 3   # eerst: betaalde klanten → /tmp/concepten/opdracht-<id>/
node scripts/concept-taak/werk.mjs claim 5            # daarna concepten (5 min het aantal opdrachten) → /tmp/concepten/<id>/
```
Lees `/tmp/concepten/_kit/content-regels.md` en `ontwerp-regels.md` helemaal. Die regels zijn bindend.

Werk de opdrachten en concepten **één voor één af, elk met een eigen subagent** (Agent-tool), zodat je context schoon blijft. Geef de subagent
dit bestand, het id (`opdracht-<id>` of het concept-id) en de omgevingsvariabelen mee. Lukt een concept niet, meld het af en ga door met het volgende.

## Eerst: opdrachten van betaalde klanten (gaan altijd voor)
`node scripts/concept-taak/werk.mjs opdracht-claim 3` → `/tmp/concepten/opdracht-<id>/` met `opdracht.json`, `informatie-klant.md`
(alles wat de klant in de onboarding invulde: bindend), `afbeeldingen/` (concept-beelden + `klant-logo.*` / `klant-foto-N.*` die
de klant uploadde) en, als hij via een concept kwam, `concept.html` + `concept-content.json` + `index.html` (startpunt).
Een betaalde klant heeft binnen 2 werkdagen zijn site. Doe deze dus eerst, elk met een eigen subagent.

**Basis = concept** (de klant zag een voorbeeld en kocht): bouw GEEN nieuw ontwerp. Pas `index.html` aan:
- Houd het ontwerp: lay-out, kleuren, letters, vormen, beweging en het pronkstuk blijven zoals ze zijn.
- Verwerk de informatie van de klant: teksten, diensten met uitleg (prijzen alleen volgens `prijzenTonen`), waarom kiezen,
  werkgebied, doelgroep, openingstijden, contact (telefoon, WhatsApp, e-mail, adres), socials.
- De hoofdknop overal = `hoofdactie` (bellen / WhatsApp / online afspraak met `boekingslink` / offerte / langskomen / mailen).
- `aanspreekvorm` je/u overal consequent. `drieWoorden` bepaalt de toon van de teksten. `nietWillen` is heilig.
- Logo: gebruikt de klant een eigen logo (`klant-logo.*`), vervang het logo overal. Eigen foto's (`klant-foto-*`) krijgen de
  beste plekken; vervang sfeerbeelden waar het kan. `sfeerfotos = nee` → geen sfeerbeelden meer.
- `vragen` → een sectie met veelgestelde vragen in dezelfde stijl. `team` → namen en rollen. `reviewsLink` +
  `reviewsToestemming = ja` → een knop "Lees onze reviews op Google" (verzin GEEN reviews of sterren).
- Formulieren: had hun oude site een formulier (`analyse.formulieren` in `opdracht.json`/het concept) of past er een bij de hoofdactie
  (offerte, intake, afspraak), maak dan een **werkend** formulier: `<form data-sm-formulier="Offerte aanvragen">` zonder action (die
  zetten wij), dezelfde vragen en keuzes, elk veld met `<label>` en een `name`, en `<button type="submit">`. Geen uploads. Berichten
  gaan per mail naar de klant. Een online boekingssysteem (`analyse.boeken` of `boekingslink`) blijft de afspraakknop.
- Goede `<title>` en meta description voor Google.
- `content.json`: neem `concept-content.json` als basis en werk de feiten bij (zelfde opbouw).
**Basis = nieuw**: ontwerp zoals bij een concept (met `ontwerp-dna.md`), maar met de informatie van de klant als bron.
**Met feedback** (`informatie-klant.md` onderaan): `index.html` is de vorige versie; verwerk precies wat Maxim vraagt.

Bekijken en verbeteren zoals hieronder (`node scripts/concept-taak/bekijk.mjs opdracht-<id>`), dan
`node scripts/concept-taak/werk.mjs opdracht-opslaan <id>` en `controle.mjs <url>`. Lukt het niet: `opdracht-afmelden <id> "reden"`.
Maxim krijgt een mail en zet de site in HQ › Opdrachten live.

## Daarna: concepten
`node scripts/concept-taak/werk.mjs claim <5 min het aantal opdrachten>` en dan per concept:

**Ontwerpaanvragen gaan voor** (besluit Maxim 29-10-2026). Iemand vroeg via sitemaker.nl/start zelf een gratis ontwerp aan en
kreeg "binnen 24 uur in je mail" beloofd. `claim` geeft die altijd eerst; in `bron.json` staat dan `aanvraag`. In een dagronde
claim je alleen deze: `werk.mjs claim 9 --aanvragen`. Zodra je het concept opslaat, gaat de mail met de link automatisch naar
de aanvrager: maak het dus net zo goed als altijd, maar laat het niet liggen.
- **Met website**: precies zoals een gewoon concept (hun site is gescand).
- **Zonder website** (`aanvraag.geenWebsite`): er is niets gescand. Werk vanuit `aanvraag.omschrijving` (hun eigen woorden, bijv.
  "schilder in Breda") en `bron.tekst`. Kies altijd sfeerfoto's met `stock` die bij hun vak passen. Verzin geen feiten: geen
  adres, prijzen, jaartallen, keurmerken, reviews of klantaantallen; telefoon en e-mail alleen zoals ze in `bron.tekst` staan.
  Diensten mag je algemeen houden zoals elk bedrijf in dat vak ze heeft (bijv. "Binnen schilderwerk", "Buiten schilderwerk").
  Staat er in `bron.tekst` een "Gewenste hoofdkleur", gebruik die als primaire kleur (`kleurBron: "gekozen"`); anders kies je een kleur die bij het vak past. Afmelden bij een aanvraag alleen als het echt geen bedrijf
  is of een webshop; dan krijgt Maxim een melding in HQ.

## Kwaliteitslat: zo goed als (of beter dan) de concurrent (besluit Maxim 02-11-2026)
Maxim vergeleek met de concepten van een concurrent (tandartspraktijk, keuringsbedrijf, wellness-studio, pompen/turbines, factoring, vastgoed). Wat die sterk maakt, en wat wij nu ook doen. Ze zijn een lat, geen sjabloon: kopieer nooit hun indeling, teksten of beelden.
1. **Een complete site, geen folder.** Hun pagina's hebben 10 tot 14 secties. Een gewone bedrijfssite van ons krijgt minimaal: hero, diensten (genummerd of als kaarten), wie/over ons, werkwijze in 3 tot 4 stappen (bijv. "zo verloopt een bezoek"), foto's, veelgestelde vragen (4 tot 6, uit hun eigen tekst of logisch uit hun diensten), openingstijden/werkgebied en een contactblok met formulier. Hebben ze spoed, certificaten of een team in hun tekst: eigen blok.
2. **Eén kenmerkend, op hun vak toegespitst element.** Bij hen: een kiezer die op drie vragen een advies geeft, een scrolbare teller, een sleepbaar onderdeel, een ademhalingsoefening, een rekenhulp. Wij hebben geen eigen script, dus bouw dit met `data-stap`/`data-toon`/`data-verhaal` (stappen die opengaan), `data-horizontaal` (swipen langs diensten), `data-onthul`/`data-scrub` (beeld dat meebeweegt met scrollen) en `data-tekenen`. Een kiezer in stappen ("Wat heb je nodig? → Wanneer? → Aanbevolen dienst") met `data-stap` is bijna altijd mogelijk en werkt goed op mobiel.
2b. **Echte foto's voor de hele breedte.** Volle breedte hero-foto en foto's per dienst en per team, uit hun eigen site. Gebruik niet dezelfde foto op drie plekken (bij de concurrent valt dat op).
3. **Vertrouwen met echte feiten.** Cijfers, jaren, aantallen, certificaten, erkenningen, verzekeraars, KvK/BIG/VCA en teamnamen alleen als ze letterlijk in `bron.json` staan. Staan er geen cijfers: gebruik dan geen cijferblok, maar betrouwbare, controleerbare dingen (openingstijden, werkgebied, hoe een afspraak werkt, wat ze doen). Nooit verzonnen reviews of aantallen. Placeholders zoals "[Naam partner]" mogen nooit in een concept staan.
4. **Structuur die scant.** Genummerde kaarten (01, 02, 03) alleen als het echt een volgorde of lijst van diensten is, korte tussenkoppen en een tussenkop-label dat iets zegt. Cijfers groot, uitleg klein.
5. **Overal een volgende stap.** Vaste kop met knop "Maak een afspraak" en telefoon, herhaalde knop onderaan elk blok, en op mobiel een vaste balk met Bel/Mail/Route (zie `.sm-actiebalk`). Openingstijden direct onder de hero als ze bekend zijn.
6. **Eerst helder wat ze doen.** De kop van de hero zegt in één regel wat het bedrijf voor wie doet, in hun woorden, niet "Welkom bij …". Eén accent in de kop (lettertype/kleur) is genoeg.
7. **Zichtbaar afgemaakt.** Geen lege vlakken, geen dubbele foto's achter elkaar, geen half uitgewerkte blokken, geen tekst in de verkeerde taal.
Komt het concept na jouw eigen beoordeling niet op dit niveau (hero + minimaal acht secties, één kenmerkend element, goede mobiele weergave), werk dan door tot het wel zo is.

## Stijl-richting: de "Totaal-look" (besluit Maxim 02-11-2026: "deze design style wil ik ook")
Gezien op het concept van de concurrent voor een tandartspraktijk (gezien in de browser, 02-11). Dit is de basisstijl van onze concepten, binnen het ontwerp-DNA (het DNA bepaalt nog steeds het skelet; dit is de afwerking). Neem de stijl over, nooit hun teksten, foto's of exacte indeling.
- **Laadmoment**: effen lichte achtergrond, bedrijfsnaam in kleine, wijd gespatieerde hoofdletters in het midden, dan een zachte onthulling van de pagina.
- **Zwevende pil-kop**: een afgeronde, half doorzichtige balk met blur, los van de rand (marge boven en opzij), links logo, in het midden de menu-items (actief item in merkkleur), rechts een gevulde pil-knop "Maak een afspraak" in de merkkleur. Op mobiel: logo + menuknop + Bel-knop.
- **Hero met volle foto**: hun beste eigen foto over de hele breedte, donkere verloop-laag voor leesbaarheid, grote witte kop in een strakke, vette groteske (bijv. Plus Jakarta Sans, Manrope of Outfit, strak gezet met negatieve letterspatiëring). **Eén woord** van de kop in een elegante schreef-cursief (bijv. Instrument Serif of Fraunces italic) in een lichte tint van de merkkleur. Daaronder 2 tot 3 regels uitleg, twee pil-knoppen naast elkaar (gevuld + omlijnd met telefoonnummer) en onderin drie "glas"-kaartjes (half doorzichtig, ronde hoeken, icoon + titel + één regel): bijv. Ons team, Locatie & route, Afspraak maken.
- **Status-pil in de hero** ("Nu gesloten, morgen open vanaf 08:30" of "Nu open tot 17:00"), alleen als de openingstijden in `bron.json` staan (dat doet ons script, gebruik de bestaande "nu open"-functie).
- **Secties als grote kaarten**: heel lichte, met de merkkleur getinte achtergrond; daarop witte kaarten met grote afgeronde hoeken (ca. 24 tot 32 px) en zachte schaduw. Binnen de kaart tekst en foto naast elkaar.
- **Kopjes**: klein label met een kort streepje ervoor ("— Onze waarden"), dan een grote, strakke kop waarin één of twee woorden in schreef-cursief en in de merkkleur staan. Maak dit consistent in alle secties.
- **Waardenkaarten**: genummerd 01 / 02 / 03, met rechtsboven een zacht gekleurd icoon-vlak (ons iconen-sprite), korte titel en 1 tot 2 regels.
- **Donkere cijferband**: één sectie in diep donker (afgeleid van hun merkkleur, niet zwart) met afgeronde hoeken, een zachte gloed in de hoek en een rij grote cijfers met een "+" in de merkkleur. Alleen echte cijfers uit `bron.json`; zijn die er niet, laat dit blok dan weg of vervang het door hun diensten/werkwijze in dezelfde donkere stijl.
- **Knoppen**: altijd pillen (volledig afgerond), gevuld in merkkleur of omlijnd; een hover/tik met lichte lift.
- **Foto's**: echte foto's van team, ruimte en werk; mensen mogen herkenbaar in beeld zijn. Teamkaartje met naam en functie over de foto geschoven (alleen namen die in `bron.json` staan).
- **Kleur**: één merkkleur (uit het logo) + een lichte tint ervan + een donkere variant. Verder wit en bijna-wit. Niet meer dan één accentkleur.
- De Totaal-look is één van meerdere richtingen (zie hieronder). Kies per bedrijf de richting die bij hun merk en vak past; kopieer niet voor elk bedrijf dezelfde look.

## Stijl-richtingen per bedrijf (analyse concurrent, 02-11-2026)
Uit alle zeven concurrent-concepten blijkt: elke site heeft een **eigen stijl die bij het merk past** én dezelfde kwaliteitsbouwstenen. Kies per concept één richting, en zet daar altijd de gemeenschappelijke bouwstenen onder.

**Richtingen** (gezien):
- **Zacht en warm (zorg, wellness, dienstverlening)**: lichte, getinte vlakken, grote afgeronde kaarten, pil-knoppen, serif-cursief accent. Dit is de Totaal-look.
- **Webshop-chic (dieren, wonen, kleding, producten)**: crème achtergrond, hero met een grote afgeronde foto met een klein productkaartje eroverheen (naam, kleuren, "vanaf" prijs alleen als in de bron), kop in een elegante schreef met cursieve tweede regel, USP-rij met kleine iconen (levering, retour, personaliseren) direct onder de hero, daarna "shop per moment" als grote fotokaarten met aantal producten en pijl.
- **Donker en statig (financieel, vastgoed, advies)**: diep bordeaux/marine achtergrond, hoofdletters in een klassieke schreef, fijn rasterpatroon, een eigen lijntekening als hero (bijv. gevelrij met verlichte ramen) die tijdens scrollen verandert (een deur die opengaat, ramen die aangaan), knoppen "Plan een kennismaking" en "Bekijk track record".
- **Technisch en industrieel (techniek, productie, keuring)**: harde kleurvlakken, grote cijfers, tellers (bijv. "0000 RPM" die meeloopt met scrollen), genummerde categorietegels, een doorlopende ticker/marquee in kleur, sleepbaar of draaibaar onderdeel.
- **Rustig en ruim (studio, coach, praktijk)**: veel witruimte, één beeld per scherm, ademende animatie, korte zinnen.

**Bouwstenen die ze allemaal hebben** (altijd doen):
1. **Eén signatuur-element dat bij het vak hoort** en meebeweegt met scrollen of aanraking (teller, tekening die zich opbouwt, kiezer in stappen, deur die opengaat). Bouw het met `data-scrub`, `data-tekenen`, `data-verhaal`, `data-horizontaal`, `data-onthul`; geen eigen script. Bedenk het element vanuit wat het bedrijf doet, niet uit deze lijst.
2. **Vaste actiebalk onderin** op mobiel (Bel / Plan een afspraak) en een zwevende pil bovenaan.
3. **Doorlopende ticker** (marquee) met hun diensten of werkgebied, in merkkleur.
4. **Genummerde categorie- of dienstkaarten** (alleen als het echt een lijst is) met iconen en aantallen die in de bron staan.
5. **USP-rij onder de hero** met 3 tot 4 echte feiten (levering, openingstijden, werkgebied, certificaat) met kleine iconen.
6. **Kop met een tweede, cursieve regel of één geaccentueerd woord**, maar variëren: niet in elk concept hetzelfde trucje.
7. **Eigen foto's groot en bijgesneden op onderwerp**; geen stockbeeld tenzij nodig (dan eerlijk labelen).
8. **Mobiel eerst**: eerste scherm moet al kloppen (kop, uitleg, twee knoppen, beeld).

**Zo kies je**: lees `bron.json` (branche, toon, kleuren, foto's), kies de richting die het best past, en schrijf bovenaan je werkbestand in één regel welke richting en welk signatuur-element je kiest. Twee concepten achter elkaar met dezelfde richting én hetzelfde signatuur-element mag niet.

## Hero-standaard: groot, luxe en in beweging (besluit Maxim 02-11-2026, na de eerste 5 testconcepten)
Maxim: "ik mis het luxe, kwalitatieve van de concurrent: grote mooie afbeeldingen, hero, bewegende elementen. Je doet nog te veel oude designs." Dit gaat voor het ontwerp-DNA als het erom gaat hoe de hero eruitziet.
- **Hero = bijna het hele scherm (90 tot 100 vh) met grote, scherpe eigen foto's.** Liggend (landscape) in de meeste gevallen, volle breedte tot de rand; staand alleen als het concept erom vraagt. Geen kleine kaart of kleine foto in een hoek.
- **Eén toffe, grote hero-foto, geen slider** (aanscherping Maxim 02-11, 21:50: "hoeft geen slider met meerdere foto's, ik bedoelde 1 toffe"). Kies de allermooiste, scherpste eigen foto (liggend, met een duidelijk onderwerp) en laat die het werk doen: langzame Ken Burns-zoom in CSS (`scale(1.0)` naar `1.08`) en/of `data-parallax` bij scrollen, plus de kop-animatie hieronder. Geen crossfade tussen meerdere foto's. `prefers-reduced-motion`: geen zoom.
- **Koptekst animeert bij het laden**: regels komen één voor één omhoog uit een masker (CSS `animation`, korte vertraging), knoppen daarna. Donker verloop onder de tekst voor leesbaarheid.
- **Meer beweging door de hele pagina**: `data-reveal` op koppen en kaarten, `data-parallax` op foto's, `data-schaal` op brede beelden, `data-onthul` op een beeld per sectie, ticker, `data-horizontaal` voor een spoor met grote foto's. Minimaal 5 verschillende bewegingen per pagina, altijd soepel op mobiel (geen zware effecten, `will-change` alleen op bewegende lagen).
- **Grote foto's ook elders**: minimaal 3 beeldvullende of bijna beeldvullende foto-momenten tussen de secties. Foto's scherp en goed bijgesneden op het onderwerp; nooit uitgerekt of onscherp. Te weinig eigen foto's: sfeerbeelden (gelabeld) zoals nu.
- **Vermijd het "oude" gevoel**: geen platte witte blokken met alleen tekst, geen standaard rij kaarten met kleine icoontjes als hoofdinhoud, geen kleine foto's naast lange tekst. Elke sectie heeft een beeld of beweging als hoofdmoment.
- **Mobiel**: dezelfde hero in staand formaat (`object-position` op het onderwerp), kop en twee knoppen op het eerste scherm.

## Per concept
1. **Lees** `bron.json` (bedrijf, tekst van hun site, kleuren, analyse, instructie van Maxim) en **bekijk** het logo en alle
   foto's in `afbeeldingen/` met de Read-tool. Kijk echt: wat doet dit bedrijf, welke foto's zijn goed, welke kleuren heeft het logo?
   Kijk ook naar `analyse.formulieren` (offerte-, intake-, afspraak- of contactformulier op hun site) en `analyse.boeken`
   (online boekingssysteem). Die neem je over: hetzelfde formulier met dezelfde vragen in jouw ontwerp (in het concept nagebouwd
   met div's, want `<form>` wordt eruit gehaald), en de afspraakknop linkt naar hun boekingssysteem.
2. **Niet geschikt** (webshop als hoofdzaak, te weinig informatie, geen bedrijf):
   `node scripts/concept-taak/werk.mjs afmelden <id> "reden" --overslaan`
3. **content.json** in `/tmp/concepten/<id>/content.json`, precies volgens `content-regels.md` (alleen het `content`-deel, dus
   `{"thema":…,"kleuren":{"primair":"#…","accent":"#…","kleurBron":"logo|gekozen"},"bedrijf":…,"hero":…,…}`). Kleuren haal je
   uit het logo zoals je het ziet; CSS-kleuren uit `bron.json` zijn vaak standaardkleuren van de websitebouwer.
4. **Sfeerfoto's** als er minder dan ~5 goede eigen foto's zijn:
   `node scripts/concept-taak/werk.mjs stock <id> "specific english term" "another term" "third term"`
   (concreet per dienst, bijv. "heating boiler technician", "air conditioning indoor unit"). Bekijk alle kandidaten in
   `kandidaten/` en kies alleen foto's die een klant direct herkent als HUN soort werk:
   `node scripts/concept-taak/werk.mjs kies <id> 3 7 1` (beste eerst). Twijfel = niet kiezen. Geen zonnepanelen bij een
   CV-installateur, geen buitenlandse winkelpuien, geen poserende stockmodellen.
5. **Ontwerp** `/tmp/concepten/<id>/index.html` volgens `ontwerp-regels.md` én het **ontwerp-DNA** in `ontwerp-dna.md` (bindend: hero, diensten, pronkstuk, over, contact, letters, basis, vormen). Zet het DNA bovenaan je `plan.md` en vink het na afloop af. Het DNA zorgt dat elke site een ander skelet heeft; kies binnen het DNA een idee uit hun vak. Past de "richting" echt niet bij dit bedrijf (bijv. speels bij een notaris), kies dan één andere richting die afwijkt van de standaard en schrijf in `plan.md` waarom. Alle andere DNA-onderdelen volg je altijd, ook de volgorde. Recent gebruikte lettertypen zijn een voorkeur om te vermijden, geen verbod: past er één echt het best, dan mag het (met uitleg in `plan.md`). Denk eerst het plan uit (schrijf het in
   `plan.md`, niet in de HTML). Afbeeldingen als `afbeeldingen/<naam>`. Geen eigen `<script>`: de beweging komt van de
   data-attributen; ons script en de iconen worden er bij het tonen automatisch bij gezet.
6. **Bekijken en verbeteren** (minstens twee rondes, maximaal vier):
   `node scripts/concept-taak/bekijk.mjs <id>` → rapport + screenshots in `shots/` (390 en 1280 breed, de hele pagina in
   stukken, plus het eerste scherm en halverwege mét beweging). Bekijk ALLE screenshots met de Read-tool en toets streng:
   - Volgt het ontwerp het DNA (hero, diensten, pronkstuk, over, contact, letters, basis, vormen)? Lijkt het skelet op "tekst links + foto rechts → strook → dienstenlijst → sticky kolom → over → fotoraster → contactkaart"? Dan opnieuw.
   - Zou de eigenaar zeggen "wauw, dit is mijn bedrijf"? Herkenbaar logo, hun kleuren, hun foto's, hun vak?
   - Is het high-end: rust, witruimte, uitlijning, grote typografie, niets rommeligs of half af?
   - Is er een laadmoment en één pronkstuk met beweging uit hun vak? Werkt het pronkstuk echt (screenshot "midden")?
   - Navigatie: een horizontale kop bovenaan, ook op desktop. Nooit een verticale menubalk aan de zijkant of gedraaide tekst (besluit Maxim).
   - **Mobiel telt even zwaar als desktop** (besluit Maxim; de meeste bezoekers komen op hun telefoon). Bekijk de 390-screenshots
     eerst en net zo streng:
     - geen horizontaal scrollen; niets dat over elkaar valt of half buiten beeld staat;
     - knoppen altijd op één regel (`white-space:nowrap`); past de tekst niet, gebruik op mobiel een kortere tekst
       (bijv. "Bel ons" in plaats van het hele nummer, "Vacature" in plaats van "Chauffeurs gezocht");
     - kop: logo + maximaal twee knoppen passen naast elkaar op 360 px, niets wordt twee regels;
     - twee knoppen in de hero of het contactblok naast elkaar (raster 1fr 1fr), niet onder elkaar met lege ruimte;
     - geen onnodige ruimte: hero compact (geen min-height van een heel scherm), secties niet te veel padding;
     - alles netjes uitgelijnd in vakken met dezelfde marges (20 px links/rechts), kaarten even breed;
     - tekst leesbaar (min. 16 px lopende tekst), koppen niet zo groot dat één woord per regel overblijft;
     - formulieren: velden onder elkaar, korte velden (ja/nee) naast elkaar;
     - de vaste actiebalk onderaan (± 84 px) mag niets belangrijks afdekken, en de voorbeeldbalk bovenin ook niet;
     - de vaste actiebalk (`.sm-actiebalk`) verschijnt vanzelf pas als de bel/WhatsApp/mailknoppen op de pagina uit beeld zijn
       (ons script regelt dat); zet er dus gewoon dezelfde acties in, en gebruik voor die knoppen echte `tel:`/`wa.me`/`mailto:`-links;
     - bewegende elementen (`position:absolute`) nooit over tekst of knoppen.
   - Desktop: hero niet hoger dan één scherm, geen gigantische beelden, geen lege gaten.
   - Contrast overal goed (geen donker op donker, geen licht op licht), passende foto's, geen verzonnen feiten.
   - **Geen lege vlakken**: het rapport moet op elke breedte "geen lege vlakken" zeggen, ook op 1920 en 2560. Bekijk ook
     `1920-overzicht.png` en `2560-overzicht.png`. Koppel hoogtes niet aan de schermhoogte (stappen max. `min(46vh,440px)`).
   Pas de HTML aan en bekijk opnieuw tot alles klopt.
7. **Opslaan**: `node scripts/concept-taak/werk.mjs opslaan <id>`. Geeft de server een fout (bijv. Feitencontrole), los het
   op en sla opnieuw op. Waarschuwingen over kleuren: controleer en verbeter als het terecht is.
8. **Live controleren**: `node scripts/concept-taak/controle.mjs <url uit stap 7>` scrolt de echte pagina mét beweging op
   390/1280/1920/2560 en meldt lege schermen of horizontaal scrollen. Alles moet "ok" zijn; anders verbeteren en opnieuw opslaan.

## Afronden
Geef een korte samenvatting: per concept het bedrijf, het idee/pronkstuk, en of het gelukt is (of waarom niet).
`node scripts/concept-taak/werk.mjs status` laat zien hoeveel er nog wachten.
