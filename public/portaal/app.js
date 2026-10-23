// Sitemaker klantenportaal: overzicht, wijzigingen doorgeven en facturen.
(() => {
  const { html, raw, render, api, euro, datum, datumLang, tijd, maand, toast, icon } = SM;
  const app = document.getElementById("app");
  let state = null;

  const WIJZIGING = { ontvangen: ["Ontvangen", "s-info"], in_behandeling: ["In behandeling", "s-let"], verwerkt: ["Verwerkt", "s-ok"], afgewezen: ["Niet uitgevoerd", "s-grijs"] };
  const FACTUUR = { open: ["Openstaand", "s-let"], betaald: ["Betaald", "s-ok"], vervallen: ["Vervallen", "s-fout"], gecrediteerd: ["Gecrediteerd", "s-grijs"] };
  const SITE = { in_aanbouw: ["In aanbouw", "s-info"], live: ["Online", "s-ok"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"] };
  const ABO = { actief: ["Actief", "s-ok"], handmatig: ["Actief", "s-ok"], wacht_op_betaling: ["Wacht op eerste betaling", "s-let"], betaling_mislukt: ["Betaling niet gelukt", "s-fout"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"], geen: ["Nog niet gestart", "s-grijs"] };
  const label = (map, k) => { const [t, c] = map[k] || [k, "s-grijs"]; return html`<span class="status ${c}">${t}</span>`; };

  SM.onLoggedOut = () => start();

  async function start() {
    try { const me = await api("auth/me"); if (me.user && me.user.role === "klant") return laad(); } catch {}
    const r = await SM.inloggen(app, { portal: "portaal", kop: "Inloggen op je klantenportaal", titel: "Je website, je wijzigingen en je facturen op één plek.", tekst: "Geef wijzigingen door, volg de status en vind je facturen terug." });
    if (r.role !== "klant") { location.href = "/hq/"; return; }
    laad();
  }

  async function laad() {
    try { state = await api("portal/state"); }
    catch (e) { render(app, html`<div class="p-main"><div class="melding melding-fout">${e.message}</div><button class="knop" id="opnieuw">Opnieuw proberen</button></div>`); app.querySelector("#opnieuw").onclick = laad; return; }
    kader();
    route();
  }

  function kader() {
    const c = state.customer;
    render(app, html`
      <header class="p-kop"><div class="binnen">
        <a href="#overzicht" aria-label="Sitemaker klantenportaal"><img src="/assets/brand/logo-compact-wit.png" alt="Sitemaker"></a>
        <div class="wie"><span>${c.company}</span><button class="knop knop-tekst" id="uit">Uitloggen</button></div>
      </div></header>
      <nav class="p-tabs" aria-label="Portaal"><div class="binnen">
        <a href="#overzicht" data-tab="overzicht">Overzicht</a>
        <a href="#wijzigingen" data-tab="wijzigingen">Wijzigingen</a>
        <a href="#facturen" data-tab="facturen">Facturen</a>
      </div></nav>
      <main class="p-main" id="inhoud" tabindex="-1"></main>`);
    app.querySelector("#uit").onclick = SM.uitloggen;
  }

  window.addEventListener("hashchange", () => { if (state) route(); });
  function route() {
    const tab = (location.hash.slice(1) || "overzicht").split("/")[0];
    app.querySelectorAll("[data-tab]").forEach((a) => a.toggleAttribute("aria-current", false));
    const actief = tab === "nieuw" ? "wijzigingen" : tab;
    app.querySelector(`[data-tab="${actief}"]`)?.setAttribute("aria-current", "page");
    const main = app.querySelector("#inhoud");
    ({ overzicht, wijzigingen, nieuw, facturen }[tab] || overzicht)(main);
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
  function overzicht(main) {
    const c = state.customer, u = state.usage;
    const open = state.changes.filter((x) => x.status === "ontvangen" || x.status === "in_behandeling");
    const openFacturen = state.invoices.filter((i) => i.status === "open" || i.status === "vervallen");
    const betaald = new URLSearchParams(location.search).get("betaling");
    render(main, html`
      <div class="p-groet"><h1>Hallo ${c.contactName || c.company}</h1>
        <p>${c.siteUrl ? html`Je website: <a href="${c.siteUrl}" target="_blank" rel="noopener">${c.siteUrl.replace(/^https?:\/\//, "")}</a> ${label(SITE, c.siteStatus)}` : html`Je website ${label(SITE, c.siteStatus)}`}</p></div>
      ${betaald ? html`<div class="melding melding-ok">${raw(icon.ok)}<p>Bedankt! Je betaling wordt verwerkt. Zodra hij binnen is, verschijnt de factuur hieronder.</p></div>` : ""}
      ${state.pendingFirstPayment ? html`<div class="melding melding-let">${raw(icon.let)}<div><p><b>Rond je eerste betaling af.</b> Met de betaling van ${euro(state.pendingFirstPayment.amountCents)}${state.vatNote ? " (incl. btw)" : ""} start je abonnement en de automatische maandbetaling.</p><a class="knop knop-actie knop-klein" href="${state.pendingFirstPayment.url}">Betalen</a></div></div>` : ""}
      <div class="p-raster">
        <div>
          <section class="paneel" aria-labelledby="t-teller">
            <h2 id="t-teller">Wijzigingen deze maand</h2>
            ${teller(u)}${tellerTekst(u)}
            ${state.canSubmit.ok
              ? (u.left > 0 ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a><p class="klein dempen">We verwerken elke wijziging binnen ${state.offer.changeHours} uur.</p>` : html`<p class="dempen">Is het dringend? Neem dan contact met ons op.</p>`)
              : html`<div class="melding melding-let">${raw(icon.let)}<p>${state.canSubmit.reason}</p></div>`}
          </section>
          <section class="paneel" aria-labelledby="t-lopend">
            <div class="paneel-kop"><h2 id="t-lopend">Lopende wijzigingen</h2>${state.changes.length ? html`<a href="#wijzigingen">Alles bekijken</a>` : ""}</div>
            ${open.length ? html`<ul class="lijst">${open.map(wijzigingKort)}</ul>` : html`<p class="dempen">Er staan geen wijzigingen open.</p>`}
          </section>
        </div>
        <div>
          <section class="paneel" aria-labelledby="t-abo">
            <h2 id="t-abo">Je abonnement</h2>
            <dl class="gegevens">
              <dt>Status</dt><dd>${label(ABO, c.billingStatus)}</dd>
              <dt>Per maand</dt><dd class="nummers">${euro(c.monthlyCents)}${state.vatNote ? " " + state.vatNote : ""}</dd>
              <dt>Inbegrepen</dt><dd>Hosting en ${state.offer.changesPerMonth} wijzigingen per maand</dd>
              ${c.subscriptionStart ? html`<dt>Sinds</dt><dd>${datumLang(c.subscriptionStart)}</dd>` : ""}
              ${c.deliveredAt ? html`<dt>Website online</dt><dd>${datumLang(c.deliveredAt)}</dd>` : ""}
            </dl>
          </section>
          <section class="paneel" aria-labelledby="t-fact">
            <div class="paneel-kop"><h2 id="t-fact">Facturen</h2>${state.invoices.length ? html`<a href="#facturen">Alle facturen</a>` : ""}</div>
            ${openFacturen.length ? html`<ul class="lijst">${openFacturen.map(factuurRij)}</ul>`
              : state.invoices.length ? html`<p class="dempen">Alles is betaald. Je laatste factuur: ${state.invoices[0].number} van ${datum(state.invoices[0].date)}.</p>` : html`<p class="dempen">Je hebt nog geen facturen.</p>`}
          </section>
        </div>
      </div>`);
    koppelFactuurKnoppen(main);
  }

  function wijzigingKort(w) {
    const over = SM.over(w.dueAt);
    return html`<li><div class="wijziging-kop"><b>${w.page || "Wijziging"}</b>${label(WIJZIGING, w.status)}</div>
      <p class="wijziging-tekst">${w.description.length > 140 ? w.description.slice(0, 140) + "…" : w.description}</p>
      <div class="wijziging-meta"><span>Doorgegeven ${tijd(w.createdAt)}</span>${over ? html`<span>Klaar binnen ${over}</span>` : ""}</div></li>`;
  }

  // ------------------------------------------------ wijzigingen
  function wijzigingen(main) {
    const u = state.usage;
    render(main, html`
      <div class="hq-kop"><div><h1>Wijzigingen</h1><p>${u.left > 0 ? `Je kunt deze maand nog ${u.left} van de ${u.limit} wijzigingen doorgeven.` : `Je hebt deze maand alle ${u.limit} wijzigingen gebruikt.`}</p></div>
        ${state.canSubmit.ok && u.left > 0 ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}</div>
      <section class="paneel">
        ${state.changes.length ? html`<ul class="lijst">${state.changes.map(wijzigingLang)}</ul>`
          : html`<div class="leeg"><h3>Nog geen wijzigingen</h3><p>Wil je iets aanpassen op je website? Geef het door, dan verwerken we het binnen ${state.offer.changeHours} uur.</p>${state.canSubmit.ok ? html`<a class="knop knop-actie" href="#nieuw">Wijziging doorgeven</a>` : ""}</div>`}
      </section>`);
  }
  function wijzigingLang(w) {
    const over = SM.over(w.dueAt), open = w.status === "ontvangen" || w.status === "in_behandeling";
    return html`<li>
      <div class="wijziging-kop"><b>${w.page || "Wijziging"}</b>${label(WIJZIGING, w.status)}</div>
      <p class="wijziging-tekst">${w.description}</p>
      <div class="wijziging-meta">
        <span>Doorgegeven ${tijd(w.createdAt)}</span>
        ${open && over ? html`<span>Klaar binnen ${over}</span>` : ""}
        ${w.doneAt && w.status === "verwerkt" ? html`<span>Verwerkt ${tijd(w.doneAt)}</span>` : ""}
        ${!w.counts ? html`<span>Telt niet mee voor je ${state.offer.changesPerMonth} wijzigingen</span>` : ""}
        ${w.attachment ? html`<a href="/api/portal/changes/${w.id}/bijlage">${w.attachment.name}</a>` : ""}
      </div>
      ${w.staffNote ? html`<div class="notitie"><b>Sitemaker:</b> ${w.staffNote}</div>` : ""}
    </li>`;
  }

  // ------------------------------------------------ nieuwe wijziging
  function nieuw(main) {
    const u = state.usage;
    if (!state.canSubmit.ok || u.left <= 0) { location.hash = "#wijzigingen"; return; }
    render(main, html`
      <div class="hq-kop"><div><h1>Wijziging doorgeven</h1><p>Je gebruikt hiermee 1 van je ${u.limit} wijzigingen in ${maand(u.month)}. Daarna heb je er nog ${u.left - 1} over.</p></div></div>
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
