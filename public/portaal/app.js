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
              ${state.canSubmit.ok && (u.left > 0 || state.opleverronde) ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}
            </div>
            ${state.opleverronde ? html`<div class="melding melding-ok">${raw(icon.ok)}<p><b>Opleverronde tot ${datumLang(state.opleverronde)}.</b> Geef gerust al je feedback op je nieuwe website door: wijzigingen in deze periode tellen niet mee voor je ${u.limit} per maand.</p></div>` : ""}
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

  // Echte, gepubliceerde reviews (HQ › Reviews); zonder reviews blijft het blok verborgen.
  async function laadReviews(el) {
    if (!el) return;
    let d = null;
    try { d = await (await fetch("/api/reviews", { headers: { accept: "application/json" } })).json(); } catch {}
    const lijst = (d?.reviews || []).filter((r) => r.body).slice(0, 8);
    if (!lijst.length) return;
    const sterren = (n) => "★★★★★".slice(0, Math.max(0, Math.min(5, Math.round(n || 0)))) + "☆☆☆☆☆".slice(0, 5 - Math.max(0, Math.min(5, Math.round(n || 0))));
    render(el, html`<h3>Wat klanten zeggen${d.count > 1 ? html` <span class="klein dempen">${String(d.average).replace(".", ",")} uit 5 · ${d.count} reviews</span>` : ""}</h3>
      <div class="review-rij">${lijst.map((r) => html`<figure class="review-kaart"><div class="sterren" aria-label="${r.rating} van 5 sterren">${sterren(r.rating)}</div><blockquote>${r.body.length > 260 ? r.body.slice(0, 257) + "…" : r.body}</blockquote><figcaption><b>${r.name}</b>${r.company ? html`, ${r.company}` : ""}</figcaption></figure>`)}</div>`);
    el.hidden = false;
  }

  function stapBetalen(vak) {
    const st = state.start, p = st.price;
    const terug = new URLSearchParams(location.search).get("betaling");
    render(vak, html`<h2>Bijna klaar: akkoord en betalen</h2>
      <p class="dempen">Na deze stap gaan we voor je aan de slag. Je website staat binnen ${state.offer.deliveryText} online zodra je je informatie hebt aangeleverd.</p>
      ${st.paymentPending && terug ? html`<div class="melding melding-info" role="status">${raw(icon.let)}<div><p><b>We wachten op de bevestiging van je betaling.</b> Dat duurt meestal een paar seconden.</p><button class="knop knop-licht knop-klein" type="button" id="check">Opnieuw controleren</button></div></div>` : ""}
      <div class="prijs-blok">
        <div class="regel"><span>Bouw van je website <small>eenmalig, nu te betalen</small></span><b class="nummers">${euro(p.buildCents)}</b></div>
        <div class="regel"><span>Abonnement <small>hosting en ${state.offer.changesPerMonth} wijzigingen per maand, automatisch vanaf ${datumLang(p.firstMonthly)}</small></span><b class="nummers">${euro(p.monthlyCents)} <small>per maand</small></b></div>
      </div>
      <div class="zekerheden">
        <div>${raw(icon.ok)}<b>Binnen 48 uur live</b><span>na het aanleveren van je informatie</span></div>
        <div>${raw(icon.ok)}<b>30 dagen 100% geld terug</b><span>niet tevreden na livegang? Alles terug</span></div>
        <div>${raw(icon.ok)}<b>Maandelijks opzegbaar</b><span>geen langlopend contract</span></div>
        <div>${raw(icon.ok)}<b>Alles inbegrepen</b><span>ontwerp, hosting en ${state.offer.changesPerMonth} wijzigingen per maand</span></div>
      </div>
      ${st.payOnline ? ""
        : html`<p class="klein dempen">Je krijgt direct een factuur per mail en in je portaal, die je betaalt via een overboeking. Daarna krijg je elke maand een factuur van ${euro(p.monthlyCents)}. Je kunt meteen door met het aanleveren van je informatie.</p>`}
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="akkoord" required> <span>${st.payOnline ? html`Ik ga akkoord met de <a href="/voorwaarden.html" target="_blank" rel="noopener">algemene voorwaarden</a> en geef toestemming om ${euro(p.monthlyCents)} per maand automatisch af te schrijven.` : html`Ik ga akkoord met de <a href="/voorwaarden.html" target="_blank" rel="noopener">algemene voorwaarden</a> en het abonnement van ${euro(p.monthlyCents)} per maand (maandelijks opzegbaar).`}</span></label><div class="fout" data-fout-voor="akkoord"></div></div>
        <div class="knoppen">${st.payOnline ? html`<button class="knop knop-betaal" type="submit">${raw('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>')}${euro(p.buildCents)} veilig betalen en starten</button>` : html`<button class="knop knop-actie" type="submit">Akkoord en starten</button>`}<button class="knop knop-tekst" type="button" id="terug">Gegevens aanpassen</button></div>
        ${st.payOnline ? html`<p class="betaal-veilig">${raw('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>')}Veilig betalen met iDEAL via Pay.nl</p>` : ""}</form>
      <section class="betaal-reviews" id="betaal-reviews" hidden aria-label="Ervaringen van klanten"></section>`);
    laadReviews(vak.querySelector("#betaal-reviews"));
    vak.querySelector("#check")?.addEventListener("click", herlaadState);
    vak.querySelector("#terug").onclick = () => { state.start.stage = "gegevens"; stapGegevens(vak); main().querySelectorAll(".start-stappen li").forEach((li, i) => { li.className = i === 0 ? "nu" : ""; }); };
    const form = vak.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      if (!form.elements.akkoord.checked) return SM.toonFouten(form, { message: "Vink aan dat je akkoord gaat.", data: { field: "akkoord" } });
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, st.payOnline ? "Naar betalen…" : "Even geduld…");
      try { const r = await api("portal/start/betalen", { method: "POST", body: { akkoord: true, iban: form.elements.iban?.value || "", ibanNaam: form.elements.ibanNaam?.value || "" } }); if (r.checkoutUrl) location.href = r.checkoutUrl; else { toast(`Gestart! Factuur ${r.factuur || ""} staat in je mail en bij Facturen.`); herlaadState(); } }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
    // Na terugkomen van Pay.nl: even automatisch opnieuw kijken.
    if (st.paymentPending && terug) setTimeout(() => { if (state.start?.stage === "betalen") herlaadState(); }, 4000);
  }

  function stapInformatie(vak) {
    const st = state.start, i = st.intake, c = state.customer;
    const adres = (st.details.street ? st.details.street + ", " : "") + [st.details.postcode, st.details.city].filter(Boolean).join(" ");
    const keuze = (name, label, opties, waarde, { opt = false, hulp = "" } = {}) => html`<div class="veld"><span class="label" id="l-${name}">${label}${opt ? html` <span class="opt">(optioneel)</span>` : ""}</span>${hulp ? html`<div class="hulp">${hulp}</div>` : ""}
      <div class="stijl-keuze" role="radiogroup" aria-labelledby="l-${name}">${Object.entries(opties).map(([k, t]) => html`<label class="stijl-optie"><input type="radio" name="${name}" value="${k}" ${waarde === k ? raw("checked") : ""}><span>${t}</span></label>`)}</div><div class="fout" data-fout-voor="${name}"></div></div>`;
    render(vak, html`<h2>Informatie voor je website</h2>
      <p class="dempen">Vertel ons wat er op je website moet komen. Schrijf het gewoon op zoals je het aan een klant zou vertellen; wij maken er goede teksten van. Je kunt tussendoor opslaan en later verder.</p>
      ${i.voorIngevuld ? html`<div class="melding melding-info">${raw(icon.let)}<p><b>We hebben alvast ingevuld wat we van je huidige website weten</b>, en je logo en foto's toegevoegd. Controleer het, pas aan wat niet klopt en vul de rest aan.</p></div>` : ""}
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <fieldset><legend>1. Je bedrijf</legend>
          ${tekstvak("omschrijving", "Wat doet je bedrijf, en voor wie?", i.omschrijving, { rows: 5, plaats: "Bijvoorbeeld: wij zijn een hoveniersbedrijf in Utrecht en omgeving. We leggen tuinen aan en onderhouden ze voor particulieren." })}
          ${tekstvak("diensten", "Je belangrijkste diensten", i.diensten, { rows: 6, hulp: "Eén per regel, met een korte uitleg. Zet er een prijs bij als die op je site mag.", plaats: "Tuinontwerp: we tekenen je tuin samen met jou\nAanleg: van grondwerk tot beplanting\nOnderhoud: vaste afspraken per seizoen" })}
          ${keuze("prijzenTonen", "Mogen er prijzen op je website?", { ja: "Ja", deels: "Alleen vanaf-prijzen", nee: "Nee" }, i.prijzenTonen, { opt: true })}
          ${tekstvak("onderscheid", "Waarom kiezen klanten voor jou?", i.onderscheid, { opt: true, rows: 3, hulp: "Hoe concreter hoe beter: jaren ervaring, keurmerken of certificaten, garanties, snelheid. We zetten alleen op je site wat jij hier noemt.", plaats: "Al 15 jaar in de regio, VCA-gecertificeerd, 2 jaar garantie op aanleg" })}
          <div class="rij2">${veld("werkgebied", "Werkgebied of plaatsen", i.werkgebied, { opt: true })}${veld("doelgroep", "Voor wie werk je?", i.doelgroep, { opt: true, hulp: "Bijv. particulieren, VvE's, bedrijven" })}</div>
          ${tekstvak("vragen", "Vragen die klanten vaak stellen", i.vragen, { opt: true, rows: 3, hulp: "Met je antwoord erbij. Dan maken we er een stukje 'veelgestelde vragen' van.", plaats: "Hoe snel kunnen jullie komen? Meestal binnen een week." })}
        </fieldset>
        <fieldset><legend>2. Wat moet een bezoeker doen?</legend>
          ${keuze("hoofdactie", "De belangrijkste actie op je website", st.hoofdacties || {}, i.hoofdactie, { hulp: "Deze knop komt overal op je site terug." })}
          ${veld("boekingslink", "Link naar je online agenda", i.boekingslink, { opt: true, type: "url", hulp: "Bijv. je Salonized-, Treatwell- of Calendly-link." })}
          <div class="rij2">${veld("sitePhone", "Telefoon", i.sitePhone ?? c.phone ?? st.details.phone, { type: "tel" })}${veld("whatsapp", "WhatsApp", i.whatsapp, { opt: true, type: "tel" })}</div>
          <div class="rij2">${veld("siteEmail", "E-mailadres", i.siteEmail ?? c.email, { type: "email" })}${veld("siteAddress", "Adres", i.siteAddress ?? adres, { opt: true, hulp: "Laat leeg als je adres niet op de website mag." })}</div>
          ${tekstvak("openingstijden", "Openingstijden", i.openingstijden, { opt: true, rows: 3, plaats: "ma t/m vr 8:00 - 17:00\nza op afspraak" })}
          ${tekstvak("socials", "Social media", i.socials, { opt: true, rows: 2, plaats: "Links naar Instagram, Facebook, LinkedIn…" })}
          ${keuze("aanspreekvorm", "Spreek je klanten aan met je of u?", { je: "Je", u: "U" }, i.aanspreekvorm, { opt: true })}
        </fieldset>
        <fieldset><legend>3. Je merk en sfeer</legend>
          ${veld("drieWoorden", "Hoe wil je overkomen, in drie woorden?", i.drieWoorden, { opt: true, hulp: "Bijvoorbeeld: betrouwbaar, nuchter, vakkundig. Of: luxe, rustig, persoonlijk." })}
          ${veld("kleuren", "Je kleuren", i.kleuren, { opt: true, hulp: "Bijv. de kleuren van je logo. Weet je het niet? Dan halen wij ze uit je logo." })}
          <div class="rij2">${veld("voorbeelden", "Websites die je mooi vindt", i.voorbeelden, { opt: true })}${veld("voorbeeldenWaarom", "Wat vind je daar mooi aan?", i.voorbeeldenWaarom, { opt: true })}</div>
          ${tekstvak("nietWillen", "Wat wil je beslist niet op je website?", i.nietWillen, { opt: true, rows: 2, plaats: "Bijv. geen roze, geen foto's van mij, geen prijzen" })}
          ${veld("huidigeSite", "Huidige website", i.huidigeSite, { opt: true })}
        </fieldset>
        <fieldset><legend>Domeinnaam</legend>
          <p class="klein dempen">Op welk adres moet je website komen? Je domeinnaam blijft van jou en bij je eigen provider; wij verbinden hem met je website en je e-mail blijft gewoon werken. Heb je er nog geen? Koop er een bij een provider zoals TransIP, Hostnet of Strato, op naam van je bedrijf. Tot die tijd staat je website op een tijdelijk adres.</p>
          <div class="rij2">${veld("domein", "Je domeinnaam", i.domein, { opt: true, hulp: "Bijv. jouwbedrijf.nl" })}${veld("domeinProvider", "Bij welke provider staat hij?", i.domeinProvider, { opt: true, hulp: "Bijv. TransIP, Hostnet, Strato" })}</div>
        </fieldset>
        <fieldset><legend>4. Beeld en vertrouwen</legend>
          ${keuze("sfeerfotos", "Mogen we sfeerfoto's gebruiken waar eigen foto's ontbreken?", { ja: "Ja, prima", nee: "Nee, alleen mijn eigen foto's" }, i.sfeerfotos, { opt: true })}
          ${veld("reviewsLink", "Link naar je Google-reviews", i.reviewsLink, { opt: true, type: "url", hulp: "Dan tonen we echte reviews van je klanten." })}
          ${keuze("reviewsToestemming", "Mogen we reviews van je klanten op je website zetten?", { ja: "Ja", nee: "Nee" }, i.reviewsToestemming, { opt: true })}
          ${tekstvak("team", "Wie werken er (namen en rollen die op de site mogen)?", i.team, { opt: true, rows: 2, plaats: "Jan de Vries, eigenaar\nSara, planning" })}
        </fieldset>
        <fieldset><legend>5. Logo en foto's</legend>
          <p class="klein dempen">Je logo (het liefst los, op een transparante achtergrond) en foto's van jezelf of je team, je werk en je pand. Voor- en na-foto's werken heel goed. Maximaal 4 MB per bestand en ${st.maxFiles} bestanden in totaal. Heb je grotere bestanden? Zet een link (bijvoorbeeld WeTransfer) bij Opmerkingen.</p>
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
        <div class="knoppen"><span class="status ${u.left > 0 ? "s-info" : "s-grijs"}">${u.left} van ${u.limit} over</span>${state.canSubmit.ok && (u.left > 0 || state.opleverronde) ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}</div></div>
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
    if (!state.canSubmit.ok || (u.left <= 0 && !state.opleverronde)) { location.hash = "#wijzigingen"; return; }
    render(main, html`
      <div class="hq-kop"><div><h1>Wijziging doorgeven</h1><p>We verwerken hem binnen ${state.offer.changeHours} uur. ${state.opleverronde ? `Opleverronde: deze wijziging telt niet mee voor je ${u.limit} per maand.` : `Daarna heb je deze maand nog ${u.left - 1} over.`}</p></div></div>
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
      </div>${(i.status === "open" || i.status === "vervallen") && !state.payOnline && state.bank ? html`<p class="klein overboeken">Betaal via een overboeking van <b>${euro(i.amountCents)}</b> naar <b>${state.bank.iban}</b> t.n.v. ${state.bank.naam}, onder vermelding van <b>${i.number}</b>.</p>` : ""}</li>`;
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
