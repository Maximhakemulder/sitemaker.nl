/* Sitemaker HQ: het bedrijf. Afdelingen (verdiepingen), medewerkers en wat ze doen.
   Elke medewerker hoort bij echt werk in HQ; de live-status (wat ze vandaag gedaan hebben, of ze nu bezig zijn)
   komt uit /api/hq/team. status: "live" = draait, "opbouw" = wacht op een koppeling. */
window.SM_ORG = [
  {
    key: "directie", floor: 7, name: "Directie", color: "#1C0747", status: "live", manager: "directeur",
    desc: "De directeur leest elke ochtend de briefings van alle afdelingsmanagers en zet voor jou op een rij wat aandacht nodig heeft.",
    people: [
      { key: "jij", person: "Maxim", role: "Eigenaar", look: { hair: 0x2b1d14, acc: "none" }, color: 0, does: ["Neemt de beslissingen", "Keurt concepten, mails en wijzigingen goed"] },
      { key: "directeur", person: "Victor", role: "Algemeen directeur", look: { hair: 0x9a9a9a, acc: "glasses" }, color: 0,
        does: ["Leest elke ochtend alle afdelingsbriefings", "Zet jouw beslissingen voor vandaag op een rij"] },
    ],
    tasks: ["Elke ochtend na 8:00 de directiebriefing", "Prioriteiten en beslissingen voor jou klaarzetten"],
  },
  {
    key: "marketing", floor: 6, name: "Marketing & Design", color: "#FF5757", status: "live", manager: "marketeer", page: "marketing",
    desc: "Elke week nieuwe advertenties voor Meta: statische beelden en korte animaties, gemaakt met Kive. Jij keurt ze en zet ze zelf in Meta.",
    people: [
      { key: "marketeer", person: "Lisa", role: "Marketingmanager", look: { hair: 0x7a3b22, acc: "headset" }, color: 1,
        does: ["Bepaalt elke week de invalshoeken (snel, vaste prijs, vakmensen zonder tijd)", "Schrijft de teksten voor Meta: kop, primaire tekst en knop", "Leert van wat jij goedkeurt en afkeurt"] },
      { key: "designer", person: "Milo", role: "Designer", look: { hair: 0x15110e, acc: "cap" }, color: 4,
        does: ["Maakt elke maandag 4 statics en 2 animaties met Kive", "Vakmensen met een voorbeeldwebsite op telefoon of laptop (verzonnen bedrijf)", "Elke ad in 1:1 (feed) en 9:16 (story), ook in je Canva-map"] },
    ],
    tasks: ["Elke maandag: 4 statics + 2 animaties met Kive (Milo), teksten door Lisa", "Jij keurt in HQ › Marketing en zet ze in Meta"],
  },
  {
    key: "b2b", floor: 5, name: "B2B Verkoop", color: "#6C4CF1", status: "live", manager: "verkoopmanager", page: "concepten",
    desc: "Bedrijven vinden, hun website bekijken, een concept-website maken en mailen. Jij drukt alleen op versturen.",
    people: [
      { key: "verkoopmanager", person: "Noah", role: "Verkoopmanager", look: { hair: 0x5a3b25, acc: "none" }, color: 2, does: ["Stuurt het B2B-team aan", "Brieft jou elke ochtend over verkoop"] },
      { key: "scout", person: "Joep", role: "Scout", look: { hair: 0xc98a4b, acc: "none" }, color: 6, does: ["Zoekt elke werkdag bedrijven via Outscraper"] },
      { key: "researcher", person: "Fleur", role: "Researcher", look: { hair: 0xd9b26a, acc: "glasses" }, color: 3, does: ["Zoekt het algemene mailadres op hun site", "Schrijft een persoonlijke openingszin"] },
      { key: "conceptmaker", person: "Sam", role: "Conceptmaker", look: { hair: 0x15110e, acc: "bun" }, color: 5, does: ["Bekijkt hun huidige website", "Maakt er een concept-website van"] },
      { key: "postkamer", person: "Ties", role: "Postkamer", look: { hair: 0x9a6b45, acc: "cap" }, color: 1, does: ["Verstuurt goedgekeurde mails binnen de verzendtijden", "Leest de inbox: reacties, afmeldingen en bounces"] },
    ],
    tasks: ["Elke werkdag nieuwe bedrijven zoeken (Joep)", "Mailadres en openingszin per lead (Fleur)", "Concept-website per lead (Sam)", "Mails versturen en inbox lezen (Ties)"],
  },
  {
    key: "projecten", floor: 4, name: "Projecten", color: "#0CC0DF", status: "live", manager: "projectmanager", page: "wijzigingen",
    desc: "Nieuwe websites binnen 48 uur (2 werkdagen) opleveren en de 4 wijzigingen per maand binnen 48 uur verwerken.",
    people: [
      { key: "projectmanager", person: "Iris", role: "Projectmanager", look: { hair: 0x7a3b22, acc: "bun" }, color: 2, does: ["Bewaakt alle wijzigingen en de 48 uur", "Zet voorstellen klaar om goed te keuren"] },
      { key: "webbouwer", person: "Daan", role: "Webbouwer", look: { hair: 0x2b1d14, acc: "glasses" }, color: 6, does: ["Verwerkt wijzigingen in de site van de klant", "Maakt een voorbeeldversie om te keuren"] },
      { key: "opleveraar", person: "Lotte", role: "Oplevering nieuwe sites", look: { hair: 0xd9b26a, acc: "none" }, color: 5, does: ["Bouwt nieuwe sites zodra de klant zijn informatie aanlevert", "Bewaakt de 2 werkdagen"] },
    ],
    tasks: ["Wijzigingen binnen 48 uur (Iris en Daan)", "Nieuwe sites binnen 2 werkdagen na aanleveren (Lotte)"],
  },
  {
    key: "domeinen", floor: 3, name: "Domeinen", color: "#D94F8A", status: "live", manager: "domeinen", page: "domeinen",
    desc: "Verbindt het domein van de klant met zijn site. De klant koopt en beheert zijn domein zelf; wij registreren of beheren geen domeinen.",
    people: [
      { key: "domeinen", person: "Dirk", role: "Domeinbeheerder", look: { hair: 0x5a3b25, acc: "glasses" }, color: 7,
        does: ["Geeft klanten de DNS-instellingen voor hun eigen domein", "Controleert elke 30 minuten of de DNS goed staat", "Koppelt het domein aan de site en regelt https", "Waarschuwt als een domein niet meer naar de site wijst"] },
    ],
    tasks: ["DNS-instellingen automatisch controleren tot ze kloppen", "Domein aan het Netlify-project van de klant koppelen", "Melden als een domein niet meer naar de site wijst"],
  },
  {
    key: "klantenservice", floor: 2, name: "Klantenservice", color: "#22C3B5", status: "live", manager: "service",
    page: "service", desc: "Klantvragen uit het portaal en de inbox beantwoorden, nieuwe klanten door hun start helpen, kennismakingen plannen en opzeggingen opvangen.",
    people: [
      { key: "service", person: "Emma", role: "Klantenservice", look: { hair: 0x5a3b25, acc: "headset" }, color: 3, does: ["Leest klantvragen uit het portaal en de inbox", "Zet een antwoord klaar dat jij verstuurt", "Volgt nieuwe klanten in hun start", "Vangt opzeggingen op en verzamelt reviews"] },
      { key: "agenda", person: "Ruben", role: "Afspraken & agenda", look: { hair: 0x15110e, acc: "none" }, color: 7, does: ["Beheert de kennismakingen", "Stuurt bevestigingen en herinneringen"] },
    ],
    tasks: ["Klantvragen beantwoorden, antwoord klaar voor jou (Emma)", "Kennismakingen bevestigen en herinneren (Ruben)", "Klanten die vastlopen in hun start signaleren (Emma)", "Opzeggingen en nieuwe reviews melden (Emma)"],
  },
  {
    key: "incidenten", floor: 1, name: "Incidenten", color: "#F5A623", status: "live", manager: "monitor", page: "sites",
    desc: "Houdt alle klantsites in de gaten. Is een site offline, dan weet jij het als eerste.",
    people: [
      { key: "monitor", person: "Kees", role: "Monitoring", look: { hair: 0x9a9a9a, acc: "headset" }, color: 4, does: ["Controleert elke 15 minuten of alle live sites online zijn", "Mailt je bij twee mislukte controles op rij"] },
    ],
    tasks: ["Elke 15 minuten alle live sites controleren", "Melding bij storing en bij herstel"],
  },
  {
    key: "finance", floor: 0, name: "Finance", color: "#2F8A5B", status: "live", manager: "controller", page: "kosten",
    desc: "Abonnementen, omzet, facturen, betalingen en kosten.",
    people: [
      { key: "controller", person: "Bram", role: "Controller", look: { hair: 0xbfbfbf, acc: "glasses" }, color: 5, does: ["Houdt de maandelijkse omzet (MRR) en abonnementen bij", "Maakt facturen van elke betaling", "Signaleert mislukte betalingen", "Zet omzet tegen de kosten die jij invult", "Maakt een export per kwartaal voor de boekhouder"] },
    ],
    tasks: ["Facturen van elke betaling", "Mislukte betalingen en openstaande facturen", "Omzet, abonnementen en kosten per maand"],
  },
];
