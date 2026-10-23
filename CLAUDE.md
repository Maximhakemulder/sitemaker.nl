# Sitemaker.nl — notities voor Claude

Eigenaar: Maxim. Communiceer in het Nederlands, kort en concreet.

## Het aanbod (één bron: `OFFER` in `netlify/lib/core.mjs`)
€299,95 eenmalig + €69,95 per maand · hosting inbegrepen · 4 wijzigingen per maand via het portaal · wijzigingen binnen 48 uur · nieuwe site binnen 48 uur (2 werkdagen) · geen webshops. Hoofdzin: "Maak van je website je beste verkoper." `npm run check` bewaakt dat bedragen en termijnen overal gelijk zijn. Verzin nooit reviews, klantaantallen, resultaten, keurmerken of integraties.

## Architectuur
- Eén Netlify-project: statische `public/` (website, `/portaal/`, `/hq/`) + Functions v2 (`api` op `/api/*`, `tick` elke 5 min). Zelfde opzet als TrueSafe HQ en Gosmart HQ, maar met **Netlify Database (Postgres)** voor klanten, facturen, betalingen, wijzigingen en leads; **Netlify Blobs** (store `sitemaker-files`) alleen voor PDF's en bijlagen. Maak nooit een module-level cache van `getStore()`.
- Schema: `netlify/database/migrations/` — nooit een toegepaste migratie wijzigen; altijd een nieuwe met tijdstempel.
- Inloggen: code van 6 cijfers per mail (gehasht met `AUTH_SECRET`), sessiecookie `sm_sess` (HttpOnly, Secure, SameSite=Lax). Rollen: `klant` (alleen eigen `customer_id`), `medewerker`, `admin` (ook instellingen, team, abonnement opzeggen). `ADMIN_EMAILS` maakt beheerders aan bij de eerste login.
- Elke POST/PUT moet header `x-sm: 1` hebben (CSRF); uitzonderingen: Mollie-webhook en de afmeldlink.
- Grens van 4 wijzigingen: advisory lock per klant + unieke `slot` (1–4) per klant per maand in de database. Lokale PGlite draait alles in één sessie, dus gelijktijdigheid is lokaal niet echt te testen.
- Mollie: eerste betaling `sequenceType: first` (bouwprijs + machtiging) → webhook maakt abonnement (`1 month`). Elke betaalde betaling wordt een factuur (PDF via pdf-lib) en een mail. De webhook haalt de betaling altijd zelf op bij Mollie.
- B2B (zoals TrueSafe): leads → research (algemeen adres op eigen site, MX-check, optioneel AI-openingszin) → goedkeuren in HQ → `tick` verstuurt binnen verzendtijden en daglimiet → opvolging na X dagen alleen na goedkeuring → IMAP-scan voor reacties/bounces → one-click afmelden (`suppressions`). Bedrijfsnaam + KvK verplicht onder elke mail.
- Strikte CSP op `/portaal/*` en `/hq/*`: geen inline scripts of `style=`-attributen in gegenereerde HTML. Gebruik `SM.html` (escapet alles) in `public/assets/js/ui.js`.
- Huisstijl: paars #1C0747, koraal #FF5757 (alleen acties, met paarse tekst), cyaan #0CC0DF (alleen op paars), ijs #E7F4FF. Lettertype Archivo, zelf gehost in `public/assets/fonts/` (geen Google Fonts i.v.m. AVG). Logo's in `public/assets/brand/`.

## Werkwijze en kosten
- Werk via een branch + pull request (deploy preview is gratis); Maxim merget.
- Commits op naam van Maximhakemulder (267295406+Maximhakemulder@users.noreply.github.com).
- Lokaal: `npm test` (lokale Postgres via @netlify/database-dev, mail in het geheugen, nep-Mollie). Nooit echte mails of betalingen vanuit tests.
- Deploy previews delen Blobs met productie: test daar niet met uploads van echte klanten.
