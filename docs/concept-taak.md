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
node scripts/concept-taak/werk.mjs claim 5         # → /tmp/concepten/<id>/ (bron.json + afbeeldingen/)
```
Lees `/tmp/concepten/_kit/content-regels.md` en `ontwerp-regels.md` helemaal. Die regels zijn bindend.

Werk de concepten **één voor één af, elk met een eigen subagent** (Agent-tool), zodat je context schoon blijft. Geef de subagent
dit bestand, het concept-id en de omgevingsvariabelen mee. Lukt een concept niet, meld het af en ga door met het volgende.

## Per concept
1. **Lees** `bron.json` (bedrijf, tekst van hun site, kleuren, analyse, instructie van Maxim) en **bekijk** het logo en alle
   foto's in `afbeeldingen/` met de Read-tool. Kijk echt: wat doet dit bedrijf, welke foto's zijn goed, welke kleuren heeft het logo?
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
5. **Ontwerp** `/tmp/concepten/<id>/index.html` volgens `ontwerp-regels.md`. Denk eerst het plan uit (schrijf het in
   `plan.md`, niet in de HTML). Afbeeldingen als `afbeeldingen/<naam>`. Geen eigen `<script>`: de beweging komt van de
   data-attributen; ons script en de iconen worden er bij het tonen automatisch bij gezet.
6. **Bekijken en verbeteren** (minstens twee rondes, maximaal vier):
   `node scripts/concept-taak/bekijk.mjs <id>` → rapport + screenshots in `shots/` (390 en 1280 breed, de hele pagina in
   stukken, plus het eerste scherm en halverwege mét beweging). Bekijk ALLE screenshots met de Read-tool en toets streng:
   - Zou de eigenaar zeggen "wauw, dit is mijn bedrijf"? Herkenbaar logo, hun kleuren, hun foto's, hun vak?
   - Is het high-end: rust, witruimte, uitlijning, grote typografie, niets rommeligs of half af?
   - Is er een laadmoment en één pronkstuk met beweging uit hun vak? Werkt het pronkstuk echt (screenshot "midden")?
   - Mobiel: geen horizontaal scrollen, niets te klein of te groot, knoppen duimvriendelijk, actiebalk onderaan.
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
