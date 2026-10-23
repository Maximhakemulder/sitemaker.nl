# Sitemaker.nl

Website, klantenportaal en Sitemaker HQ in één Netlify-project. Ze delen één database, dus alles is aan elkaar gekoppeld:

| Adres | Wat | Voor wie |
|---|---|---|
| `/` | De website met het formulier "Plan een kennismaking" | Nieuwe klanten |
| `/portaal/` | Klantenportaal: wijzigingen doorgeven (4 per maand), status volgen, facturen | Klanten |
| `/hq/` | Sitemaker HQ: klanten, wijzigingen, facturen, betalingen, sites, aanvragen, B2B-mail | Sitemaker |

Zo hangt het samen:
- Een aanvraag op de website komt direct in **HQ › Aanvragen** (plus een mail aan jou en een bevestiging aan de aanvrager). Met één klik maak je er een klant van.
- Een klant die je in HQ aanmaakt, kan meteen inloggen op het portaal (welkomstmail met link).
- Wat de klant in het portaal indient, staat in **HQ › Wijzigingen** met de 48-uurs-deadline; zet je hem op Verwerkt, dan krijgt de klant een mail en ziet hij de status in het portaal.
- Facturen (handmatig of automatisch via Mollie) staan direct in het portaal van de klant.
- Reageert een B2B-lead via het websiteformulier, dan springt de lead in HQ op "Afspraak".
- De btw-keuze in HQ bepaalt wat er op de website, in het portaal en op facturen staat.

Inloggen gaat overal zonder wachtwoord: e-mailadres invullen, code van 6 cijfers uit de mail.

## Instellingen in Netlify (Environment variables)

| Naam | Nodig | Waarvoor |
|---|---|---|
| `ADMIN_EMAILS` | ja | Komma-gescheiden e-mailadressen die beheerder zijn in HQ (bijv. `maxim@gosmart.eu`) |
| `AUTH_SECRET` | ja | Lange willekeurige tekst; beveiligt inlogcodes en afmeldlinks |
| `MAIL_USER`, `MAIL_PASSWORD` | ja | Mailbox voor inlogcodes, meldingen en B2B (standaard Hostnet: smtp.hostnet.nl:587, imap.hostnet.nl:993) |
| `MAIL_FROM` | nee | Afzenderadres als dat anders is dan `MAIL_USER` |
| `SMTP_HOST`, `SMTP_PORT`, `IMAP_HOST`, `IMAP_PORT` | nee | Alleen als je niet bij Hostnet zit |
| `MOLLIE_API_KEY` | voor automatische betalingen | Begin met een `test_`-sleutel, daarna `live_` |
| `PUBLIC_BASE_URL` | aanbevolen | `https://sitemaker.nl`; gebruikt in mails en als Mollie-webhook |
| `OUTSCRAPER_API_KEY` | nee | B2B-scout (Google Maps) |
| Netlify AI Gateway | nee | AI-openingszinnen voor B2B-mails (zet `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` automatisch) |

De database (Netlify Database / Postgres) wordt automatisch aangemaakt bij de eerste deploy; het schema staat in `netlify/database/migrations/`. PDF's en bijlagen staan in Netlify Blobs (store `sitemaker-files`, privé).

## Eerste keer live zetten
1. Koppel deze repo aan het Netlify-project (build command leeg, publish directory `public`).
2. Zet de variabelen hierboven (minimaal `ADMIN_EMAILS`, `AUTH_SECRET`, `MAIL_USER`, `MAIL_PASSWORD`, `PUBLIC_BASE_URL`).
3. Log in op `/hq/` met een adres uit `ADMIN_EMAILS`.
4. Vul bij **Instellingen** je bedrijfsgegevens in en kies of de prijzen incl. of excl. btw zijn.
5. Zet `MOLLIE_API_KEY` (test) en probeer bij een testklant "Automatisch incasseren".

## Mappen
- `public/` — website (`index.html`), portaal (`portaal/`), HQ (`hq/`), stijlen, scripts, logo's en zelf gehoste lettertypen
- `netlify/functions/api.mjs` — de API voor alle drie (pad `/api/*`)
- `netlify/functions/tick.mjs` — elke 5 minuten: B2B-mail versturen, inbox lezen, scout/research, online-check van klantsites
- `netlify/lib/` — `core` (database, aanbod, instellingen), `auth` (inlogcodes, sessies), `portal`, `admin` (HQ), `billing` (facturen en PDF), `mollie`, `b2b`, `uptime`, `site` (websiteformulier), `mail`, `files`
- `netlify/database/migrations/` — databaseschema
- `test/run.mjs` — integratietest van de hele keten

## Lokaal
```
npm install
npm test          # 27 tests tegen een lokale Postgres, zonder echte mails of betalingen
npm run check     # prijzen en termijnen overal gelijk?
npm run dev       # http://localhost:8888, beheerder admin@sitemaker.test; inlogcodes verschijnen in de terminal
```

## Werkwijze
Wijzigingen komen binnen als pull request; Netlify maakt daar een gratis deploy preview van. Na mergen naar `main` gaat het live.
Let op: een deploy preview gebruikt een eigen databasetak met een kopie van de productiegegevens, maar Blobs (PDF's/bijlagen) zijn gedeeld met productie.
