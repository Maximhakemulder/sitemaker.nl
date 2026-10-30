// Gedeelde basis: omgeving, database, het aanbod, tijd en HTTP-hulpjes.
import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";
import pg from "pg";

// Datums (DATE) als tekst "YYYY-MM-DD" teruggeven, zonder tijdzone-verschuiving.
pg.types.setTypeParser(1082, (v) => v);

export const env = (k, d = "") => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

// ---------------------------------------------------------------- het aanbod (één bron voor alle bedragen)
export const OFFER = {
  buildCents: 9995,
  monthlyCents: 6995,
  changesPerMonth: 4,
  changeHours: 24,
  deliveryText: "48 uur (2 werkdagen)",
};

// ---------------------------------------------------------------- database
let _db = null;
function db() {
  if (!_db) {
    const cs = env("SM_DB_URL");
    _db = cs ? getDatabase({ connectionString: cs }) : getDatabase();
  }
  return _db;
}
// q`...` kan niet dynamisch; daarom simpele helpers met $1-parameters.
export async function q(text, params = []) {
  const r = await db().pool.query(text, params);
  return r.rows;
}
export async function one(text, params = []) {
  return (await q(text, params))[0] || null;
}
export async function tx(fn) {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const api = {
      q: async (t, p = []) => (await client.query(t, p)).rows,
      one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
    };
    const out = await fn(api);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDb() { if (_db) { await _db.pool.end().catch(() => {}); _db = null; } }

// Vergrendeling voor geplande taken (zodat twee aanroepen niet tegelijk mailen).
export async function withLock(name, fn, ttlMs = 30000) {
  const got = await one(
    `INSERT INTO locks (name, until) VALUES ($1, NOW() + ($2 || ' milliseconds')::interval)
     ON CONFLICT (name) DO UPDATE SET until = EXCLUDED.until WHERE locks.until < NOW()
     RETURNING name`, [name, String(ttlMs)]);
  if (!got) return { locked: true };
  try { return await fn(); }
  finally { await q("DELETE FROM locks WHERE name = $1", [name]).catch(() => {}); }
}

// ---------------------------------------------------------------- instellingen
export const DEFAULT_SETTINGS = {
  // Online kennismaking boeken. Tijden in Europe/Amsterdam; week: 0 = zondag … 6 = zaterdag.
  agenda: {
    actief: true, duur: 15, interval: 30, minUren: 4, dagenVooruit: 21, maxPerDag: 0, soort: "telefoon", videoLink: "",
    week: { 0: [], 1: [["09:00", "12:00"], ["13:00", "17:00"]], 2: [["09:00", "12:00"], ["13:00", "17:00"]], 3: [["09:00", "12:00"], ["13:00", "17:00"]], 4: [["09:00", "12:00"], ["13:00", "17:00"]], 5: [["09:00", "12:00"], ["13:00", "17:00"]], 6: [] },
  },
  // Tracking op de website (alleen na toestemming via de cookiebanner).
  tracking: { metaPixelId: "" },
  company: {
    name: "Sitemaker", legalName: "MH Holding B.V.", address: "", postcode: "", city: "", kvk: "58436254", vat: "", iban: "",
    email: "hallo@sitemaker.nl", phone: "085 200 92 05", website: "https://sitemaker.nl",
  },
  billing: {
    // De prijzen op de site (€99,95 / €69,95) zijn wat de klant betaalt; btw wordt alleen op de factuur uitgesplitst.
    pricesIncludeVat: true,
    vatRate: 21,
    paymentTermDays: 14,
    invoicePrefix: "SM",
    autoInvoices: true,
  },
  notify: { email: "" },
  b2b: {
    senderName: "",
    perUur: 0, // max. mails per uur (0 = automatisch: daglimiet gelijk verdeeld over de verzenduren)
    dailyMax: 15, // rustig opbouwen: week 1–2 15, week 3–4 25, daarna 40
    meten: { opens: true, kliks: true },
    followupDays: 5,
    sendHours: [8, 17],
    scout: { active: false, perDay: 20, categories: ["installatiebedrijf", "loodgieter", "elektricien", "schilder", "stukadoor", "tegelzetter", "dakdekker", "timmerman", "aannemer", "bouwbedrijf", "klusbedrijf", "metselaar", "voegbedrijf", "vloerenlegger", "bestratingsbedrijf", "hovenier", "kozijnen", "glaszetter", "keukenmontage", "badkamerrenovatie", "zonnepanelen installateur", "warmtepomp installateur", "isolatiebedrijf", "grondwerk", "sloopbedrijf"], places: ["Rotterdam", "Den Haag", "Utrecht", "Breda", "Dordrecht", "Eindhoven"] },
    ai: { research: true },
    // Concept-websites: automatisch maken voor leads met een website (max. perDag), geldig voor geldigDagen.
    concepten: { auto: true, perDag: 250, geldigDagen: 30, wachten: true, maker: "taak" },
    templates: {
      eerste: {
        subject: "Vraagje over {bedrijf}",
        body: "Hoi,\n\n{intro}Ik kwam de website van {bedrijf} tegen en zag een paar kansen om er meer aanvragen uit te halen. Daarom heb ik een ontwerp gemaakt voor jullie nieuwe website, helemaal gericht op meer telefoontjes, mails en afspraken:\n{conceptlink}\n\nWie jullie nodig heeft, zoekt eerst op z'n telefoon. In een paar seconden valt de keuze: bellen, of door naar de volgende. Dit ontwerp laat direct zien wat jullie doen en waarom jullie, en de belknop is altijd binnen handbereik.\n\nAlles in één, zonder verrassingen:\n- €99,95 startkosten, eenmalig\n- daarna €69,95 per maand, maandelijks opzegbaar\n- hosting, onderhoud en 4 wijzigingen per maand inbegrepen\n- binnen 48 uur (2 werkdagen) live\n\nHet ontwerp is privé: niet openbaar, niet in Google, en het verdwijnt vanzelf op {verloopt}.\n\nVragen, of zin om even kort te bellen? Plan zelf een moment in dat jou uitkomt, dan bellen wij jou:\n{belafspraak}\n\nGroet,",
      },
      opvolging: {
        subject: "Re: Vraagje over {bedrijf}",
        body: "Hoi,\n\nEen paar dagen geleden stuurde ik je een ontwerp voor de nieuwe website van {bedrijf}. Misschien is mijn mail tussen het werk door ondergesneeuwd, dus hier is hij nog een keer:\n{conceptlink}\n\nHet ontwerp is gemaakt om meer uit jullie website te halen: bezoekers zien meteen wat jullie doen en kunnen met één tik bellen, mailen of een afspraak maken. Zo levert je website meer telefoontjes en aanvragen op.\n\nHet ontwerp staat nog tot {verloopt} voor jullie klaar. Daarna verdwijnt het vanzelf.\n\nBevalt het? Dan staat jullie nieuwe website binnen 48 uur (2 werkdagen) live, voor €99,95 startkosten en daarna €69,95 per maand, maandelijks opzegbaar.\n\nLiever eerst even bellen? Plan zelf een moment in, dan bellen wij jou:\n{belafspraak}\n\nGroet,",
      },
    },
  },
};

function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], v) : v;
  return out;
}
// Vorige standaardteksten: staan die nog opgeslagen, dan krijgt Maxim vanzelf de nieuwe (eigen teksten blijven).
const OUDE_TEMPLATES = [
  { subject: "Vraagje over {bedrijf}", body: "Hoi,\n\n{intro}Ik kwam de website van {bedrijf} tegen en zag een paar kansen om er meer aanvragen uit te halen. Daarom heb ik een ontwerp gemaakt voor jullie nieuwe website, helemaal gericht op meer telefoontjes, mails en afspraken:\n{conceptlink}\n\nWie jullie nodig heeft, zoekt eerst op z'n telefoon. In een paar seconden valt de keuze: bellen, of door naar de volgende. Dit ontwerp laat direct zien wat jullie doen en waarom jullie, en de belknop is altijd binnen handbereik.\n\nAlles in één, zonder verrassingen:\n- €99,95 startkosten, eenmalig\n- daarna €69,95 per maand, maandelijks opzegbaar\n- hosting, onderhoud en 4 wijzigingen per maand inbegrepen\n- binnen 48 uur (2 werkdagen) live\n\nHet ontwerp is privé: niet openbaar, niet in Google, en het verdwijnt vanzelf op {verloopt}.\n\nVragen, of zin om even kort te bellen? Reageer gewoon op deze mail.\n\nGroet," },
  { subject: "Re: Vraagje over {bedrijf}", body: "Hi!\n\nEen korte herinnering: het ontwerpvoorstel voor de nieuwe website van {bedrijf} staat nog tot {verloopt} voor je klaar. Daarna verdwijnt het vanzelf.\n{conceptlink}\n\nHet is privé en alleen via deze persoonlijke link te zien.\n\nAlles inbegrepen: €99,95 startkosten en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, of verwijder het voorstel zelf met één klik. Dan hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hoi,\n\n{intro}Ik heb alvast de nieuwe website van {bedrijf} gemaakt. Kijk maar:\n{conceptlink}\n\nWie jullie nodig heeft, zoekt eerst op z'n telefoon. In een paar seconden valt de keuze: bellen, of door naar de volgende. Deze versie is gemaakt om die keuze voor jullie te laten uitvallen: duidelijk wat jullie doen, waarom jullie, en de belknop altijd binnen handbereik.\n\nHij staat alleen voor jullie klaar: niet openbaar, niet in Google, en hij verdwijnt vanzelf op {verloopt}.\n\nIs dit de richting die bij {bedrijf} past? Een kort ja of nee is genoeg.\n\nGroet," },
  { subject: "Re: Vraagje over {bedrijf}", body: "Hi!\n\nEen korte herinnering: het ontwerpvoorstel voor de nieuwe website van {bedrijf} staat nog tot {verloopt} voor je klaar. Daarna verdwijnt het vanzelf.\n{conceptlink}\n\nHet is privé en alleen via deze persoonlijke link te zien.\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, of verwijder het voorstel zelf met één klik. Dan hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nIk kwam jullie website tegen en zag meteen een paar kansen om er nog meer uit te halen. Je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik een ontwerpvoorstel gemaakt voor de nieuwe website van {bedrijf}, op basis van wat jullie nu online hebben:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit voorstel is privé, alleen voor jullie gemaakt. Het is niet openbaar, niet te vinden via Google en verdwijnt vanzelf op {verloopt}. Liever eerder weg? Dan verwijder je het met één klik. Je huidige website blijft gewoon zoals hij is.\n\nBevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 24 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nIk kwam jullie website tegen en zag meteen een paar kansen om er nog meer uit te halen. Je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik een ontwerpvoorstel gemaakt voor de nieuwe website van {bedrijf}, op basis van wat jullie nu online hebben:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit voorstel is privé, alleen voor jullie gemaakt. Het is niet openbaar, niet te vinden via Google en verdwijnt vanzelf op {verloopt}. Liever eerder weg? Dan verwijder je het met één klik. Je huidige website blijft gewoon zoals hij is.\n\nBevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nIk kwam jullie website tegen en zag meteen een paar kansen om er nog meer uit te halen. Je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik een ontwerpvoorstel gemaakt voor de nieuwe website van {bedrijf}, op basis van wat jullie nu online hebben:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit voorstel is privé, alleen voor jullie gemaakt. Het is niet openbaar, niet te vinden via Google en verdwijnt vanzelf op {verloopt}, inclusief jullie teksten en foto's. Liever eerder weg? Dan verwijder je het met één klik. Je huidige website blijft gewoon zoals hij is.\n\nBevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Re: Vraagje over {bedrijf}", body: "Hi!\n\nEen korte herinnering: het ontwerpvoorstel voor de nieuwe website van {bedrijf} staat nog tot {verloopt} voor je klaar. Daarna verdwijnt het vanzelf, inclusief jullie teksten en foto's.\n{conceptlink}\n\nHet is privé en alleen via deze persoonlijke link te zien.\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, of verwijder het voorstel zelf met één klik. Dan hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nIk kwam jullie website tegen en zag meteen een paar kansen om er nog meer uit te halen. Je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit is een voorbeeldlink die alleen jij kunt zien. Dit heeft geen invloed op je huidige website. Je kunt het rustig bekijken tot {verloopt}. Bevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Re: Vraagje over {bedrijf}", body: "Hi!\n\nEen korte herinnering: de nieuwe website die we voor {bedrijf} hebben gemaakt, staat nog tot {verloopt} voor je klaar. Daarna vervalt het voorbeeld.\n{conceptlink}\n\nDit is een voorbeeldlink die alleen jij kunt zien. Dit heeft geen invloed op je huidige website.\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, dan haal ik hem offline en hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nJullie website trok mijn aandacht en ik zag meteen een paar dingen die beter kunnen. Zonde, want je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit is een voorbeeldlink die alleen jij kunt zien. Dit heeft geen invloed op je huidige website. Je kunt het rustig bekijken tot {verloopt}. Bevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nJullie website trok mijn aandacht en ik zag meteen een paar dingen die beter kunnen. Zonde, want je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nGoed om te weten: dit is alleen een voorbeeld. Het staat niet online en is niet te vinden via Google; je ziet het alleen via jouw persoonlijke link hierboven. Je huidige website blijft gewoon zoals hij is.\n\nJe kunt het rustig bekijken tot {verloopt}. Bevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nEen korte herinnering: de nieuwe website die we voor {bedrijf} hebben gemaakt, staat nog tot {verloopt} voor je klaar. Daarna vervalt het voorbeeld.\n{conceptlink}\n\nHet is alleen een voorbeeld: het staat niet online en alleen jij ziet het via deze persoonlijke link.\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, dan haal ik hem offline en hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nJullie website trok mijn aandacht en ik zag meteen een paar dingen die beter kunnen. Zonde, want je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren.\n\nDit is alleen een voorbeeld en staat nog niet live. Je kunt het rustig bekijken tot {verloopt}. Bevalt de richting je? Dan maken we de website samen af, met jouw wensen en input.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nEen korte herinnering: de nieuwe website die we voor {bedrijf} hebben gemaakt, staat nog tot {verloopt} voor je klaar. Daarna vervalt het voorbeeld.\n{conceptlink}\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, dan haal ik hem offline en hoor je niets meer van ons.\n\nMet vriendelijke groet," },
  { body: "Hi!\n\nJullie website trok mijn aandacht en ik zag meteen een paar dingen die beter kunnen. Zonde, want je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat iemand belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren. Dit is een voorbeeld en staat nog niet live; je kunt hem {dagen} dagen bekijken, tot {verloopt}. Vind je hem mooi? Dan maken we hem samen af, helemaal met jouw input en wensen.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nJullie website trok mijn aandacht, en ik zag meteen een paar dingen die beter kunnen. En je website is je visitekaartje: vaak het eerste wat een nieuwe klant van je ziet, nog voordat hij belt of langskomt.\n\nDaarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren. Dit is een voorbeeld en staat nog niet live; je kunt hem {dagen} dagen bekijken, tot {verloopt}. Vind je hem mooi? Dan maken we hem samen af, helemaal met jouw input en wensen.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\nJullie website trok mijn aandacht, en ik zag meteen een paar dingen die beter kunnen. Daarom heb ik alvast een opzet gemaakt van hoe de nieuwe website van {bedrijf} eruit kan zien:\n{conceptlink}\n\nGemaakt om meer mails, belletjes en klanten op te leveren. Dit is een voorbeeld en staat nog niet live; je kunt hem {dagen} dagen bekijken, tot {verloopt}. Vind je hem mooi? Dan maken we hem samen af, helemaal met jouw input en wensen.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hi!\n\n{intro}We hebben de website van {bedrijf} eens goed bekeken. Er valt volgens ons nog veel meer uit te halen: meer bezoekers die bellen, mailen of een afspraak maken. Daarom hebben we alvast een opzet gemaakt:\n{conceptlink}\n\nDit is een voorbeeld en staat nog niet live; je kunt hem {dagen} dagen bekijken, tot {verloopt}. Vind je hem mooi? Dan maken we hem samen af, helemaal met jouw input en wensen.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet," },
  { subject: "Vraagje over {bedrijf}", body: "Hallo,\n\n{intro}We hebben de website van {bedrijf} eens goed bekeken. Er valt volgens ons nog veel meer uit te halen: meer bezoekers die bellen, mailen of een afspraak maken. Daarom hebben we alvast een opzet gemaakt:\n{conceptlink}\n\nDit is een voorbeeld en staat nog niet live; je kunt hem {dagen} dagen bekijken, tot {verloopt}. Vind je hem mooi? Dan maken we hem samen af, helemaal met jouw input en wensen.\n\nAlles inbegrepen, zonder verrassingen:\n- €299,95 eenmalig: je complete website, binnen 48 uur (2 werkdagen) live\n- €69,95 per maand: hosting, onderhoud en 4 wijzigingen per maand. Nieuwe openingstijden, teksten, foto's of een extra dienst: je geeft het door in je portaal en wij regelen het binnen 48 uur.\n\nMaandelijks opzegbaar, geen langlopend contract. En niet tevreden? De eerste 30 dagen na livegang krijg je 100% van je geld terug.\n\nZin om er even kort over te bellen? Reageer gerust op deze mail.\n\nMet vriendelijke groet,\n{afzender}" },
  { subject: "Re: Vraagje over {bedrijf}", body: "Hallo,\n\nEen korte herinnering: de nieuwe website die we voor {bedrijf} hebben gemaakt, staat nog tot {verloopt} voor je klaar. Daarna vervalt het voorbeeld.\n{conceptlink}\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en 4 wijzigingen per maand, maandelijks opzegbaar. En niet tevreden? De eerste 30 dagen na livegang krijg je je geld terug.\n\nNiet interessant? Laat het even weten, dan haal ik hem offline en hoor je niets meer van ons.\n\nMet vriendelijke groet,\n{afzender}" },
  { subject: "Een website die aanvragen oplevert voor {bedrijf}", body: "Goedendag,\n\n{intro}{concept}Ik ben {afzender} van Sitemaker. Wij bouwen professionele websites voor bedrijven, gericht op één ding: bezoekers omzetten in klanten.\n\nWat u krijgt:\n- Een professionele website, binnen 48 uur (2 werkdagen) online nadat u uw informatie hebt aangeleverd\n- Hosting inbegrepen\n- Elke maand vier wijzigingen, die we binnen 48 uur verwerken via uw eigen klantenportaal\n\nDe prijs is vast: €299,95 eenmalig en daarna €69,95 per maand. Geen onverwachte kosten.\n\nZullen we een korte kennismaking plannen? U kunt direct een moment kiezen via {link}, of gewoon op deze mail reageren.\n\nMet vriendelijke groet,\n{afzender}\nSitemaker" },
  { subject: "Re: Een website die aanvragen oplevert voor {bedrijf}", body: "Goedendag,\n\nIk stuurde u onlangs een bericht over een nieuwe website voor {bedrijf}. Misschien is het toen ondergesneeuwd.\n\nKort samengevat: een professionele website binnen 48 uur (2 werkdagen) online, hosting en vier wijzigingen per maand inbegrepen, voor €299,95 eenmalig en €69,95 per maand.\n\nAls het nu niet past, hoor ik dat ook graag; dan stuur ik u niets meer.\n\nMet vriendelijke groet,\n{afzender}\nSitemaker" },
];
export async function getSettings() {
  const rows = await q("SELECT key, value FROM settings");
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = merge(DEFAULT_SETTINGS, stored);
  const tpl = out.b2b?.templates || {};
  for (const k of ["eerste", "opvolging"]) {
    const t = tpl[k];
    if (t && OUDE_TEMPLATES.some((o) => o.body === t.body)) tpl[k] = { ...DEFAULT_SETTINGS.b2b.templates[k] };
  }
  return out;
}
export async function saveSetting(key, value) {
  await q(`INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, JSON.stringify(value)]);
}

// ---------------------------------------------------------------- tijd en geld
export const TZ = "Europe/Amsterdam";
export const monthKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
export const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
export const hourAms = (d = new Date()) => Number(d.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
export const euro = (c) => (Number(c) < 0 ? "-€" : "€") + (Math.abs(Number(c || 0)) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const centsToMollie = (c) => (Number(c) / 100).toFixed(2);
export function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0); // 31 jan + 1 maand = 28/29 feb
  return d.toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- tekst
export const EMAIL_RE = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/i;
export const cleanEmail = (e) => String(e || "").trim().toLowerCase();
export const str = (v, max = 500) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);
export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function domainOf(u) {
  try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
export function normUrl(u) {
  const s = str(u, 300);
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : "https://" + s;
  try { const x = new URL(withProto); return x.protocol === "http:" || x.protocol === "https:" ? x.href.replace(/\/$/, "") : ""; } catch { return ""; }
}

// ---------------------------------------------------------------- HTTP
export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export function siteUrl(req) {
  const fromEnv = env("SITE_URL") || env("URL");
  if (fromEnv && !req) return fromEnv.replace(/\/$/, "");
  if (req) { const u = new URL(req.url); return `${u.protocol}//${u.host}`; }
  return "https://sitemaker.nl";
}
// Publieke basis-URL voor links in mails en webhooks: altijd de productie-URL als die bekend is.
// Klantenportaal en HQ kunnen op een eigen subdomein staan (PORTAL_URL=https://mijn.sitemaker.nl, HQ_URL=https://hq.sitemaker.nl).
// Zonder die instellingen: <website>/portaal/ en <website>/hq/.
export const portalUrl = () => (env("PORTAL_URL") ? env("PORTAL_URL").replace(/\/+$/, "") : publicBase() + "/portaal") + "/";
export const hqUrl = () => (env("HQ_URL") ? env("HQ_URL").replace(/\/+$/, "") : publicBase() + "/hq") + "/";

export function publicBase(req) {
  const fixed = env("PUBLIC_BASE_URL") || (env("CONTEXT") === "production" ? env("URL") : "");
  return (fixed || siteUrl(req)).replace(/\/$/, "");
}

export async function audit(userId, customerId, action, detail = {}) {
  await q("INSERT INTO audit_log (user_id, customer_id, action, detail) VALUES ($1, $2, $3, $4::jsonb)",
    [userId || null, customerId || null, action, JSON.stringify(detail)]).catch(() => {});
}
