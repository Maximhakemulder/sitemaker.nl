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
  Kies een eigen kleur die bij het vak past (`kleurBron: "gekozen"`). Afmelden bij een aanvraag alleen als het echt geen bedrijf
  is of een webshop; dan krijgt Maxim een melding in HQ.

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
