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

## Klantsites en automatische wijzigingen
- Elke klantsite = eigen privé GitHub-repo (`GITHUB_ORG/site-<naam>`) + eigen Netlify-project, gemaakt vanuit `templates/klantsite` (alle tekst in `content.json`, `build.mjs` zonder dependencies, thema's elegant/stoer/natuur/zacht). HQ › klant › "Website aanmaken".
- Wijziging ingediend → `queueChange` → `verwerk-background` (15 min) → Claude past alleen `content.json` aan op branch `wijziging-<id>` → pull request → Netlify deploy preview (`deploy-preview-<pr>--<site>.netlify.app`). Kan/mag het niet (webshop, onbekende afbeelding, geen verschil) → `ai_status = handmatig`.
- Maxim keurt goed in HQ › Wijzigingen → merge naar main → live, status Verwerkt, mail naar klant. Max 5 voorstellen per wijziging. `tick` pakt vastgelopen voorstellen opnieuw op.
- Sleutels: `GITHUB_TOKEN` (fine-grained: Administration + Contents + Pull requests, read/write op de organisatie), `GITHUB_ORG`, `NETLIFY_API_TOKEN`, `NETLIFY_ACCOUNT_SLUG`, `NETLIFY_GITHUB_INSTALLATION_ID` (optioneel; anders repo met de hand koppelen in Netlify), `ANTHROPIC_API_KEY` (of AI Gateway), optioneel `AI_MODEL`.
- Tests gebruiken `GITHUB_FAKE`, `NETLIFY_FAKE`, `AI_FAKE` + `globalThis.__aiFake` en `SM_INLINE_AI=1`.

## Start in het portaal (nieuwe klanten)
- HQ › Nieuwe klant met vinkje "Klant start zelf in het portaal" (`customers.onboarding`). Alleen bedrijfsnaam + e-mail nodig; welkomstmail noemt de 3 stappen.
- Portaal (`netlify/lib/start.mjs`, `startStage`): gegevens (KvK 8 cijfers, adres, telefoon) → akkoord voorwaarden + incasso (`terms_at/ip/by`) en eerste Mollie-betaling → webhook zet `started_at` (`markStarted`, mail aan klant) → informatie aanleveren (`intake` JSONB + `intake_files`, max 20 bestanden van 4 MB, concept opslaan kan) → `intake_at`: klok van 2 werkdagen (`deliveryDue`).
- HQ: paneel "Nieuwe klanten" op Overzicht, badge op Klanten (= betaald en nog in aanbouw), paneel "Start in het portaal" bij de klant met antwoorden en downloads.
- Lokaal: `scripts/dev.mjs` heeft een nep-betaalpagina (`/__dev/betaal`) die de nep-Mollie-betaling op betaald zet.

## Subdomeinen
- Eén Netlify-project. `mijn.sitemaker.nl` = klantenportaal, `hq.sitemaker.nl` = HQ, via host-regels bovenaan `netlify.toml` (200-rewrite van `/` naar `/portaal/` resp. `/hq/`; oude paden op sitemaker.nl 301 naar het subdomein). Alle assets/API werken op elk host.
- Links in mails en Mollie-redirects via `portalUrl()` / `hqUrl()` in core (env `PORTAL_URL`, `HQ_URL`; zonder env: `<site>/portaal/` en `<site>/hq/`). Sessies zijn per subdomein (host-only cookies).

## Agenda (kennismaking boeken, zoals Calendly)
- `netlify/lib/agenda.mjs`. Vaste weektijden + duur/interval/minUren/dagenVooruit/maxPerDag/soort in `settings.agenda` (HQ › Agenda › Vaste tijden). Uitzonderingen in `agenda_exceptions` ('dicht', 'open' wint van dicht). Alles in Europe/Amsterdam (`amsToUtc`), DB in UTC.
- Website: `#boeken` in `public/index.html` + `site.js` (GET `/api/agenda/slots`, POST `/api/agenda/boek`). Valt terug op het terugbelformulier als boeken uit staat of er geen momenten zijn. Dubbel boeken voorkomt de unieke index op `appointments.starts_at`.
- Mail met .ics-bijlage + annuleerlink (`/api/agenda/annuleren?t=`), herinnering ~3 uur vooraf via `tick`. HQ annuleren mailt de klant. Agenda-abonnement voor Maxim: `/api/agenda/feed.ics?k=<HMAC van AUTH_SECRET>`.
- HQ › Agenda (route `#aanvragen`): Afspraken | Beschikbaarheid (slots klikken open/dicht, vrij nemen, extra tijd) | Vaste tijden.

## Concept-websites voor leads (USP)
- `netlify/lib/concepts.mjs` + `netlify/functions/concept-background.mjs`. Tabel `concepts` (1 per lead, `token`, status wachtrij|bezig|klaar|fout|overgeslagen, `content` = content.json, `images` in Blobs `concepts/<id>/…`, `analysis` = feiten over hun site).
- Agent: `scan()` haalt home + max. 3 subpagina's, foto's (≥ 500 px, logo apart), huisstijlkleuren. Claude (`SYSTEM`) maakt content.json; `clean()` houdt het eerlijk: telefoon/e-mail/WhatsApp/adres/prijzen/openingstijden alleen als ze in de brontekst staan, foto's alleen uit de lijst. Webshops en te weinig tekst → overgeslagen.
- Pagina: `/voorbeeld/<token>` (direct afgehandeld door de api-functie: `config.path` bevat `/voorbeeld/*`; een 200-rewrite naar de functie werkte niet), gerenderd met `templates/klantsite/render.mjs` (dezelfde renderer als de echte klantsites), noindex, balk + slot-CTA naar `/?concept=<token>&bedrijf=…#kennismaking`. Bekeken telt via script na 2,5 s (`?hq=1` telt niet); eerste keer → mail aan Maxim. Verloopt na `b2b.concepten.geldigDagen`. Afmelden = concept weg.
- `tick` (`runConcepts`): leads met website (nieuw/goedgekeurd) automatisch in de wachtrij, max `perDag`. **Elke eerste mail gaat alleen met een klare voorbeeldwebsite** (besluit Maxim): `sendBatch` wacht erop; concept fout → lead terug naar nieuw, overgeslagen → lead overgeslagen; zonder website kan goedkeuren niet. `compose` zet de conceptlink na de aanhef als de tekst hem niet bevat. Mailtekst: `{concept}` / `{conceptlink}` (oudere teksten krijgen de conceptregel na `{intro}`).
- Ontwerp (`templates/klantsite/render.mjs`): elke site anders via `content.ontwerp` {fonts (9 paren via Bunny Fonts), hero split|volbeeld|kader|typo, diensten kaarten|rijen|lijst, vorm rond|zacht|strak, sfeer licht|donker|merk}; Claude kiest bij hun merk, anders vast per bedrijfsnaam (hash). Merkkleuren uit hun site, knoppen/banden altijd ≥4,5:1 contrast. Vaste actiebalk op mobiel, "nu open tot" uit openingstijden, prijslijst bij prijzen. Lokaal bekijken: render met eigen fixture (fonts via @fontsource).
- **Ontwerp-agent** (`netlify/lib/ontwerp.mjs`, kolom `concepts.html`): na de content ontwerpt Claude per bedrijf een volledig eigen HTML+CSS-pagina (geen JS, alleen Bunny Fonts, alleen eigen `afbeeldingen/`). `sanitize` haalt scripts/externe bronnen weg, `feitencheck` keurt verzonnen telefoon/mail/prijzen/jaartallen/claims af → dan vangnet `render.mjs` (`ontwerp_fout` in HQ). Getoond met strikte CSP + nonce voor ons eigen script (balk, "vandaag", logo-contrast). Model: `AI_MODEL_ONTWERP` (anders `AI_MODEL`). Nog niet: dit ontwerp meenemen naar de echte klantsite (die gebruikt content.json + render.mjs).
- Logo: kandidaten in kop/home-link/"logo" krijgen een score; stroken (> 5,5:1) en keurmerken vallen af; SVG mag (geserveerd met sandbox-CSP). Te weinig eigen foto's (< 4) → sfeerbeelden via Pexels of Pixabay (`PEXELS_API_KEY` of `PIXABAY_API_KEY`, zoekterm van Claude of de branche), `content.sfeerbeelden = true` en dat staat onder het concept.
- Afspraak via het concept koppelt de lead (`linkConcept`); "Website aanmaken" start vanuit het concept (`conceptForCustomer`, ook via afspraak → lead).
- HQ: B2B (kolom Concept, filter "Concept bekeken", bulk "Concept maken", paneel in lead), pagina Concepten (galerij, standaard "Te beoordelen"), KPI op Overzicht, instellingen bij B2B. Maxim bekijkt elk concept en klikt "Akkoord, verstuur mail" (toont de mail, dan lead → goedgekeurd). Geen stijlkeuze in HQ: Claude neemt sfeer en huisstijlkleuren van hun huidige site over.

## Bedrijf (afdelingen, medewerkers, briefings)
- HQ opent op **Bedrijf** (`#bedrijf`): 3D-gebouw (`public/hq/building.js`, gebaseerd op TrueSafe HQ; three.js r128 zelf gehost in `public/assets/js/three.min.js` i.v.m. CSP), afdelingen en medewerkers in `public/hq/org.js` (`SM_ORG`). Afdelingspagina `#afdeling/<key>`: verdieping in 3D, cijfers, team met live status, briefing, vraag aan de manager, logboek.
- `netlify/lib/team.mjs`: alles uit echte gegevens (`teamState`: cijfers + wat elke medewerker deed, logboek uit audit_log/mail_log/concepts/appointments/payments, "wacht op jou"). `tick` schrijft een hartslag per ronde (`settings.team_pulse`) → "nu bezig". Incidenten (offline/online) staan in audit_log.
- Briefings: elke dag na 8:00 via `team-background` (managers → directeur Victor), tabel `team_briefings`; zonder Claude een feitelijke samenvatting. Vragen aan managers: `team_questions`, beantwoord in `team-background`, HQ pollt.
- `team_reports` is klaar voor rapporten van geplande Claude-taken (marketing: Meta via Windsor, statics via Kive/Canva) — fase 2.

## Juridisch, domeinen, klantenservice, opzeggen en kosten
- `public/voorwaarden.html` + `public/privacy.html` (bedrijfsgegevens via `[data-bedrijf]` uit `/api/bedrijf`, `public/assets/js/juridisch.js`). Cookiebanner verschijnt alleen als `settings.tracking.metaPixelId` gevuld is; de pixel laadt pas na "Akkoord" (`localStorage sm_cookies`).
- Domeinen (afdeling Dirk, `netlify/lib/domains.mjs`, tabel `domains`): Sitemaker registreert/beheert GEEN domeinen (besluit Maxim). Klant koopt het zelf en vult het in portaal › Account in; HQ zet het als custom domain op zijn Netlify-project, toont A @ 75.2.60.5 + CNAME www → `<site>.netlify.app`, controleert DNS in `tick`, vraagt SSL aan (`zorgSsl`: POST /sites/{id}/ssl) en zet pas op actief als https echt werkt; klant krijgt dan een mail. HQ › Domeinen. Test: `DOMAIN_FAKE` ("fout" = DNS fout, "geenssl" = https nog niet).
- Klantvragen (Emma, `netlify/lib/service.mjs`, tabellen `tickets`/`ticket_messages`): uit het portaal en uit de inbox (`scanInbox` → `ticketFromMail`, alleen bekende klantadressen, dedupe op Message-ID). Claude zet een antwoord klaar via `team-background` (job `ticket`); Maxim verstuurt in HQ › Klantvragen (mail met In-Reply-To).
- Review: één keer per klant in portaal › Account, alleen als de site live is, met toestemming; komt verborgen binnen (`source = 'portaal'`), Maxim publiceert in HQ › Reviews.
- Opzeggen: portaal › Account › opzeggen in 3 stappen (reden → behoud/"bel me" → gevolgen + bedrijfsnaam typen). Einde = laatste dag van de volgende maand (voorwaarden art. 8). Intrekken kan tot de einddatum (klant en HQ). `tick` (`runCancellations`) stopt dan Mollie en zet de site op opgezegd; Maxim krijgt een mail met wat er nog moet.
- Kosten en winst (Bram, `netlify/lib/kosten.mjs`, tabel `costs`): Maxim vult kosten in (excl. btw; maandelijks/jaarlijks/eenmalig), 12 maanden omzet vs kosten, CSV-export per kwartaal (`/api/hq/kosten/export`).
- HQ-medewerkers beheren: `/api/hq/medewerkers` (`/api/hq/team` is het bedrijf/afdelingen).
- Meerdere websites per klant (`netlify/lib/websites.mjs`, tabel `user_sites`, `sessions.customer_id`, `customers.site_naam`): elke website = eigen klantregel (eigen abonnement, 4 wijzigingen, facturen, domein). Eén inlog; wisselen in het portaal (select in de kop, POST `/api/portal/website`), extra website aanvragen in Account (start bij "akkoord en betalen"). HQ: paneel "Websites van deze klant" + knop Extra website; klantenlijst toont het aantal.
- B2B › Overzicht (`netlify/lib/b2bstats.mjs`, GET `/api/hq/b2b`): zoekplan (branches × plaatsen, volgende zoekopdracht, geschiedenis in `scout_state.history`), vandaag (verstuurd/daglimiet, wachtrij, verzendvenster), funnel, per branche/plaats, 14 dagen. Leads op `#b2b/leads`.
- Teambalk: elke werkpagina toont bovenaan het team van de afdeling met live status en de 3D-verdieping (`zetBalk`, `PAGINA_AFD` in `public/hq/app.js`; in/uitklappen onthouden in localStorage `sm_balk`).
- Mailprestaties B2B (`mailPrestaties` in `netlify/lib/b2bstats.mjs`, tabel `mail_events`, `leads.bounced_at/klacht_at`): verstuurd, afgeleverd, bounce, geopend (pixel `/api/t/o`, indicatie), geklikt (ondertekende links `/api/t/k` + concept bekeken), reacties, afmeldingen, klachten; per periode en met waarschuwingen. Opens/klikken binnen 60 s of van scanners tellen niet. Aan/uit: `settings.b2b.meten`. Standaard daglimiet 15 (opbouwen).
