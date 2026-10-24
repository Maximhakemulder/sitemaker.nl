// Sitemaker klantenportaal: overzicht, wijzigingen doorgeven en facturen.
(() => {
  const { html, raw, render, api, euro, datum, datumLang, tijd, maand, toast, icon } = SM;
  const app = document.getElementById("app");
  let state = null;
  window.SM_PORTAAL_WISSEL = null;

  const WIJZIGING = { ontvangen: ["Ontvangen", "s-info"], in_behandeling: ["In behandeling", "s-let"], verwerkt: ["Verwerkt", "s-ok"], afgewezen: ["Niet uitgevoerd", "s-grijs"] };
  const FACTUUR = { open: ["Openstaand", "s-let"], betaald: ["Betaald", "s-ok"], vervallen: ["Vervallen", "s-fout"], gecrediteerd: ["Gecrediteerd", "s-grijs"] };
  const SITE = { in_aanbouw: ["In aanbouw", "s-info"], live: ["Online", "s-ok"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"] };
  const ABO = { actief: ["Actief", "s-ok"], handmatig: ["Actief", "s-ok"], wacht_op_betaling: ["Wacht op eerste betaling", "s-let"], betaling_mislukt: ["Betaling niet gelukt", "s-fout"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"], geen: ["Nog niet gestart", "s-grijs"] };
  const label = (map, k) => { const [t, c] = map[k] || [k, "s-grijs"]; return html`<span class="status ${c}">${t}</span>`; };

  SM.onLoggedOut = () => start();

  async function start() {
    try { const me = await api("auth/me?portal=1"); if (me.user && me.user.role === "klant") return laad(); } catch {}
    try {
      const o = await api("auth/options");
      if (o.open) return kiesKlant();
    } catch {}
    const r = await SM.inloggen(app, { portal: "portaal", kop: "Inloggen op je klantenportaal", titel: "Je website, je wijzigingen en je facturen op één plek.", tekst: "Geef wijzigingen door, volg de status en vind je facturen terug." });
    if (r.role !== "klant") { location.href = location.hostname.startsWith("mijn.") ? "https://hq." + location.hostname.slice(5) + "/" : "/hq/"; return; }
    laad();
  }

  // Open modus (zolang de mail niet is ingesteld): kies welke klant je wilt bekijken.
  async function kiesKlant() {
    const { klanten } = await api("auth/open-klanten");
    render(app, html`<div class="inlog"><div class="inlog-merk"><img class="logo" src="/assets/brand/logo-wit.png" alt="Sitemaker"><div><h1>Klantenportaal</h1><p>Open modus: zolang de mail niet is ingesteld kun je hier zonder inloggen elk klantportaal bekijken.</p></div><img class="blok" src="/assets/brand/mark.png" alt=""></div>
      <div class="inlog-vak"><div class="kies-klant">
        <h2>Welke klant wil je bekijken?</h2>
        ${klanten.length ? html`<ul class="lijst">${klanten.map((k) => html`<li><button class="knop knop-licht" data-klant="${k.id}">${k.company}</button></li>`)}</ul>`
          : html`<p class="dempen">Er zijn nog geen klanten. Maak er een aan in HQ, dan verschijnt hij hier.</p><a class="knop knop-actie" href="/hq/#klanten">Naar HQ</a>`}
      </div></div></div>`);
    app.querySelectorAll("[data-klant]").forEach((b) => b.addEventListener("click", async () => {
      SM.bezig(b, true, "Openen…");
      try { await api("auth/open-als", { method: "POST", body: { customerId: Number(b.dataset.klant) } }); laad(); } catch (e) { SM.toast(e.message, "fout"); SM.bezig(b, false); }
    }));
  }

  async function laad() {
    try { state = await api("portal/state"); }
    catch (e) { render(app, html`<div class="p-main"><div class="melding melding-fout">${e.message}</div><button class="knop" id="opnieuw">Opnieuw proberen</button></div>`); app.querySelector("#opnieuw").onclick = laad; return; }
    kader();
    route();
  }

  const inStart = () => !!state.start && ["gegevens", "betalen", "informatie"].includes(state.start.stage);
  function kader() {
    const c = state.customer;
    render(app, html`
      <header class="p-kop"><div class="binnen">
        <a href="#overzicht" aria-label="Sitemaker klantenportaal"><img src="/assets/brand/logo-compact-wit.png" alt="Sitemaker"></a>
        <div class="wie">${state.websites?.length > 1 ? html`<label class="sr" for="site-kies">Website</label><select id="site-kies" class="site-kies">${state.websites.map((w) => html`<option value="${w.id}" ${w.id === c.id ? raw("selected") : ""}>${w.naam}${w.url ? " · " + w.url.replace(/^https?:\/\//, "") : ""}</option>`)}</select>` : html`<span>${c.company}</span>`}<button class="knop knop-tekst" id="uit">Uitloggen</button></div>
      </div></header>
      <nav class="p-tabs" aria-label="Portaal"><div class="binnen">
        <a href="#overzicht" data-tab="overzicht">${inStart() ? "Start" : "Overzicht"}</a>
        ${inStart() ? "" : html`<a href="#wijzigingen" data-tab="wijzigingen">Wijzigingen</a>`}
        <a href="#facturen" data-tab="facturen">Facturen</a>
        <a href="#account" data-tab="account">Account</a>
      </div></nav>
      ${state.user.viaHq ? html`<div class="open-balk">Je bekijkt dit portaal zoals ${c.company} het ziet. <button class="knop knop-tekst" id="terug">Terug naar HQ</button></div>` : ""}
      <main class="p-main" id="inhoud" tabindex="-1"></main>`);
    app.querySelector("#uit").onclick = () => SM.uitloggen(true);
    app.querySelector("#site-kies")?.addEventListener("change", (e) => wissel(Number(e.target.value)));
    app.querySelector("#terug")?.addEventListener("click", async () => { try { await api("auth/logout?portal=1", { method: "POST" }); } catch {} location.href = "/hq/#klant/" + c.id; });
  }

  window.addEventListener("hashchange", () => { if (state) route(); });
  function route() {
    const tab = (location.hash.slice(1) || "overzicht").split("/")[0];
    app.querySelectorAll("[data-tab]").forEach((a) => a.toggleAttribute("aria-current", false));
    const actief = tab === "nieuw" ? "wijzigingen" : tab;
    app.querySelector(`[data-tab="${actief}"]`)?.setAttribute("aria-current", "page");
    const main = app.querySelector("#inhoud");
    ({ overzicht, wijzigingen, nieuw, facturen, account: (m) => SM_ACCOUNT.toon(m, state, herlaadState) }[tab] || overzicht)(main);
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------ teller
  function teller(u) {
    const blokjes = Array.from({ length: u.limit }, (_, i) => html`<span class="${i < u.used ? "gebruikt" : ""}"></span>`);
    return html`<div class="teller" role="img" aria-label="${u.used} van ${u.limit} wijzigingen gebruikt">${blokjes}</div>`;
  }
  const tellerTekst = (u) => u.left > 0
    ? html`<p class="teller-tekst">Nog ${u.left} van ${u.limit} over<small>${u.used} gebruikt in ${maand(u.month)}</small></p>`
    : html`<p class="teller-tekst">Alle ${u.limit} gebruikt<small>Vanaf 1 ${nextMonth(u.month)} kun je weer ${u.limit} wijzigingen doorgeven.</small></p>`;
  const nextMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 15).toLocaleDateString("nl-NL", { month: "long" }); };

  // ------------------------------------------------ overzicht
  const titelVan = (w) => w.page || (w.description.split(/[.!?\n]/)[0].slice(0, 60) + (w.description.length > 60 ? "…" : ""));
  const STAPPEN = ["ontvangen", "in_behandeling", "verwerkt"];
  function voortgang(w) {
    if (w.status === "afgewezen") return html`<div class="w-stappen"><span class="status s-grijs">Niet uitgevoerd</span></div>`;
    const n = STAPPEN.indexOf(w.status);
    return html`<ol class="w-stappen" aria-label="Status: ${WIJZIGING[w.status][0]}">${["Ontvangen", "In behandeling", "Verwerkt"].map((t, i) => html`<li class="${i < n ? "klaar" : i === n ? (w.status === "verwerkt" ? "klaar" : "nu") : ""}">${t}</li>`)}</ol>`;
  }

  function overzicht(main) {
    if (inStart()) return startPagina(main);
    const c = state.customer, u = state.usage;
    const open = state.changes.filter((x) => x.status === "ontvangen" || x.status === "in_behandeling");
    const recentKlaar = state.changes.filter((x) => x.status === "verwerkt").slice(0, 2);
    const openFacturen = state.invoices.filter((i) => i.status === "open" || i.status === "vervallen");
    const laatste = state.invoices[0];
    const betaald = new URLSearchParams(location.search).get("betaling");
    const host = (c.siteUrl || "").replace(/^https?:\/\//, "");
    render(main, html`
      <h1 class="p-titel">Hallo ${c.contactName || c.company}</h1>
      ${betaald ? html`<div class="melding melding-ok">${raw(icon.ok)}<p>Bedankt! Je betaling wordt verwerkt. Zodra hij binnen is, staat de factuur hier.</p></div>` : ""}
      ${state.pendingFirstPayment ? html`<div class="melding melding-let p-melding">${raw(icon.let)}<p><b>Rond je eerste betaling af</b> om je abonnement te starten.</p><a class="knop knop-actie knop-klein" href="${state.pendingFirstPayment.url}">Betalen</a></div>` : ""}

      ${state.opzegging ? html`<div class="melding melding-let p-melding">${raw(icon.let)}<p>Je hebt opgezegd. Je website blijft online tot en met ${datumLang(state.opzegging)}.</p><a class="knop knop-licht knop-klein" href="#account">Bekijken</a></div>` : ""}
      ${!state.domeinGekozen ? html`<div class="melding melding-info p-melding">${raw(icon.let)}<p><b>Op welk adres komt je website?</b> Vul je domeinnaam in, dan verbinden wij hem met je website.</p><a class="knop knop-actie knop-klein" href="#account/domein">Domein invullen</a></div>` : ""}
      ${state.start?.stage === "bouwen" ? html`<section class="paneel start-bouwen"><h2>We bouwen je website</h2><p>We hebben je informatie ontvangen. Je website staat uiterlijk <b>${datumTijd(state.start.dueAt)}</b> online; je krijgt dan een mail.</p></section>` : ""}
      <section class="site-kaart" aria-label="Je website">
        <div class="site-icoon" aria-hidden="true"><img src="/assets/brand/mark.png" alt=""></div>
        <div class="site-info"><span class="dempen klein">Je website</span><b>${host || "Nog in aanbouw"}</b></div>
        ${label(SITE, c.siteStatus)}
        ${c.siteUrl ? html`<a class="knop knop-licht knop-klein" href="${c.siteUrl}" target="_blank" rel="noopener">${raw(icon.open)}Bekijk</a>` : ""}
      </section>

      <div class="p-raster">
        <div>
          <section class="paneel" aria-labelledby="t-teller">
            <div class="paneel-kop"><h2 id="t-teller">Wijzigingen</h2><span class="klein dempen">${maand(u.month)}</span></div>
            ${teller(u)}
            <div class="teller-rij">
              <p class="teller-tekst">${u.left > 0 ? `Nog ${u.left} van ${u.limit} over` : `Alle ${u.limit} gebruikt`}<small>${u.left > 0 ? `Verwerkt binnen ${state.offer.changeHours} uur` : `Vanaf 1 ${nextMonth(u.month)} weer ${u.limit} nieuwe`}</small></p>
              ${state.canSubmit.ok && u.left > 0 ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}
            </div>
            ${!state.canSubmit.ok ? html`<div class="melding melding-let">${raw(icon.let)}<p>${state.canSubmit.reason}</p></div>` : ""}
            ${open.length ? html`<h3 class="sub-kop">Lopend</h3><ul class="lijst">${open.map(wijzigingKort)}</ul>` : ""}
            ${!open.length && recentKlaar.length ? html`<h3 class="sub-kop">Laatst verwerkt</h3><ul class="lijst">${recentKlaar.map(wijzigingKort)}</ul>` : ""}
            ${state.changes.length ? html`<a class="meer" href="#wijzigingen">Alle wijzigingen</a>` : ""}
          </section>
        </div>
        <div>
          <section class="paneel compact" aria-labelledby="t-abo">
            <h2 id="t-abo">Abonnement</h2>
            <div class="regel"><span>Status</span>${label(ABO, c.billingStatus)}</div>
            <div class="regel"><span>Per maand</span><b class="nummers">${euro(c.monthlyCents)}</b></div>
            ${c.subscriptionStart ? html`<div class="regel"><span>Sinds</span><span>${datumLang(c.subscriptionStart)}</span></div>` : ""}
          </section>
          <section class="paneel compact" aria-labelledby="t-fact">
            <h2 id="t-fact">Facturen</h2>
            ${openFacturen.length ? html`<ul class="lijst">${openFacturen.map(factuurRij)}</ul>`
              : laatste ? html`<div class="regel"><span>${laatste.number}</span>${label(FACTUUR, laatste.status)}</div><p class="klein dempen">Alles is betaald.</p>` : html`<p class="dempen">Nog geen facturen.</p>`}
            ${state.invoices.length ? html`<a class="meer" href="#facturen">Alle facturen</a>` : ""}
          </section>
        </div>
      </div>`);
    koppelFactuurKnoppen(main);
  }

  // ================================================ START: gegevens → akkoord en betalen → informatie
  const datumTijd = (iso) => iso ? new Date(iso).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const STAP = [["gegevens", "Je gegevens"], ["betalen", "Akkoord en betalen"], ["informatie", "Informatie aanleveren"], ["online", "Online binnen 48 uur"]];
  function startPagina(main) {
    const st = state.start, c = state.customer;
    const n = STAP.findIndex(([k]) => k === st.stage);
    render(main, html`
      <h1 class="p-titel">Welkom${c.contactName ? ", " + c.contactName : ""}</h1>
      <p class="p-intro">In drie korte stappen naar je nieuwe website.</p>
      <ol class="start-stappen">${STAP.map(([k, t], i) => html`<li class="${i < n ? "klaar" : i === n ? "nu" : ""}" ${i === n ? raw('aria-current="step"') : ""}><span class="nr">${i < n ? raw(icon.ok) : i + 1}</span><span>${t}</span></li>`)}</ol>
      <section class="paneel start-paneel" id="stap"></section>`);
    const vak = main.querySelector("#stap");
    ({ gegevens: stapGegevens, betalen: stapBetalen, informatie: stapInformatie })[st.stage](vak);
  }
  const veld = (name, label, value, { type = "text", opt = false, hulp = "", attrs = "", half = false } = {}) => html`<div class="veld ${half ? "half" : ""}"><label for="s-${name}">${label}${opt ? html` <span class="opt">(optioneel)</span>` : ""}</label>
    <input id="s-${name}" name="${name}" type="${type}" value="${value || ""}" ${raw(attrs)}>${hulp ? html`<div class="hulp">${hulp}</div>` : ""}<div class="fout" data-fout-voor="${name}"></div></div>`;
  const tekstvak = (name, label, value, { opt = false, hulp = "", rows = 4, plaats = "" } = {}) => html`<div class="veld"><label for="s-${name}">${label}${opt ? html` <span class="opt">(optioneel)</span>` : ""}</label>
    ${hulp ? html`<div class="hulp boven">${hulp}</div>` : ""}<textarea id="s-${name}" name="${name}" rows="${rows}" placeholder="${plaats}">${value || ""}</textarea><div class="fout" data-fout-voor="${name}"></div></div>`;

  function stapGegevens(vak) {
    const d = state.start.details;
    render(vak, html`<h2>Je bedrijfsgegevens</h2><p class="dempen">Deze gegevens komen op je facturen. Je website-inhoud lever je in stap 3 aan.</p>
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2">${veld("company", "Bedrijfsnaam", d.company, { attrs: 'autocomplete="organization" required' })}${veld("contactName", "Contactpersoon", d.contactName, { attrs: 'autocomplete="name" required' })}</div>
        <div class="rij2">${veld("street", "Straat en huisnummer", d.street, { attrs: 'autocomplete="address-line1" required' })}${veld("phone", "Telefoon", d.phone, { type: "tel", attrs: 'autocomplete="tel" required' })}</div>
        <div class="rij2">${veld("postcode", "Postcode", d.postcode, { attrs: 'autocomplete="postal-code" required' })}${veld("city", "Plaats", d.city, { attrs: 'autocomplete="address-level2" required' })}</div>
        <div class="rij2">${veld("kvk", "KvK-nummer", d.kvk, { attrs: 'inputmode="numeric" maxlength="8" required', hulp: "8 cijfers" })}${veld("vatNumber", "Btw-nummer", d.vatNumber, { opt: true, hulp: "Bijvoorbeeld NL123456789B01" })}</div>
        <div class="knoppen"><button class="knop knop-actie" type="submit">Opslaan en verder</button></div></form>`);
    const form = vak.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
      try { await api("portal/start/gegevens", { method: "PUT", body: Object.fromEntries(new FormData(form)) }); await herlaadState(); }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }

  function stapBetalen(vak) {
    const st = state.start, p = st.price;
    const terug = new URLSearchParams(location.search).get("betaling");
    render(vak, html`<h2>Akkoord en betalen</h2>
      ${st.paymentPending && terug ? html`<div class="melding melding-info" role="status">${raw(icon.let)}<div><p><b>We wachten op de bevestiging van je betaling.</b> Dat duurt meestal een paar seconden.</p><button class="knop knop-licht knop-klein" type="button" id="check">Opnieuw controleren</button></div></div>` : ""}
      <div class="prijs-blok">
        <div class="regel"><span>Bouw van je website <small>eenmalig, nu te betalen</small></span><b class="nummers">${euro(p.buildCents)}</b></div>
        <div class="regel"><span>Abonnement <small>hosting en ${state.offer.changesPerMonth} wijzigingen per maand, automatisch vanaf ${datumLang(p.firstMonthly)}</small></span><b class="nummers">${euro(p.monthlyCents)} <small>per maand</small></b></div>
      </div>
      <p class="klein dempen">Je betaalt via Mollie (bijvoorbeeld met iDEAL). Met deze betaling geef je ook toestemming voor de maandelijkse afschrijving.</p>
      ${!st.payOnline ? html`<div class="melding melding-let">${raw(icon.let)}<p>Online betalen staat nog niet aan. We nemen contact met je op om je abonnement te starten.</p></div>` : ""}
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="akkoord" required> <span>Ik ga akkoord met de <a href="/voorwaarden.html" target="_blank" rel="noopener">algemene voorwaarden</a> en geef toestemming om ${euro(p.monthlyCents)} per maand automatisch af te schrijven.</span></label><div class="fout" data-fout-voor="akkoord"></div></div>
        <div class="knoppen"><button class="knop knop-actie" type="submit" ${st.payOnline ? "" : raw("disabled")}>${euro(p.buildCents)} betalen en starten</button><button class="knop knop-tekst" type="button" id="terug">Gegevens aanpassen</button></div></form>`);
    vak.querySelector("#check")?.addEventListener("click", herlaadState);
    vak.querySelector("#terug").onclick = () => { state.start.stage = "gegevens"; stapGegevens(vak); main().querySelectorAll(".start-stappen li").forEach((li, i) => { li.className = i === 0 ? "nu" : ""; }); };
    const form = vak.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      if (!form.elements.akkoord.checked) return SM.toonFouten(form, { message: "Vink aan dat je akkoord gaat.", data: { field: "akkoord" } });
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Naar betalen…");
      try { const r = await api("portal/start/betalen", { method: "POST", body: { akkoord: true } }); location.href = r.checkoutUrl; }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
    // Na terugkomen van Mollie: even automatisch opnieuw kijken.
    if (st.paymentPending && terug) setTimeout(() => { if (state.start?.stage === "betalen") herlaadState(); }, 4000);
  }

  function stapInformatie(vak) {
    const st = state.start, i = st.intake, c = state.customer;
    const adres = (st.details.street ? st.details.street + ", " : "") + [st.details.postcode, st.details.city].filter(Boolean).join(" ");
    render(vak, html`<h2>Informatie voor je website</h2>
      <p class="dempen">Vertel ons wat er op je website moet komen. Schrijf het gewoon op zoals je het aan een klant zou vertellen; wij maken er goede teksten van. Je kunt tussendoor opslaan en later verder.</p>
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <fieldset><legend>Je bedrijf</legend>
          ${tekstvak("omschrijving", "Wat doet je bedrijf, en voor wie?", i.omschrijving, { rows: 5, plaats: "Bijvoorbeeld: wij zijn een hoveniersbedrijf in Utrecht en omgeving. We leggen tuinen aan en onderhouden ze voor particulieren." })}
          ${tekstvak("diensten", "Je belangrijkste diensten of producten", i.diensten, { rows: 5, hulp: "Eén per regel, eventueel met een korte uitleg of prijs.", plaats: "Tuinontwerp\nAanleg\nOnderhoud" })}
          ${tekstvak("onderscheid", "Waarom kiezen klanten voor jou?", i.onderscheid, { opt: true, rows: 3 })}
          <div class="rij2">${veld("werkgebied", "Werkgebied of plaats", i.werkgebied, { opt: true })}${veld("doelgroep", "Je klanten", i.doelgroep, { opt: true, hulp: "Bijv. particulieren, bedrijven, ouderen" })}</div>
          ${tekstvak("openingstijden", "Openingstijden", i.openingstijden, { opt: true, rows: 3, plaats: "ma t/m vr 8:00 - 17:00\nza op afspraak" })}
        </fieldset>
        <fieldset><legend>Contact op je website</legend>
          <div class="rij2">${veld("sitePhone", "Telefoon", i.sitePhone ?? c.phone ?? st.details.phone, { type: "tel" })}${veld("siteEmail", "E-mailadres", i.siteEmail ?? c.email, { type: "email" })}</div>
          ${veld("siteAddress", "Adres", i.siteAddress ?? adres, { opt: true, hulp: "Laat leeg als je adres niet op de website mag." })}
          ${tekstvak("socials", "Social media", i.socials, { opt: true, rows: 2, plaats: "Links naar Instagram, Facebook, LinkedIn…" })}
        </fieldset>
        <fieldset><legend>Domein en stijl</legend>
          <div class="rij2">${veld("domein", "Domeinnaam", i.domein, { opt: true, hulp: "Heb je er nog geen? Koop hem zelf bij een provider; wij verbinden hem met je site." })}${veld("huidigeSite", "Huidige website", i.huidigeSite, { opt: true })}</div>
          <div class="veld"><span class="label" id="l-stijl">Welke stijl past bij je?</span>
            <div class="stijl-keuze" role="radiogroup" aria-labelledby="l-stijl">${Object.entries({ kies: "Kies maar voor mij", ...st.themas }).map(([k, t]) => html`<label class="stijl-optie"><input type="radio" name="stijl" value="${k}" ${(i.stijl || "kies") === k ? raw("checked") : ""}><span>${t}</span></label>`)}</div></div>
          <div class="rij2">${veld("kleuren", "Kleuren", i.kleuren, { opt: true, hulp: "Bijv. de kleuren van je logo" })}${veld("voorbeelden", "Websites die je mooi vindt", i.voorbeelden, { opt: true })}</div>
        </fieldset>
        <fieldset><legend>Logo en foto's</legend>
          <p class="klein dempen">Maximaal 4 MB per bestand en ${st.maxFiles} bestanden in totaal. Heb je grotere bestanden? Zet een link (bijvoorbeeld WeTransfer) bij Opmerkingen.</p>
          <div class="upload-rij">
            <label class="knop knop-licht knop-klein upload-knop"><input type="file" class="sr" data-soort="logo" accept="image/*,.pdf,.svg">Logo toevoegen</label>
            <label class="knop knop-licht knop-klein upload-knop"><input type="file" class="sr" data-soort="foto" accept="image/*" multiple>Foto's toevoegen</label>
          </div>
          <ul class="lijst bestanden" id="bestanden" aria-live="polite"></ul>
        </fieldset>
        ${tekstvak("opmerkingen", "Opmerkingen", i.opmerkingen, { opt: true, rows: 3 })}
        <div class="knoppen"><button class="knop knop-actie" type="submit">Versturen</button><button class="knop knop-licht" type="button" id="bewaar">Opslaan voor later</button></div>
      </form>`);
    const form = vak.querySelector("form"), lijst = vak.querySelector("#bestanden");
    const toonBestanden = () => render(lijst, st.files.length ? html`${st.files.map((f) => html`<li class="bestand"><span class="status ${f.kind === "logo" ? "s-info" : "s-grijs"}">${f.kind === "logo" ? "Logo" : "Foto"}</span><span class="naam">${f.name}</span><span class="klein dempen">${SM.bytes(f.size)}</span><button class="knop knop-tekst knop-klein" type="button" data-weg="${f.id}" aria-label="${f.name} verwijderen">Verwijderen</button></li>`)}` : html`<li class="dempen klein">Nog geen bestanden toegevoegd.</li>`);
    toonBestanden();
    lijst.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-weg]"); if (!b) return;
      try { await api("portal/start/bestanden/" + b.dataset.weg, { method: "DELETE" }); st.files = st.files.filter((f) => String(f.id) !== b.dataset.weg); toonBestanden(); } catch (err) { toast(err.message, "fout"); }
    });
    vak.querySelectorAll("input[type=file]").forEach((inp) => inp.addEventListener("change", async () => {
      const files = [...inp.files]; inp.value = "";
      for (const f of files) {
        const tmp = html`<li class="bestand bezig"><span class="naam">${f.name}</span><span class="klein dempen">Uploaden…</span></li>`;
        lijst.insertAdjacentHTML("beforeend", String(tmp));
        const fd = new FormData(); fd.set("file", f); fd.set("kind", inp.dataset.soort);
        try { const r = await api("portal/start/bestanden", { method: "POST", form: fd }); st.files.push(r.file); }
        catch (err) { toast(err.message, "fout"); }
        toonBestanden();
      }
    }));
    const verzamel = () => Object.fromEntries(new FormData(form));
    vak.querySelector("#bewaar").onclick = async (e) => {
      SM.bezig(e.target, true, "Opslaan…");
      try { await api("portal/start/informatie", { method: "PUT", body: { ...verzamel(), verstuur: false } }); state.start.intake = verzamel(); toast("Opgeslagen. Je kunt later verder."); } catch (err) { SM.toonFouten(form, err); }
      SM.bezig(e.target, false);
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      if (!st.files.length && !(await SM.bevestig("Versturen zonder logo of foto's?", "Je kunt je logo en foto's ook later als wijziging doorgeven, maar met eigen beelden wordt je website sterker.", "Toch versturen"))) return;
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Versturen…");
      try { await api("portal/start/informatie", { method: "PUT", body: { ...verzamel(), verstuur: true } }); await herlaadState(); toast("Verstuurd! We gaan bouwen."); }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }
  const main = () => app.querySelector("#inhoud");
  // Andere website openen (klanten met meerdere websites).
  async function wissel(id) {
    try { await api("portal/website", { method: "POST", body: { id } }); location.hash = "#overzicht"; await herlaadState(); toast("Je bekijkt nu " + (state.websites.find((w) => w.id === id)?.naam || "je andere website")); }
    catch (e) { toast(e.message, "fout"); }
  }
  window.SM_PORTAAL_WISSEL = wissel;
  async function herlaadState() {
    try { state = await api("portal/state"); } catch (e) { toast(e.message, "fout"); return; }
    kader(); route();
  }

  function wijzigingKort(w) {
    return html`<li class="w-kort"><div class="wijziging-kop"><b>${titelVan(w)}</b><span class="klein dempen">${tijd(w.createdAt)}</span></div>${voortgang(w)}</li>`;
  }

  // ------------------------------------------------ wijzigingen
  function wijzigingen(main) {
    const u = state.usage;
    render(main, html`
      <div class="hq-kop"><div><h1>Wijzigingen</h1></div>
        <div class="knoppen"><span class="status ${u.left > 0 ? "s-info" : "s-grijs"}">${u.left} van ${u.limit} over</span>${state.canSubmit.ok && u.left > 0 ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}</div></div>
      <section class="paneel">
        ${state.changes.length ? html`<ul class="lijst">${state.changes.map(wijzigingLang)}</ul>`
          : html`<div class="leeg"><h3>Nog geen wijzigingen</h3><p>Wil je iets aanpassen op je website? Geef het door, dan verwerken we het binnen ${state.offer.changeHours} uur.</p>${state.canSubmit.ok ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}</div>`}
      </section>`);
  }
  function wijzigingLang(w) {
    const over = SM.over(w.dueAt), open = w.status === "ontvangen" || w.status === "in_behandeling";
    return html`<li>
      <div class="wijziging-kop"><b>${titelVan(w)}</b><span class="klein dempen">${tijd(w.createdAt)}</span></div>
      <p class="wijziging-tekst">${w.description}</p>
      ${voortgang(w)}
      <div class="wijziging-meta">
        ${open && over ? html`<span>Klaar binnen ${over}</span>` : ""}
        ${w.doneAt && w.status === "verwerkt" ? html`<span>Verwerkt ${tijd(w.doneAt)}</span>` : ""}
        ${!w.counts ? html`<span>Telt niet mee</span>` : ""}
        ${w.attachment ? html`<a href="/api/portal/changes/${w.id}/bijlage">${raw(icon.download)} ${w.attachment.name}</a>` : ""}
      </div>
      ${w.staffNote ? html`<div class="notitie"><b>Sitemaker:</b> ${w.staffNote}</div>` : ""}
    </li>`;
  }

  // ------------------------------------------------ nieuwe wijziging
  function nieuw(main) {
    const u = state.usage;
    if (!state.canSubmit.ok || u.left <= 0) { location.hash = "#wijzigingen"; return; }
    render(main, html`
      <div class="hq-kop"><div><h1>Wijziging doorgeven</h1><p>We verwerken hem binnen ${state.offer.changeHours} uur. Daarna heb je deze maand nog ${u.left - 1} over.</p></div></div>
      <section class="paneel">
        <form id="w-form" novalidate>
          <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <div class="veld">
            <label for="w-tekst">Wat moet er aangepast worden?</label>
            <textarea id="w-tekst" name="description" required maxlength="4000" aria-describedby="w-hulp"></textarea>
            <div class="hulp" id="w-hulp">Wees zo concreet mogelijk: welke tekst, foto of knop, en wat moet het worden. <span id="w-teller"></span></div>
            <div class="fout" data-fout-voor="description"></div>
          </div>
          <div class="veld">
            <label for="w-pagina">Op welke pagina? <span class="opt">(optioneel)</span></label>
            <input id="w-pagina" name="page" maxlength="200" placeholder="Bijvoorbeeld: Contact of de startpagina">
          </div>
          <div class="veld">
            <span class="label" id="w-bestand-label">Bestand of afbeelding <span class="opt">(optioneel)</span></span>
            <div class="bestand-vak" id="w-vak">
              <input type="file" name="file" id="w-bestand" aria-labelledby="w-bestand-label" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,.doc,.docx,.txt">
              <p id="w-bestand-tekst"><b>Kies een bestand</b> of sleep het hierheen<br><span class="klein dempen">JPG, PNG, WebP, GIF, SVG, PDF, Word of tekst · max. 4 MB</span></p>
            </div>
            <div class="fout" data-fout-voor="file"></div>
          </div>
          <div class="knoppen"><button class="knop knop-actie" type="submit">Wijziging versturen</button><a class="knop knop-licht" href="#overzicht">Annuleren</a></div>
        </form>
      </section>`);
    const form = main.querySelector("#w-form"), ta = form.elements.description, file = form.elements.file;
    const tel = main.querySelector("#w-teller");
    ta.addEventListener("input", () => { tel.textContent = ta.value.length > 3500 ? `(${4000 - ta.value.length} tekens over)` : ""; });
    ta.focus();
    const vak = main.querySelector("#w-vak"), vakTekst = main.querySelector("#w-bestand-tekst");
    const toonBestand = () => {
      const f = file.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) { file.value = ""; SM.toonFouten(form, { message: "Dit bestand is groter dan 4 MB. Kies een kleiner bestand, of zet een link in je omschrijving.", data: { field: "file" } }); return; }
      render(vakTekst, html`<span class="naam">${f.name}</span><br><span class="klein dempen">${SM.bytes(f.size)} · klik om een ander bestand te kiezen</span>`);
    };
    file.addEventListener("change", toonBestand);
    ["dragenter", "dragover"].forEach((ev) => vak.addEventListener(ev, () => vak.classList.add("actief")));
    ["dragleave", "drop"].forEach((ev) => vak.addEventListener(ev, () => vak.classList.remove("actief")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      if (ta.value.trim().length < 10) return SM.toonFouten(form, { message: "Beschrijf in een paar zinnen wat er aangepast moet worden.", data: { field: "description" } });
      const knop = form.querySelector("button[type=submit]"); SM.bezig(knop, true, "Versturen…");
      try {
        const res = await api("portal/changes", { method: "POST", form: new FormData(form) });
        state.changes.unshift(res.change); state.usage = res.usage;
        bevestiging(main, res);
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); if (err.status === 409) { state = await api("portal/state"); } }
    });
  }

  function bevestiging(main, res) {
    const klaar = new Date(res.change.dueAt);
    render(main, html`<section class="paneel bevestiging" tabindex="-1" id="bev">
      <div class="vink">${raw(icon.ok)}</div>
      <h1>We hebben je wijziging ontvangen</h1>
      <p>We verwerken hem binnen <b>${state.offer.changeHours} uur</b>, uiterlijk ${klaar.toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Je krijgt een mail zodra hij klaar is, en je ziet de status hier in het portaal.</p>
      ${res.uploadFailed ? html`<div class="melding melding-let">${raw(icon.let)}<p>Je bestand kon niet worden opgeslagen. Je wijziging is wel ontvangen; mail het bestand even na, dan voegen wij het toe.</p></div>` : ""}
      ${teller(res.usage)}${tellerTekst(res.usage)}
      <div class="knoppen"><a class="knop" href="#wijzigingen">Bekijk de status</a>${res.usage.left > 0 ? html`<a class="knop knop-licht" href="#nieuw" id="nog">Nog een wijziging doorgeven</a>` : ""}</div>
    </section>`);
    main.querySelector("#bev").focus();
    toast("Wijziging ontvangen");
    main.querySelector("#nog")?.addEventListener("click", (e) => { if (location.hash === "#nieuw") { e.preventDefault(); route(); } });
  }

  // ------------------------------------------------ facturen
  function factuurRij(i) {
    return html`<li class="factuur-rij">
      <div><b>${i.number}</b> ${label(FACTUUR, i.status)}<br><span class="klein dempen">${datum(i.date)}${i.description ? " · " + i.description : ""}</span></div>
      <div class="bedrag">${euro(i.amountCents)}</div>
      <div class="acties">
        ${i.hasPdf ? html`<a class="knop knop-licht knop-klein" href="/api/portal/invoices/${i.id}/pdf?inline=1" target="_blank" rel="noopener">${raw(icon.open)}Openen</a><a class="knop knop-licht knop-klein" href="/api/portal/invoices/${i.id}/pdf" download>${raw(icon.download)}Downloaden</a>` : html`<span class="klein dempen">PDF volgt binnenkort</span>`}
        ${(i.status === "open" || i.status === "vervallen") && state.payOnline ? html`<button class="knop knop-actie knop-klein" data-betaal="${i.id}">Betalen</button>` : ""}
      </div></li>`;
  }
  function facturen(main) {
    render(main, html`<div class="hq-kop"><div><h1>Facturen</h1><p>Al je facturen van Sitemaker. Open of download ze als PDF.</p></div></div>
      <section class="paneel">${state.invoices.length ? html`<ul class="lijst">${state.invoices.map(factuurRij)}</ul>` : html`<div class="leeg"><h3>Nog geen facturen</h3><p>Zodra er een factuur is, vind je hem hier.</p></div>`}</section>`);
    koppelFactuurKnoppen(main);
  }
  function koppelFactuurKnoppen(main) {
    main.querySelectorAll("[data-betaal]").forEach((b) => b.addEventListener("click", async () => {
      SM.bezig(b, true, "Even geduld…");
      try { const r = await api(`portal/invoices/${b.dataset.betaal}/pay`, { method: "POST" }); location.href = r.checkoutUrl; }
      catch (e) { toast(e.message, "fout"); SM.bezig(b, false); }
    }));
  }

  start();
})();
