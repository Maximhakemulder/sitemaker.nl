// Sitemaker HQ: het eigen dashboard van Sitemaker, gekoppeld aan het klantenportaal en de website.
(() => {
  const { html, raw, render, api, euro, datum, datumLang, tijd, maand, geleden, toast, icon, esc } = SM;
  const app = document.getElementById("app");
  let me = null, badges = {};

  // ------------------------------------------------ labels
  const L = {
    wijziging: { ontvangen: ["Ontvangen", "s-info"], in_behandeling: ["In behandeling", "s-let"], verwerkt: ["Verwerkt", "s-ok"], afgewezen: ["Niet uitgevoerd", "s-grijs"] },
    factuur: { open: ["Openstaand", "s-let"], betaald: ["Betaald", "s-ok"], vervallen: ["Vervallen", "s-fout"], gecrediteerd: ["Gecrediteerd", "s-grijs"] },
    site: { in_aanbouw: ["In aanbouw", "s-info"], live: ["Live", "s-ok"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"] },
    abo: { geen: ["Niet gestart", "s-grijs"], wacht_op_betaling: ["Wacht op 1e betaling", "s-let"], actief: ["Automatisch (Mollie)", "s-ok"], betaling_mislukt: ["Betaling mislukt", "s-fout"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"], handmatig: ["Handmatig gefactureerd", "s-info"] },
    aanvraag: { nieuw: ["Nieuw", "s-fout"], gepland: ["Gepland", "s-info"], klant: ["Klant geworden", "s-ok"], geen_interesse: ["Geen interesse", "s-grijs"] },
    lead: { kandidaat: ["Te onderzoeken", "s-grijs"], nieuw: ["Klaar om te mailen", "s-info"], goedgekeurd: ["In de wachtrij", "s-let"], verstuurd: ["Verstuurd", "s-info"], opvolging_goedgekeurd: ["Opvolging in wachtrij", "s-let"], opgevolgd: ["Opgevolgd", "s-info"], reactie: ["Reactie!", "s-fout"], afspraak: ["Afspraak", "s-ok"], klant: ["Klant", "s-ok"], afgemeld: ["Afgemeld", "s-grijs"], overgeslagen: ["Overgeslagen", "s-grijs"], fout: ["Fout", "s-fout"] },
    betaling: { open: ["Open", "s-let"], pending: ["Bezig", "s-let"], authorized: ["Geautoriseerd", "s-info"], paid: ["Betaald", "s-ok"], failed: ["Mislukt", "s-fout"], canceled: ["Geannuleerd", "s-grijs"], expired: ["Verlopen", "s-grijs"] },
    soort: { eerste: "Bouw + machtiging", abonnement: "Maandtermijn", factuur: "Losse factuur" },
    voorkeur: { "": "Geen voorkeur", ochtend: "Ochtend", middag: "Middag", avond: "Begin van de avond", bellen: "Wil gebeld worden" },
  };
  const chip = (map, k) => { const [t, c] = map[k] || [k, "s-grijs"]; return html`<span class="status ${c}">${t}</span>`; };
  const opties = (map, cur) => Object.entries(map).map(([k, [t]]) => html`<option value="${k}" ${k === cur ? raw("selected") : ""}>${t}</option>`);
  const isAdmin = () => me?.role === "admin";

  // ------------------------------------------------ start en kader
  SM.onLoggedOut = () => start();
  async function start() {
    try { const r = await api("auth/me"); if (r.user && r.user.role !== "klant") { me = r.user; return kader(); } } catch {}
    const r = await SM.inloggen(app, { portal: "hq", kop: "Inloggen op Sitemaker HQ", titel: "Sitemaker HQ", tekst: "Klanten, wijzigingen, facturen, betalingen, sites en B2B op één plek." });
    if (r.role === "klant") { location.href = "/portaal/"; return; }
    const m = await api("auth/me"); me = m.user; kader();
  }

  const NAV = [
    ["overzicht", "Overzicht", '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>'],
    ["klanten", "Klanten", '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
    ["wijzigingen", "Wijzigingen", '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'],
    ["aanvragen", "Aanvragen", '<path d="M4 4h16v12H5.2L4 17.2Z"/>'],
    ["facturen", "Facturen", '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'],
    ["betalingen", "Betalingen", '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'],
    ["sites", "Sites", '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>'],
    ["b2b", "B2B-mail", '<path d="M4 4h16v16H4z"/><path d="m4 6 8 7 8-7"/>', "Acquisitie"],
    ["reviews", "Reviews", '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'],
    ["instellingen", "Instellingen", '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>', "Beheer"],
    ["team", "Team", '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6Z"/>'],
    ["mails", "Verstuurde mails", '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>'],
  ];

  function kader() {
    render(app, html`
      <div class="hq-mobiel"><img src="/assets/brand/logo-compact-wit.png" alt="Sitemaker HQ"><button id="menu" aria-label="Menu openen" aria-expanded="false" aria-controls="zij">${raw(icon.menu)}</button></div>
      <div class="hq">
        <aside class="hq-zij" id="zij">
          <div class="logo"><img src="/assets/brand/logo-compact-wit.png" alt="Sitemaker"><b>HQ</b></div>
          <nav class="hq-nav" aria-label="HQ">${NAV.map(([k, t, svg, kop]) => html`${kop ? html`<div class="tussen">${kop}</div>` : ""}<a href="#${k}" data-nav="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(svg)}</svg>${t}<span class="tel" data-badge="${k}" hidden></span></a>`)}</nav>
          <div class="onder">${me.open ? html`<b>Open modus</b>` : html`${me.email}<br>${me.role === "admin" ? "Beheerder" : "Medewerker"} · <button class="knop knop-tekst" id="uit">Uitloggen</button>`}<br><a href="/" target="_blank" rel="noopener" class="knop-tekst knop">Website bekijken</a></div>
        </aside>
        <div class="hq-rechts">${me.open ? html`<div class="open-balk">Open modus: HQ is zonder inloggen bereikbaar. Dit gaat vanzelf dicht zodra de mail is ingesteld.</div>` : ""}<main class="hq-main" id="inhoud" tabindex="-1"></main></div>
      </div>`);
    if (app.querySelector("#uit")) app.querySelector("#uit").onclick = () => SM.uitloggen();
    const zij = app.querySelector("#zij"), mk = app.querySelector("#menu");
    mk.onclick = () => { const o = zij.classList.toggle("open"); mk.setAttribute("aria-expanded", String(o)); };
    zij.addEventListener("click", (e) => { if (e.target.closest("a")) { zij.classList.remove("open"); mk.setAttribute("aria-expanded", "false"); } });
    window.addEventListener("hashchange", route);
    route();
  }

  function zetBadges(c) {
    badges = { wijzigingen: c.open_wijzigingen, aanvragen: c.nieuwe_aanvragen, b2b: c.leads_reactie, sites: c.offline, betalingen: c.betaling_mislukt };
    app.querySelectorAll("[data-badge]").forEach((el) => { const n = badges[el.dataset.badge]; el.hidden = !n; el.textContent = n || ""; });
  }

  async function route() {
    const [pagina, id] = (location.hash.slice(1) || "overzicht").split("/");
    app.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", false));
    app.querySelector(`[data-nav="${pagina === "klant" ? "klanten" : pagina}"]`)?.setAttribute("aria-current", "page");
    const main = app.querySelector("#inhoud");
    render(main, html`<p class="dempen">Laden…</p>`);
    const fn = { overzicht, klanten, klant, wijzigingen, aanvragen, facturen, betalingen, sites, b2b, reviews, instellingen, team, mails }[pagina] || overzicht;
    try { await fn(main, id); } catch (e) { render(main, html`<div class="melding melding-fout">${raw(icon.let)}<p>${e.message}</p></div>`); }
    window.scrollTo(0, 0);
  }
  const herlaad = () => route();

  // ================================================ OVERZICHT
  async function overzicht(main) {
    const d = await api("hq/overview");
    const c = d.counts; zetBadges(c);
    const kpi = (waarde, naam, href, alarm) => html`<a class="kpi ${alarm ? "alarm" : ""}" href="${href}"><div class="waarde">${waarde}</div><div class="naam">${naam}</div></a>`;
    const nogTeDoen = d.setup.filter((s) => !s.ok);
    render(main, html`
      <div class="hq-kop"><div><h1>Overzicht</h1><p>${new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} · ${maand(d.month)}</p></div>
        <div class="knoppen"><button class="knop knop-actie" id="nieuwe-klant">Nieuwe klant</button></div></div>
      <div class="kpis">
        ${kpi(c.klanten, `klanten (${c.live} live, ${c.in_aanbouw} in aanbouw)`, "#klanten")}
        ${kpi(euro(c.mrr_basis), "aan abonnementen per maand", "#betalingen")}
        ${kpi(c.open_wijzigingen, c.te_laat ? `open wijzigingen, ${c.te_laat} over de 48 uur` : "open wijzigingen", "#wijzigingen", c.te_laat > 0)}
        ${kpi(c.nieuwe_aanvragen, "nieuwe aanvragen via de website", "#aanvragen", c.nieuwe_aanvragen > 0)}
        ${kpi(euro(c.ontvangen_maand), "ontvangen deze maand", "#facturen")}
        ${kpi(`${c.open_facturen} · ${euro(c.open_bedrag)}`, "openstaande facturen", "#facturen")}
        ${kpi(c.betaling_mislukt, "mislukte betalingen", "#betalingen", c.betaling_mislukt > 0)}
        ${kpi(c.offline, "sites offline", "#sites", c.offline > 0)}
      </div>
      <div class="twee">
        <section class="paneel"><div class="paneel-kop"><h2>Wijzigingen te doen</h2><a href="#wijzigingen">Alle wijzigingen</a></div>
          ${d.todo.length ? html`<ul class="lijst">${d.todo.map(todoRij)}</ul>` : html`<p class="dempen">Niets open. Alle wijzigingen zijn verwerkt.</p>`}</section>
        <div>
          <section class="paneel"><div class="paneel-kop"><h2>Nieuwe aanvragen</h2><a href="#aanvragen">Alle aanvragen</a></div>
            ${d.appointments.length ? html`<ul class="lijst">${d.appointments.map((a) => html`<li><a href="#aanvragen"><b>${a.company}</b></a> · ${a.name}<br><span class="klein dempen">${geleden(a.createdAt)} · ${L.voorkeur[a.preference] || ""}</span></li>`)}</ul>` : html`<p class="dempen">Geen nieuwe aanvragen.</p>`}</section>
          <section class="paneel"><h2>B2B deze maand</h2><p class="dempen">${c.leads_verstuurd_30d} mails verstuurd in 30 dagen · ${c.leads_klaar} leads klaar om te mailen · ${c.leads_reactie} reacties te beantwoorden</p><a class="knop knop-licht knop-klein" href="#b2b">Naar B2B</a></section>
          ${nogTeDoen.length ? html`<section class="paneel"><h2>Nog in te stellen</h2><ul class="checklijst">${nogTeDoen.map((s) => html`<li><span class="ic nee">!</span><div>${s.label}<small>${s.hint}</small></div></li>`)}</ul></section>` : ""}
        </div>
      </div>`);
    main.querySelector("#nieuwe-klant").onclick = () => klantDialoog();
  }
  function todoRij(w) {
    const over = SM.over(w.dueAt);
    return html`<li><div class="wijziging-kop"><a href="#klant/${w.customerId}"><b>${w.company}</b></a>${chip(L.wijziging, w.status)}</div>
      <p class="wijziging-tekst">${w.description.length > 160 ? w.description.slice(0, 160) + "…" : w.description}</p>
      <div class="wijziging-meta"><span>${tijd(w.createdAt)}</span>${over ? html`<span>Nog ${over}</span>` : html`<span class="status s-fout">Over de 48 uur</span>`}<a href="#wijzigingen">Afhandelen</a></div></li>`;
  }

  // ================================================ KLANTEN
  async function klanten(main) {
    const { customers } = await api("hq/customers");
    render(main, html`
      <div class="hq-kop"><div><h1>Klanten</h1><p>${customers.length} klanten. Elke klant heeft een eigen portaal.</p></div><button class="knop knop-actie" id="nieuw">Nieuwe klant</button></div>
      <section class="paneel">
        ${customers.length ? html`<div class="veld zoek"><label class="sr" for="zoek">Zoeken</label><input id="zoek" placeholder="Zoek op naam, e-mail of site"></div>
        <div class="tabel-wrap"><table class="tabel"><thead><tr><th>Bedrijf</th><th>Site</th><th>Abonnement</th><th>Wijzigingen</th><th>Open</th></tr></thead>
        <tbody>${customers.map((c) => html`<tr class="klikbaar" data-id="${c.id}" data-zoek="${(c.company + " " + c.email + " " + c.siteUrl).toLowerCase()}">
          <td><b>${c.company}</b><br><span class="klein dempen">${c.email}</span></td>
          <td>${chip(L.site, c.siteStatus)}${c.siteUrl ? html`<br><span class="klein mini-site"><span class="punt ${c.check ? (c.check.ok ? "ok" : "fout") : ""}"></span>${c.siteUrl.replace(/^https?:\/\//, "")}</span>` : ""}</td>
          <td>${chip(L.abo, c.billingStatus)}</td>
          <td class="nummers">${c.usedThisMonth} / 4</td>
          <td class="klein">${c.openChanges ? `${c.openChanges} wijz.` : ""}${c.openChanges && c.openInvoices ? " · " : ""}${c.openInvoices ? `${c.openInvoices} fact.` : ""}</td></tr>`)}</tbody></table></div>`
        : html`<div class="leeg"><h3>Nog geen klanten</h3><p>Maak je eerste klant aan. De klant krijgt een welkomstmail en kan direct inloggen op het portaal.</p><button class="knop knop-actie" id="nieuw2">Nieuwe klant</button></div>`}
      </section>`);
    main.querySelector("#nieuw").onclick = () => klantDialoog();
    main.querySelector("#nieuw2")?.addEventListener("click", () => klantDialoog());
    main.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => (location.hash = "#klant/" + tr.dataset.id)));
    main.querySelector("#zoek")?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      main.querySelectorAll("tr[data-zoek]").forEach((tr) => (tr.hidden = q && !tr.dataset.zoek.includes(q)));
    });
  }

  function klantVelden(c = {}) {
    return html`
      <div class="rij2">
        <div class="veld"><label for="k-company">Bedrijfsnaam</label><input id="k-company" name="company" required value="${c.company || ""}"><div class="fout" data-fout-voor="company"></div></div>
        <div class="veld"><label for="k-contact">Contactpersoon</label><input id="k-contact" name="contactName" value="${c.contactName || ""}"></div>
      </div>
      <div class="rij2">
        <div class="veld"><label for="k-email">E-mailadres</label><input id="k-email" name="email" type="email" required value="${c.email || ""}"><div class="hulp">Hiermee logt de klant in op het portaal.</div><div class="fout" data-fout-voor="email"></div></div>
        <div class="veld"><label for="k-phone">Telefoon <span class="opt">(optioneel)</span></label><input id="k-phone" name="phone" type="tel" value="${c.phone || ""}"></div>
      </div>
      <div class="rij2">
        <div class="veld"><label for="k-site">Website-adres <span class="opt">(optioneel)</span></label><input id="k-site" name="siteUrl" placeholder="www.bedrijf.nl" value="${c.siteUrl || ""}"><div class="fout" data-fout-voor="siteUrl"></div></div>
        <div class="veld"><label for="k-status">Site</label><select id="k-status" name="siteStatus">${opties(L.site, c.siteStatus || "in_aanbouw")}</select></div>
      </div>
      <div class="rij2">
        <div class="veld"><label for="k-opl">Online sinds <span class="opt">(optioneel)</span></label><input id="k-opl" name="deliveredAt" type="date" value="${c.deliveredAt || ""}"></div>
        <div class="veld"><label for="k-kvk">KvK <span class="opt">(optioneel)</span></label><input id="k-kvk" name="kvk" value="${c.kvk || ""}"></div>
      </div>
      <div class="veld"><label for="k-adres">Factuuradres <span class="opt">(optioneel)</span></label><textarea id="k-adres" name="address" rows="2">${c.address || ""}</textarea></div>
      <div class="rij2"><div class="veld"><label for="k-btw">Btw-nummer <span class="opt">(optioneel)</span></label><input id="k-btw" name="vatNumber" value="${c.vatNumber || ""}"></div>
      ${c.id ? html`<div class="veld"><label for="k-bill">Facturatie</label><select id="k-bill" name="billingStatus">${c.billingStatus === "actief" || c.billingStatus === "wacht_op_betaling" || c.billingStatus === "betaling_mislukt" || c.billingStatus === "opgezegd" ? html`<option value="">${L.abo[c.billingStatus][0]} (via Mollie)</option>` : ""}<option value="geen" ${c.billingStatus === "geen" ? raw("selected") : ""}>Niet gestart</option><option value="handmatig" ${c.billingStatus === "handmatig" ? raw("selected") : ""}>Handmatig gefactureerd</option><option value="gepauzeerd" ${c.billingStatus === "gepauzeerd" ? raw("selected") : ""}>Gepauzeerd</option></select></div>` : ""}</div>
      <div class="veld"><label for="k-notes">Interne notities <span class="opt">(alleen zichtbaar in HQ)</span></label><textarea id="k-notes" name="notes" rows="3">${c.notes || ""}</textarea></div>`;
  }

  function klantDialoog(voorvul = {}) {
    const dlg = SM.dialoog("Nieuwe klant", html`<form novalidate>
      <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      ${klantVelden(voorvul)}
      <div class="veld"><label class="vinkje"><input type="checkbox" name="sendWelcome" checked> Stuur een welkomstmail met de link naar het portaal</label></div>
      <div class="knoppen"><button class="knop knop-actie" type="submit">Klant aanmaken</button><button class="knop knop-licht" type="button" data-annuleer>Annuleren</button></div></form>`);
    const form = dlg.querySelector("form");
    dlg.querySelector("[data-annuleer]").onclick = () => dlg.close();
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const b = Object.fromEntries(new FormData(form)); b.sendWelcome = form.elements.sendWelcome.checked;
      if (voorvul.appointmentId) b.appointmentId = voorvul.appointmentId;
      if (voorvul.leadId) b.leadId = voorvul.leadId;
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Aanmaken…");
      try {
        const r = await api("hq/customers", { method: "POST", body: b });
        dlg.close();
        toast(r.welcome ? (r.welcome.ok ? "Klant aangemaakt en welkomstmail verstuurd" : "Klant aangemaakt, maar de welkomstmail lukte niet: " + r.welcome.error) : "Klant aangemaakt", r.welcome && !r.welcome.ok ? "fout" : "ok");
        location.hash = "#klant/" + r.customer.id;
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }

  // ------------------------------------------------ klantdetail
  async function klant(main, id) {
    const d = await api("hq/customers/" + id);
    const c = d.customer, u = d.usage;
    const mollieSub = d.subscription;
    render(main, html`
      <div class="klant-kop"><div><a class="terug" href="#klanten">Alle klanten</a><h1>${c.company}</h1>
        <p class="dempen">${c.contactName ? c.contactName + " · " : ""}${c.email} ${chip(L.site, c.siteStatus)} ${chip(L.abo, c.billingStatus)}</p></div>
        <div class="knoppen"><button class="knop knop-licht" id="bewerk">Gegevens bewerken</button><button class="knop knop-licht" id="als-klant">Bekijk als klant</button><button class="knop knop-licht" id="welkom">Welkomstmail sturen</button>${c.siteUrl ? html`<a class="knop knop-licht" href="${c.siteUrl}" target="_blank" rel="noopener">${raw(icon.open)}Site openen</a>` : ""}</div></div>
      <div class="klant-raster">
        <div>
          <section class="paneel"><h2>Zo ziet de klant het portaal</h2>
            <div class="teller" role="img" aria-label="${u.used} van ${u.limit} wijzigingen gebruikt">${Array.from({ length: u.limit }, (_, i) => html`<span class="${i < u.used ? "gebruikt" : ""}"></span>`)}</div>
            <p class="teller-tekst">Nog ${u.left} van ${u.limit} over<small>${maand(u.month)} · ${d.invoices.length} facturen in het portaal</small></p></section>
          <section class="paneel"><div class="paneel-kop"><h2>Wijzigingen</h2></div>
            ${d.changes.length ? html`<ul class="lijst">${d.changes.map((w) => wijzigingItem({ ...w, company: c.company, customerId: c.id }, false))}</ul>` : html`<p class="dempen">Nog geen wijzigingen doorgegeven.</p>`}</section>
          <section class="paneel"><div class="paneel-kop"><h2>Facturen</h2><button class="knop knop-licht knop-klein" id="factuur-nieuw">Factuur toevoegen</button></div>
            ${d.invoices.length ? factuurTabel(d.invoices, false) : html`<p class="dempen">Nog geen facturen. Facturen van automatische betalingen verschijnen hier vanzelf.</p>`}</section>
          <section class="paneel"><h2>Betalingen</h2>
            ${d.payments.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Datum</th><th>Soort</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>${d.payments.map((p) => html`<tr><td>${tijd(p.createdAt)}</td><td>${L.soort[p.kind] || p.kind}</td><td class="nummers">${euro(p.amountCents)}</td><td>${chip(L.betaling, p.status)}${p.checkoutUrl ? html` <button class="knop knop-tekst knop-klein" data-kopieer="${p.checkoutUrl}">Link kopiëren</button>` : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="dempen">Nog geen betalingen via Mollie.</p>`}</section>
        </div>
        <div>
          <section class="paneel"><h2>Abonnement en betalen</h2>
            <dl class="gegevens"><dt>Status</dt><dd>${chip(L.abo, c.billingStatus)}</dd><dt>Bouw</dt><dd class="nummers">${euro(c.buildCents)}</dd><dt>Per maand</dt><dd class="nummers">${euro(c.monthlyCents)}</dd>
              ${c.subscriptionStart ? html`<dt>Eerste termijn</dt><dd>${datumLang(c.subscriptionStart)}</dd>` : ""}
              ${mollieSub && !mollieSub.error ? html`<dt>Mollie</dt><dd>${mollieSub.status}${mollieSub.nextPaymentDate ? ` · volgende afschrijving ${datum(mollieSub.nextPaymentDate)}` : ""}</dd>` : ""}
              ${mollieSub?.error ? html`<dt>Mollie</dt><dd class="dempen">${mollieSub.error}</dd>` : ""}</dl>
            <p class="klein dempen">Dit zijn de bedragen die de klant betaalt.</p>
            <div class="knoppen">
              ${["geen", "handmatig", "opgezegd", "wacht_op_betaling"].includes(c.billingStatus) ? html`<button class="knop knop-actie knop-klein" id="mollie-start">${c.billingStatus === "wacht_op_betaling" ? "Nieuwe betaallink" : "Automatisch incasseren"}</button>` : ""}
              ${c.mollieSubscriptionId && c.billingStatus !== "opgezegd" && isAdmin() ? html`<button class="knop knop-gevaar knop-klein" id="mollie-stop">Abonnement opzeggen</button>` : ""}
            </div></section>
          <section class="paneel"><div class="paneel-kop"><h2>Website</h2>${c.siteUrl ? html`<button class="knop knop-licht knop-klein" id="check">Nu controleren</button>` : ""}</div>
            <dl class="gegevens"><dt>Adres</dt><dd>${c.siteUrl ? html`<a href="${c.siteUrl}" target="_blank" rel="noopener">${c.siteUrl}</a>` : html`<span class="dempen">Nog niet ingevuld</span>`}</dd>
              <dt>Status</dt><dd>${chip(L.site, c.siteStatus)}</dd>${c.deliveredAt ? html`<dt>Online sinds</dt><dd>${datumLang(c.deliveredAt)}</dd>` : ""}
              <dt>Bereikbaar</dt><dd>${c.check ? html`<span class="mini-site"><span class="punt ${c.check.ok ? "ok" : "fout"}"></span>${c.check.ok ? `Online (${c.check.ms} ms)` : `Niet bereikbaar: ${c.check.error}`}</span><span class="klein dempen">Gecontroleerd ${geleden(c.check.at)}</span>` : html`<span class="dempen">${c.siteStatus === "live" ? "Wordt binnen 15 minuten gecontroleerd" : "Wordt gecontroleerd zodra de site live staat"}</span>`}</dd></dl></section>
          <section class="paneel"><div class="paneel-kop"><h2>Portaaltoegang</h2><button class="knop knop-licht knop-klein" id="gebruiker">Gebruiker toevoegen</button></div>
            <ul class="lijst">${d.users.map((g) => html`<li class="factuur-rij"><div><b>${g.email}</b>${g.active ? "" : html` <span class="status s-grijs">Geblokkeerd</span>`}<br><span class="klein dempen">${g.lastLoginAt ? "Laatst ingelogd " + geleden(g.lastLoginAt) : "Nog niet ingelogd"}</span></div><div><button class="knop knop-tekst knop-klein" data-toegang="${g.id}" data-actief="${g.active ? "0" : "1"}">${g.active ? "Blokkeren" : "Toegang geven"}</button></div></li>`)}</ul></section>
          <section class="paneel"><h2>Gegevens</h2><dl class="gegevens">
            <dt>Telefoon</dt><dd>${c.phone || "–"}</dd><dt>KvK</dt><dd>${c.kvk || "–"}</dd><dt>Btw</dt><dd>${c.vatNumber || "–"}</dd><dt>Adres</dt><dd>${c.address || "–"}</dd><dt>Klant sinds</dt><dd>${datumLang(c.createdAt)}</dd></dl>
            ${c.notes ? html`<div class="notitie">${c.notes}</div>` : ""}</section>
          <section class="paneel"><h2>Logboek</h2>${d.log.length ? html`<ul class="lijst log">${d.log.map((l) => html`<li>${logTekst(l)}<br><span class="dempen">${tijd(l.created_at)}${l.email ? " · " + l.email : ""}</span></li>`)}</ul>` : html`<p class="dempen">Nog niets gebeurd.</p>`}</section>
        </div>
      </div>`);

    main.querySelector("#bewerk").onclick = () => {
      const dlg = SM.dialoog("Gegevens bewerken", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>${klantVelden(c)}<div class="knoppen"><button class="knop knop-actie" type="submit">Opslaan</button></div></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
        try { await api("hq/customers/" + id, { method: "PUT", body: Object.fromEntries(new FormData(form)) }); dlg.close(); toast("Opgeslagen"); herlaad(); }
        catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
      });
    };
    main.querySelector("#als-klant").onclick = async () => {
      try { await api(`hq/customers/${id}/als-klant`, { method: "POST" }); window.open("/portaal/", "_blank", "noopener"); } catch (err) { toast(err.message, "fout"); }
    };
    main.querySelector("#welkom").onclick = async (e) => {
      SM.bezig(e.target, true, "Versturen…");
      try { const r = await api(`hq/customers/${id}/welcome`, { method: "POST" }); toast(r.ok ? "Welkomstmail verstuurd" : r.error, r.ok ? "ok" : "fout"); } catch (err) { toast(err.message, "fout"); }
      SM.bezig(e.target, false);
    };
    main.querySelector("#check")?.addEventListener("click", async (e) => {
      SM.bezig(e.target, true, "Controleren…");
      try { const r = await api(`hq/customers/${id}/check`, { method: "POST" }); toast(r.ok ? `Online (${r.ms} ms)` : `Niet bereikbaar: ${r.error}`, r.ok ? "ok" : "fout"); herlaad(); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    });
    main.querySelector("#gebruiker").onclick = () => {
      const dlg = SM.dialoog("Gebruiker toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <p class="dempen">Deze persoon kan met een code per mail inloggen op het portaal van ${c.company}.</p>
        <div class="veld"><label for="g-email">E-mailadres</label><input id="g-email" name="email" type="email" required><div class="fout" data-fout-voor="email"></div></div>
        <div class="veld"><label for="g-naam">Naam <span class="opt">(optioneel)</span></label><input id="g-naam" name="name"></div>
        <button class="knop knop-actie" type="submit">Toevoegen</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        try { await api(`hq/customers/${id}/users`, { method: "POST", body: Object.fromEntries(new FormData(form)) }); dlg.close(); toast("Gebruiker toegevoegd"); herlaad(); }
        catch (err) { SM.toonFouten(form, err); }
      });
    };
    main.querySelectorAll("[data-toegang]").forEach((b) => b.addEventListener("click", async () => {
      const aan = b.dataset.actief === "1";
      if (!aan && !(await SM.bevestig("Toegang blokkeren?", "Deze gebruiker wordt direct uitgelogd en kan niet meer inloggen op het portaal.", "Blokkeren"))) return;
      try { await api(`hq/customers/${id}/users/${b.dataset.toegang}`, { method: "PUT", body: { active: aan } }); toast(aan ? "Toegang gegeven" : "Toegang geblokkeerd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelector("#mollie-start")?.addEventListener("click", () => mollieDialoog(c));
    main.querySelector("#mollie-stop")?.addEventListener("click", async () => {
      if (!(await SM.bevestig("Abonnement opzeggen?", `Mollie stopt met de maandelijkse afschrijving voor ${c.company}. Dit kun je niet terugdraaien; je kunt later wel een nieuwe incasso starten.`, "Opzeggen"))) return;
      try { await api(`hq/customers/${id}/cancel`, { method: "POST" }); toast("Abonnement opgezegd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    });
    main.querySelector("#factuur-nieuw").onclick = () => factuurDialoog(c.id);
    koppelWijzigingen(main);
    koppelFacturen(main);
    koppelKopieer(main);
  }

  function logTekst(l) {
    const t = { "klant.aangemaakt": "Klant aangemaakt", "klant.bijgewerkt": "Gegevens bijgewerkt", "klant.welkomstmail": "Welkomstmail verstuurd", "wijziging.ingediend": "Wijziging doorgegeven door klant", "wijziging.status": `Wijziging op ${(L.wijziging[l.detail?.to] || [l.detail?.to])[0]} gezet`, "factuur.aangemaakt": `Factuur ${l.detail?.number || ""} aangemaakt`, "factuur.status": `Factuur ${l.detail?.number || ""} op ${l.detail?.to} gezet`, "factuur.pdf": `PDF geüpload bij ${l.detail?.number || ""}`, "betaling.eerste_gestart": "Betaallink voor eerste betaling gemaakt", "betaling.factuurlink": "Betaallink voor factuur gemaakt", "abonnement.gestart": "Automatisch abonnement gestart", "abonnement.opgezegd": "Abonnement opgezegd", "portaal.gebruiker_toegevoegd": `Portaalgebruiker ${l.detail?.email || ""} toegevoegd`, "portaal.gebruiker_geblokkeerd": `Toegang ${l.detail?.email || ""} geblokkeerd`, "portaal.gebruiker_actief": `Toegang ${l.detail?.email || ""} hersteld` };
    return t[l.action] || l.action;
  }

  function mollieDialoog(c) {
    const morgen = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const dlg = SM.dialoog("Automatisch incasseren", html`<form novalidate>
      <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <p>${c.company} betaalt via een Mollie-link de bouwprijs (${euro(c.buildCents)}). Daarmee geeft de klant ook een machtiging, en daarna schrijft Mollie elke maand ${euro(c.monthlyCents)} af. Van elke betaling maakt HQ automatisch een factuur.</p>
      <div class="veld"><label for="m-start">Eerste maandtermijn op</label><input id="m-start" name="startDate" type="date" value="${morgen}"><div class="hulp">Standaard een maand na de eerste betaling. Kies bijvoorbeeld de dag na oplevering.</div></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="sendMail" checked> Stuur de betaallink per mail naar ${c.email}</label></div>
      <button class="knop knop-actie" type="submit">Betaallink maken</button></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Bezig…");
      try {
        const r = await api(`hq/customers/${c.id}/payment`, { method: "POST", body: { startDate: form.elements.startDate.value, sendMail: form.elements.sendMail.checked } });
        render(dlg.querySelector(".d-inhoud"), html`<div class="melding melding-ok">${raw(icon.ok)}<p>Betaallink gemaakt (${euro(r.amountCents)} incl. btw).${r.mailed ? (r.mailed.ok ? " De klant heeft hem per mail ontvangen." : " Mailen lukte niet: " + r.mailed.error) : ""}</p></div>
          <div class="veld"><label for="m-link">Link</label><input id="m-link" readonly value="${r.checkoutUrl}"></div><div class="knoppen"><button class="knop" data-kopieer="${r.checkoutUrl}">Link kopiëren</button></div>`);
        koppelKopieer(dlg);
        dlg.addEventListener("close", herlaad);
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }

  function koppelKopieer(el) {
    el.querySelectorAll("[data-kopieer]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.kopieer); toast("Link gekopieerd"); } catch { toast("Kopiëren lukte niet; selecteer de link handmatig.", "fout"); }
    }));
  }

  // ================================================ WIJZIGINGEN
  let wijzigingFilter = "open";
  async function wijzigingen(main) {
    const { changes } = await api("hq/changes?status=" + (wijzigingFilter === "alle" ? "" : wijzigingFilter));
    const f = [["open", "Open"], ["ontvangen", "Ontvangen"], ["in_behandeling", "In behandeling"], ["verwerkt", "Verwerkt"], ["afgewezen", "Niet uitgevoerd"], ["alle", "Alle"]];
    render(main, html`
      <div class="hq-kop"><div><h1>Wijzigingen</h1><p>Elke wijziging moet binnen 48 uur verwerkt zijn. Zet hem op Verwerkt, dan krijgt de klant automatisch een mail.</p></div></div>
      <div class="filters" role="group" aria-label="Filter">${f.map(([k, t]) => html`<button aria-pressed="${k === wijzigingFilter}" data-f="${k}">${t}</button>`)}</div>
      <section class="paneel">${changes.length ? html`<ul class="lijst">${changes.map((w) => wijzigingItem(w, true))}</ul>` : html`<div class="leeg"><h3>Niets in deze lijst</h3><p>${wijzigingFilter === "open" ? "Alle wijzigingen zijn verwerkt." : "Er zijn geen wijzigingen met deze status."}</p></div>`}</section>`);
    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { wijzigingFilter = b.dataset.f; wijzigingen(main); }));
    koppelWijzigingen(main);
  }

  function wijzigingItem(w, metKlant) {
    const open = w.status === "ontvangen" || w.status === "in_behandeling";
    const over = SM.over(w.dueAt);
    return html`<li data-wijziging="${w.id}">
      <div class="wijziging-kop"><div>${metKlant ? html`<a href="#klant/${w.customerId}"><b>${w.company}</b></a> · ` : ""}<b>${w.page || "Wijziging"}</b></div>${chip(L.wijziging, w.status)}</div>
      <p class="wijziging-tekst">${w.description}</p>
      <div class="wijziging-meta"><span>Doorgegeven ${tijd(w.createdAt)}${w.byEmail ? " door " + w.byEmail : ""}</span>
        ${open ? (over ? html`<span>Deadline over ${over}</span>` : html`<span class="status s-fout">Over de 48 uur</span>`) : ""}
        ${w.attachment ? html`<a href="/api/hq/changes/${w.id}/bijlage">${raw(icon.download)} ${w.attachment.name} (${SM.bytes(w.attachment.size)})</a>` : ""}
        ${!w.counts ? html`<span>Telt niet mee</span>` : ""}</div>
      <form class="wijziging-form" novalidate>
        <div class="rij3">
          <div class="veld"><label for="ws-${w.id}">Status</label><select id="ws-${w.id}" name="status">${opties(L.wijziging, w.status)}</select></div>
          <div class="veld"><label for="wn-${w.id}">Toelichting voor de klant</label><input id="wn-${w.id}" name="staffNote" value="${w.staffNote || ""}"></div>
          <div class="veld"><span class="label">&nbsp;</span><label class="vinkje"><input type="checkbox" name="counts" ${w.counts ? raw("checked") : ""}> Telt mee voor de 4</label></div>
        </div>
        <div class="knoppen"><button class="knop knop-klein" type="submit">Opslaan</button><label class="vinkje klein"><input type="checkbox" name="notify" checked> Klant mailen bij Verwerkt of Niet uitgevoerd</label></div>
      </form></li>`;
  }
  function koppelWijzigingen(main) {
    main.querySelectorAll("[data-wijziging] form").forEach((form) => form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = form.closest("[data-wijziging]").dataset.wijziging;
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
      try {
        const r = await api("hq/changes/" + id, { method: "PUT", body: { status: form.elements.status.value, staffNote: form.elements.staffNote.value, counts: form.elements.counts.checked, notify: form.elements.notify.checked } });
        toast(r.mailed ? (r.mailed.ok ? "Opgeslagen, klant is gemaild" : "Opgeslagen, maar mailen lukte niet") : "Opgeslagen");
        herlaad();
      } catch (err) { toast(err.message, "fout"); SM.bezig(knop, false); }
    }));
  }

  // ================================================ AANVRAGEN
  async function aanvragen(main) {
    const { appointments } = await api("hq/appointments");
    render(main, html`
      <div class="hq-kop"><div><h1>Aanvragen via de website</h1><p>Alles wat via het formulier "Plan een kennismaking" binnenkomt. De aanvrager heeft een bevestiging per mail gekregen.</p></div></div>
      <section class="paneel">${appointments.length ? html`<ul class="lijst">${appointments.map((a) => html`<li data-aanvraag="${a.id}">
        <div class="wijziging-kop"><div><b>${a.company}</b> · ${a.name}</div>${chip(L.aanvraag, a.status)}</div>
        <div class="wijziging-meta"><a href="mailto:${a.email}">${a.email}</a>${a.phone ? html`<a href="tel:${a.phone}">${a.phone}</a>` : ""}<span>${L.voorkeur[a.preference] || ""}</span><span>${tijd(a.createdAt)}</span></div>
        ${a.message ? html`<p class="wijziging-tekst">${a.message}</p>` : ""}
        <form novalidate><div class="rij2"><div class="veld"><label for="as-${a.id}">Status</label><select id="as-${a.id}" name="status">${opties(L.aanvraag, a.status)}</select></div>
          <div class="veld"><label for="an-${a.id}">Notitie</label><input id="an-${a.id}" name="staffNote" value="${a.staffNote || ""}"></div></div>
          <div class="knoppen"><button class="knop knop-klein" type="submit">Opslaan</button>${a.customerId ? html`<a class="knop knop-licht knop-klein" href="#klant/${a.customerId}">Naar klant</a>` : html`<button class="knop knop-actie knop-klein" type="button" data-klant>Maak klant aan</button>`}</div></form></li>`)}</ul>`
        : html`<div class="leeg"><h3>Nog geen aanvragen</h3><p>Aanvragen via het formulier op de website verschijnen hier direct, en je krijgt een melding per mail.</p></div>`}</section>`);
    main.querySelectorAll("[data-aanvraag]").forEach((li) => {
      const a = appointments.find((x) => String(x.id) === li.dataset.aanvraag);
      li.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("hq/appointments/" + a.id, { method: "PUT", body: Object.fromEntries(new FormData(e.target)) }); toast("Opgeslagen"); herlaad(); } catch (err) { toast(err.message, "fout"); }
      });
      li.querySelector("[data-klant]")?.addEventListener("click", () => klantDialoog({ company: a.company, contactName: a.name, email: a.email, phone: a.phone, notes: a.message, appointmentId: a.id }));
    });
  }

  // ================================================ FACTUREN
  async function facturen(main) {
    const { invoices } = await api("hq/invoices");
    render(main, html`
      <div class="hq-kop"><div><h1>Facturen</h1><p>Facturen van automatische betalingen komen hier vanzelf bij. Losse facturen voeg je zelf toe.</p></div><button class="knop knop-actie" id="nieuw">Factuur toevoegen</button></div>
      <section class="paneel">${invoices.length ? factuurTabel(invoices, true) : html`<div class="leeg"><h3>Nog geen facturen</h3><p>Voeg een factuur toe met een eigen PDF, of laat HQ de PDF maken in de Sitemaker-huisstijl.</p></div>`}</section>`);
    main.querySelector("#nieuw").onclick = () => factuurDialoog();
    koppelFacturen(main);
  }
  function factuurTabel(invoices, metKlant) {
    return html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Nummer</th>${metKlant ? html`<th>Klant</th>` : ""}<th>Datum</th><th class="rechts">Bedrag</th><th>Status</th><th class="acties">Acties</th></tr></thead><tbody>
      ${invoices.map((i) => html`<tr data-factuur="${i.id}"><td><b>${i.number}</b><br><span class="klein dempen">${i.description}</span></td>${metKlant ? html`<td><a href="#klant/${i.customerId}">${i.company}</a></td>` : ""}
        <td class="nowrap">${datum(i.date)}</td><td class="rechts nummers nowrap">${euro(i.amountCents)}</td>
        <td><select aria-label="Status ${i.number}" data-status>${opties(L.factuur, i.status)}</select></td>
        <td class="acties">${i.hasPdf ? html`<a class="knop knop-tekst knop-klein" href="/api/hq/invoices/${i.id}/pdf?inline=1" target="_blank" rel="noopener">PDF</a>` : html`<button class="knop knop-tekst knop-klein" data-genereer>PDF maken</button>`}
          <button class="knop knop-tekst knop-klein" data-upload>PDF uploaden</button><button class="knop knop-tekst knop-klein" data-mail>Mailen</button>${i.status === "open" ? html`<button class="knop knop-tekst knop-klein" data-betaallink>Betaallink</button>` : ""}
          ${i.sentAt ? html`<br><span class="klein dempen">Gemaild ${datum(i.sentAt)}</span>` : ""}</td></tr>`)}</tbody></table></div>`;
  }
  function koppelFacturen(main) {
    main.querySelectorAll("[data-factuur]").forEach((tr) => {
      const id = tr.dataset.factuur;
      tr.querySelector("[data-status]").addEventListener("change", async (e) => {
        try { await api("hq/invoices/" + id, { method: "PUT", body: { status: e.target.value } }); toast("Status bijgewerkt"); } catch (err) { toast(err.message, "fout"); }
      });
      tr.querySelector("[data-genereer]")?.addEventListener("click", async (e) => {
        SM.bezig(e.target, true, "Maken…");
        try { const r = await api(`hq/invoices/${id}/generate`, { method: "POST" }); if (r.ok) { toast("PDF gemaakt"); herlaad(); } else { toast(r.reason, "fout"); SM.bezig(e.target, false); } } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
      });
      tr.querySelector("[data-mail]").addEventListener("click", async (e) => {
        if (!(await SM.bevestig("Factuur mailen?", "De klant krijgt een mail dat de factuur in het portaal staat.", "Mailen"))) return;
        try { const r = await api(`hq/invoices/${id}/send`, { method: "POST" }); toast(r.ok ? "Gemaild" : r.error, r.ok ? "ok" : "fout"); herlaad(); } catch (err) { toast(err.message, "fout"); }
      });
      tr.querySelector("[data-betaallink]")?.addEventListener("click", async (e) => {
        SM.bezig(e.target, true, "…");
        try { const r = await api(`hq/invoices/${id}/paylink`, { method: "POST" }); SM.dialoog("Betaallink", html`<p>Deze link kun je naar de klant sturen. De klant kan ook zelf betalen vanuit het portaal.</p><div class="veld"><input readonly value="${r.checkoutUrl}" aria-label="Betaallink"></div><button class="knop" data-kopieer="${r.checkoutUrl}">Link kopiëren</button>`); koppelKopieer(document.querySelector("dialog")); }
        catch (err) { toast(err.message, "fout"); }
        SM.bezig(e.target, false);
      });
      tr.querySelector("[data-upload]").addEventListener("click", () => {
        const dlg = SM.dialoog("PDF uploaden", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden></div><div class="veld"><label for="u-pdf">PDF-bestand (max. 4 MB)</label><input id="u-pdf" type="file" name="file" accept="application/pdf" required></div><button class="knop knop-actie" type="submit">Uploaden</button></form>`);
        dlg.querySelector("form").addEventListener("submit", async (e) => {
          e.preventDefault();
          try { await api(`hq/invoices/${id}/pdf`, { method: "POST", form: new FormData(e.target) }); dlg.close(); toast("PDF opgeslagen; de klant ziet hem in het portaal"); herlaad(); } catch (err) { SM.toonFouten(e.target, err); }
        });
      });
    });
  }

  async function factuurDialoog(klantId) {
    const { customers } = await api("hq/customers");
    if (!customers.length) { toast("Maak eerst een klant aan.", "fout"); return; }
    const vandaag = new Date().toISOString().slice(0, 10);
    const dlg = SM.dialoog("Factuur toevoegen", html`<form novalidate>
      <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <div class="veld"><label for="f-klant">Klant</label><select id="f-klant" name="customerId">${customers.map((c) => html`<option value="${c.id}" ${String(c.id) === String(klantId) ? raw("selected") : ""}>${c.company}</option>`)}</select><div class="fout" data-fout-voor="customerId"></div></div>
      <div class="veld"><label for="f-oms">Omschrijving</label><input id="f-oms" name="description" required placeholder="Bijvoorbeeld: Abonnement november"></div>
      <div class="rij3">
        <div class="veld"><label for="f-bedrag">Totaal incl. btw</label><input id="f-bedrag" name="amount" inputmode="decimal" placeholder="84,64" required><div class="fout" data-fout-voor="amount"></div></div>
        <div class="veld"><label for="f-btw">Btw</label><select id="f-btw" name="vatRate"><option value="21">21%</option><option value="9">9%</option><option value="0">0%</option></select></div>
        <div class="veld"><label for="f-datum">Datum</label><input id="f-datum" name="date" type="date" value="${vandaag}"></div>
      </div>
      <div class="rij2">
        <div class="veld"><label for="f-status">Status</label><select id="f-status" name="status"><option value="open">Openstaand</option><option value="betaald">Al betaald</option></select></div>
        <div class="veld"><label for="f-nr">Factuurnummer <span class="opt">(leeg = automatisch)</span></label><input id="f-nr" name="number"><div class="fout" data-fout-voor="number"></div></div>
      </div>
      <div class="veld"><label for="f-pdf">Eigen PDF <span class="opt">(optioneel)</span></label><input id="f-pdf" type="file" name="file" accept="application/pdf"><div class="fout" data-fout-voor="file"></div></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="generate" value="1" checked> Geen eigen PDF? Laat HQ de PDF maken in de Sitemaker-huisstijl</label></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="send" value="1"> Klant direct mailen dat de factuur klaarstaat</label></div>
      <button class="knop knop-actie" type="submit">Factuur opslaan</button></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const fd = new FormData(form);
      if (form.elements.file.files.length) fd.delete("generate");
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
      try {
        const r = await api("hq/invoices", { method: "POST", form: fd });
        dlg.close();
        toast(r.pdf && !r.pdf.ok ? `Factuur ${r.invoice.number} opgeslagen. PDF niet gemaakt: ${r.pdf.reason}` : `Factuur ${r.invoice.number} opgeslagen`, r.pdf && !r.pdf.ok ? "fout" : "ok");
        herlaad();
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }

  // ================================================ BETALINGEN
  async function betalingen(main) {
    const d = await api("hq/payments");
    render(main, html`
      <div class="hq-kop"><div><h1>Betalingen</h1><p>Automatische incasso via Mollie: eerste betaling (bouwprijs en machtiging), daarna elke maand het abonnement.</p></div></div>
      ${!d.mollie.ready ? html`<div class="melding melding-let">${raw(icon.let)}<p><b>Mollie is nog niet gekoppeld.</b> Zet MOLLIE_API_KEY in Netlify (begin met een test-sleutel). Tot die tijd kun je klanten op "Handmatig gefactureerd" zetten en losse facturen toevoegen.</p></div>`
        : d.mollie.mode === "test" ? html`<div class="melding melding-info">${raw(icon.let)}<p>Mollie draait in <b>testmodus</b>: er wordt niets echt afgeschreven.</p></div>` : ""}
      ${!d.vatSet ? html`<div class="melding melding-let">${raw(icon.let)}<p>Kies eerst bij <a href="#instellingen">Instellingen</a> of de prijzen inclusief of exclusief btw zijn. Daarvan hangt af wat Mollie afschrijft.</p></div>` : ""}
      <section class="paneel"><h2>Abonnementen</h2>
        ${d.subscriptions.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Klant</th><th>Status</th><th class="rechts">Per maand</th><th class="rechts">Afschrijving incl. btw</th><th>Start</th></tr></thead><tbody>
          ${d.subscriptions.map((s) => html`<tr><td><a href="#klant/${s.id}">${s.company}</a></td><td>${chip(L.abo, s.status)}</td><td class="rechts nummers">${euro(s.monthlyCents)}</td><td class="rechts nummers">${s.grossCents != null ? euro(s.grossCents) : "–"}</td><td>${s.start ? datum(s.start) : "–"}</td></tr>`)}</tbody></table></div>`
          : html`<p class="dempen">Nog geen abonnementen. Start er een vanaf de pagina van een klant met "Automatisch incasseren".</p>`}</section>
      <section class="paneel"><h2>Laatste betalingen</h2>
        ${d.payments.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Datum</th><th>Klant</th><th>Soort</th><th class="rechts">Bedrag</th><th>Status</th></tr></thead><tbody>
          ${d.payments.map((p) => html`<tr><td class="nowrap">${tijd(p.createdAt)}</td><td><a href="#klant/${p.customerId}">${p.company}</a></td><td>${L.soort[p.kind] || p.kind}</td><td class="rechts nummers">${euro(p.amountCents)}</td><td>${chip(L.betaling, p.status)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="dempen">Nog geen betalingen.</p>`}</section>`);
  }

  // ================================================ SITES
  async function sites(main) {
    const { sites } = await api("hq/sites");
    render(main, html`
      <div class="hq-kop"><div><h1>Sites</h1><p>Alle klantsites. Live sites worden elke 15 minuten gecontroleerd; bij twee mislukte controles op rij krijg je een mail.</p></div></div>
      <section class="paneel">${sites.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Klant</th><th>Adres</th><th>Status</th><th>Bereikbaar</th><th class="acties"></th></tr></thead><tbody>
        ${sites.map((s) => html`<tr><td><a href="#klant/${s.id}"><b>${s.company}</b></a></td><td>${s.siteUrl ? html`<a href="${s.siteUrl}" target="_blank" rel="noopener">${s.siteUrl.replace(/^https?:\/\//, "")}</a>` : html`<span class="dempen">–</span>`}</td>
          <td>${chip(L.site, s.siteStatus)}</td>
          <td>${s.check ? html`<span class="mini-site"><span class="punt ${s.check.ok ? "ok" : "fout"}"></span>${s.check.ok ? `${s.check.ms} ms` : s.check.error}</span><span class="klein dempen">${geleden(s.check.at)}</span>` : html`<span class="dempen">Nog niet gecontroleerd</span>`}</td>
          <td class="acties">${s.siteUrl ? html`<button class="knop knop-licht knop-klein" data-check="${s.id}">Nu controleren</button>` : ""}</td></tr>`)}</tbody></table></div>`
        : html`<div class="leeg"><h3>Nog geen sites</h3><p>Vul bij een klant het website-adres in en zet de site op Live.</p></div>`}</section>`);
    main.querySelectorAll("[data-check]").forEach((b) => b.addEventListener("click", async () => {
      SM.bezig(b, true, "Controleren…");
      try { const r = await api(`hq/customers/${b.dataset.check}/check`, { method: "POST" }); toast(r.ok ? `Online (${r.ms} ms)` : `Niet bereikbaar: ${r.error}`, r.ok ? "ok" : "fout"); herlaad(); } catch (e) { toast(e.message, "fout"); SM.bezig(b, false); }
    }));
  }

  // ================================================ B2B
  let leadFilter = "nieuw";
  async function b2b(main) {
    const d = await api("hq/leads?status=" + (leadFilter === "alle" ? "" : leadFilter));
    const c = d.counts;
    const n = (k) => c[k] || 0;
    const filters = [["nieuw", "Klaar om te mailen"], ["goedgekeurd", "Wachtrij"], ["verstuurd", "Verstuurd"], ["opgevolgd", "Opgevolgd"], ["reactie", "Reacties"], ["afspraak", "Afspraak"], ["kandidaat", "Te onderzoeken"], ["overgeslagen", "Overgeslagen"], ["afgemeld", "Afgemeld"], ["fout", "Fout"], ["alle", "Alle"]];
    const opvolgKlaar = d.followupDue.length;
    render(main, html`
      <div class="hq-kop"><div><h1>B2B-mail</h1><p>Bedrijven benaderen per mail. Niets gaat de deur uit zonder jouw goedkeuring; afmelden kan altijd met één klik. Vandaag verstuurd: ${d.sentToday} van max. ${d.dailyMax}.</p></div>
        <div class="knoppen"><button class="knop knop-actie" id="lead-nieuw">Lead toevoegen</button><button class="knop knop-licht" id="lead-import">CSV importeren</button>${d.ready.scout ? html`<button class="knop knop-licht" id="scout">Scout nu zoeken</button>` : ""}</div></div>
      ${!d.ready.mail ? html`<div class="melding melding-let">${raw(icon.let)}<p>Mail is nog niet ingesteld (MAIL_USER/MAIL_PASSWORD). Goedgekeurde mails blijven in de wachtrij tot dat geregeld is.</p></div>` : ""}
      ${!d.ready.company ? html`<div class="melding melding-let">${raw(icon.let)}<p>Vul bij <a href="#instellingen">Instellingen</a> je bedrijfsnaam en KvK-nummer in; die staan verplicht onder elke zakelijke mail.</p></div>` : ""}
      ${opvolgKlaar ? html`<div class="melding melding-info">${raw(icon.let)}<div><p><b>${opvolgKlaar} leads</b> zijn langer dan je opvolgtermijn geleden gemaild zonder reactie.</p><button class="knop knop-klein" id="opvolgen">Opvolging goedkeuren</button></div></div>` : ""}
      <div class="filters" role="group" aria-label="Filter">${filters.map(([k, t]) => html`<button aria-pressed="${k === leadFilter}" data-f="${k}">${t}${k !== "alle" ? html`<span class="n">${k === "opgevolgd" ? n("opgevolgd") + n("opvolging_goedgekeurd") : n(k)}</span>` : ""}</button>`)}</div>
      <section class="paneel">${d.leads.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th><input type="checkbox" class="selecteer" id="alles" aria-label="Alles selecteren"></th><th>Bedrijf</th><th>E-mail</th><th>Plaats / branche</th><th>Status</th><th>Laatst</th></tr></thead><tbody>
        ${d.leads.map((l) => html`<tr class="klikbaar" data-lead="${l.id}"><td><input type="checkbox" class="selecteer" value="${l.id}" aria-label="Selecteer ${l.company}"></td>
          <td><b>${l.company}</b>${l.intro ? html`<br><span class="klein dempen">Met openingszin</span>` : ""}${l.rejectReason && l.status === "overgeslagen" ? html`<br><span class="klein dempen">${l.rejectReason}</span>` : ""}</td>
          <td class="klein">${l.email || html`<span class="dempen">–</span>`}</td><td class="klein">${[l.city, l.category].filter(Boolean).join(" · ")}</td>
          <td>${chip(L.lead, l.status)}${l.error ? html`<br><span class="klein dempen">${l.error}</span>` : ""}</td><td class="klein nowrap">${geleden(l.updatedAt)}</td></tr>`)}</tbody></table></div>
        <div class="balk-acties" id="balk" hidden><span id="aantal"></span>
          <button class="knop knop-actie knop-klein" data-actie="goedkeuren">Goedkeuren voor verzending</button>
          <button class="knop knop-licht knop-klein" data-actie="opvolgen">Opvolging goedkeuren</button>
          <button class="knop knop-licht knop-klein" data-actie="terug">Uit wachtrij</button>
          <button class="knop knop-licht knop-klein" data-actie="overslaan">Overslaan</button>
          <button class="knop knop-licht knop-klein" data-actie="verwijderen">Verwijderen</button></div>`
        : html`<div class="leeg"><h3>Geen leads in deze lijst</h3><p>Voeg leads toe, importeer een CSV${d.ready.scout ? " of laat de scout zoeken" : ""}.</p></div>`}</section>
      <p class="klein dempen">Mailteksten, verzendtijden en de scout stel je in bij <a href="#instellingen">Instellingen</a>. ${d.ready.ai ? "Openingszinnen worden met AI geschreven op basis van de eigen website van het bedrijf." : ""}</p>`);

    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { leadFilter = b.dataset.f; b2b(main); }));
    main.querySelector("#lead-nieuw").onclick = () => leadToevoegen();
    main.querySelector("#lead-import").onclick = () => leadImport();
    main.querySelector("#scout")?.addEventListener("click", async (e) => { SM.bezig(e.target, true, "Zoeken…"); try { await api("hq/scout", { method: "POST" }); toast("Zoekopdrachten gestart; resultaten komen binnen het uur binnen."); } catch (err) { toast(err.message, "fout"); } SM.bezig(e.target, false); });
    main.querySelector("#opvolgen")?.addEventListener("click", async () => {
      if (!(await SM.bevestig("Opvolging goedkeuren?", `${opvolgKlaar} leads krijgen de opvolgmail, verspreid over de verzendtijden.`, "Goedkeuren"))) return;
      try { const r = await api("hq/leads/action", { method: "POST", body: { action: "opvolgen", ids: d.followupDue } }); toast(`${r.changed} opvolgmails in de wachtrij`); herlaad(); } catch (err) { toast(err.message, "fout"); }
    });
    const balk = main.querySelector("#balk"), aantal = main.querySelector("#aantal");
    const gekozen = () => [...main.querySelectorAll("tbody .selecteer:checked")].map((x) => Number(x.value));
    const update = () => { const n = gekozen().length; if (balk) { balk.hidden = !n; aantal.textContent = `${n} geselecteerd`; } };
    main.querySelector("#alles")?.addEventListener("change", (e) => { main.querySelectorAll("tbody .selecteer").forEach((x) => (x.checked = e.target.checked)); update(); });
    main.querySelectorAll("tbody .selecteer").forEach((x) => { x.addEventListener("change", update); x.addEventListener("click", (e) => e.stopPropagation()); });
    main.querySelectorAll("[data-actie]").forEach((b) => b.addEventListener("click", async () => {
      const ids = gekozen();
      if (b.dataset.actie === "verwijderen" && !(await SM.bevestig("Leads verwijderen?", "Alleen leads die nog niet gemaild zijn worden verwijderd.", "Verwijderen"))) return;
      try { const r = await api("hq/leads/action", { method: "POST", body: { action: b.dataset.actie, ids } }); toast(`${r.changed} leads bijgewerkt`); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelectorAll("tr[data-lead]").forEach((tr) => tr.addEventListener("click", () => leadDetail(d.leads.find((l) => String(l.id) === tr.dataset.lead))));
  }

  function leadToevoegen() {
    const dlg = SM.dialoog("Lead toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <p class="dempen">Alleen algemene, openbare bedrijfsadressen (zoals info@). Laat het e-mailadres leeg als je alleen de website weet; dan zoekt HQ het adres op de site.</p>
      <div class="veld"><label for="n-bedrijf">Bedrijfsnaam</label><input id="n-bedrijf" name="company"></div>
      <div class="rij2"><div class="veld"><label for="n-email">E-mailadres</label><input id="n-email" name="email" type="email"></div><div class="veld"><label for="n-site">Website</label><input id="n-site" name="website"></div></div>
      <div class="rij2"><div class="veld"><label for="n-plaats">Plaats</label><input id="n-plaats" name="city"></div><div class="veld"><label for="n-cat">Branche</label><input id="n-cat" name="category"></div></div>
      <button class="knop knop-actie" type="submit">Toevoegen</button></form>`);
    dlg.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const r = await api("hq/leads", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); dlg.close(); toast(r.duplicate ? "Deze lead bestond al" : "Lead toegevoegd"); herlaad(); } catch (err) { SM.toonFouten(e.target, err); }
    });
  }
  function leadImport() {
    const dlg = SM.dialoog("CSV importeren", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <p class="dempen">Plak een lijst of kies een CSV-bestand met een kopregel, bijvoorbeeld: <code>bedrijf;email;website;plaats;categorie</code>. Dubbele en afgemelde adressen worden overgeslagen.</p>
      <div class="veld"><label for="i-bestand">CSV-bestand</label><input id="i-bestand" type="file" accept=".csv,text/csv,text/plain"></div>
      <div class="veld"><label for="i-tekst">Of plak hier</label><textarea id="i-tekst" name="csv" rows="8"></textarea></div>
      <button class="knop knop-actie" type="submit">Importeren</button></form>`);
    const form = dlg.querySelector("form");
    form.querySelector("#i-bestand").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) form.elements.csv.value = await f.text(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const r = await api("hq/leads/import", { method: "POST", body: { csv: form.elements.csv.value } }); dlg.close(); toast(`${r.added} toegevoegd, ${r.duplicates} dubbel, ${r.skipped} overgeslagen`); herlaad(); } catch (err) { SM.toonFouten(form, err); }
    });
  }
  async function leadDetail(l) {
    const kind = ["verstuurd", "opvolging_goedgekeurd", "opgevolgd"].includes(l.status) ? "opvolging" : "eerste";
    const dlg = SM.dialoog(l.company, html`
      <p>${chip(L.lead, l.status)} ${l.website ? html`<a href="${l.website}" target="_blank" rel="noopener">${l.website.replace(/^https?:\/\//, "")}</a>` : ""} ${l.phone ? html` · <a href="tel:${l.phone}">${l.phone}</a>` : ""}</p>
      ${l.replySnippet ? html`<div class="notitie"><b>Reactie ${tijd(l.replyAt)}:</b> ${l.replySnippet}</div>` : ""}
      ${l.researchNote ? html`<p class="klein dempen">Research: ${l.researchNote}</p>` : ""}
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2"><div class="veld"><label for="d-bedrijf">Bedrijfsnaam</label><input id="d-bedrijf" name="company" value="${l.company}"></div><div class="veld"><label for="d-email">E-mailadres</label><input id="d-email" name="email" type="email" value="${l.email || ""}"></div></div>
        <div class="rij3"><div class="veld"><label for="d-plaats">Plaats</label><input id="d-plaats" name="city" value="${l.city}"></div><div class="veld"><label for="d-cat">Branche</label><input id="d-cat" name="category" value="${l.category}"></div><div class="veld"><label for="d-tel">Telefoon</label><input id="d-tel" name="phone" value="${l.phone}"></div></div>
        <div class="veld"><label for="d-intro">Openingszin <span class="opt">(komt bovenaan de eerste mail)</span></label><textarea id="d-intro" name="intro" rows="2">${l.intro}</textarea></div>
        <div class="veld"><label for="d-notes">Notities</label><input id="d-notes" name="notes" value="${l.notes}"></div>
        <div class="knoppen"><button class="knop" type="submit">Opslaan</button>${l.website ? html`<button class="knop knop-licht" type="button" data-onderzoek>Website opnieuw onderzoeken</button>` : ""}
          ${["reactie", "afspraak", "verstuurd", "opgevolgd"].includes(l.status) ? html`<button class="knop knop-actie" type="button" data-klant>Maak klant aan</button><button class="knop knop-licht" type="button" data-afspraak>Afspraak gepland</button>` : ""}
          <button class="knop knop-gevaar" type="button" data-afmelden>Nooit meer mailen</button></div></form>
      <h3>Voorbeeld ${kind === "opvolging" ? "opvolgmail" : "eerste mail"}</h3><div class="preview" id="preview">Laden…</div>`, { breed: true });
    const form = dlg.querySelector("form");
    const toonPreview = async () => { try { const p = await api(`hq/leads/${l.id}/preview?kind=${kind}`); dlg.querySelector("#preview").textContent = `Onderwerp: ${p.subject}\n\n${p.body}`; } catch (e) { dlg.querySelector("#preview").textContent = e.message; } };
    toonPreview();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("hq/leads/" + l.id, { method: "PUT", body: Object.fromEntries(new FormData(form)) }); toast("Opgeslagen"); toonPreview(); dlg.addEventListener("close", herlaad, { once: true }); } catch (err) { SM.toonFouten(form, err); }
    });
    const act = async (action, msg) => { try { await api("hq/leads/action", { method: "POST", body: { action, ids: [l.id] } }); toast(msg); dlg.close(); herlaad(); } catch (err) { toast(err.message, "fout"); } };
    form.querySelector("[data-onderzoek]")?.addEventListener("click", async (e) => { SM.bezig(e.target, true, "Onderzoeken…"); try { const r = await api("hq/leads/action", { method: "POST", body: { action: "onderzoeken", ids: [l.id] } }); toast(r.email ? `Gevonden: ${r.email}` : `Niet bruikbaar: ${r.reason || "geen adres"}`, r.email ? "ok" : "fout"); dlg.close(); herlaad(); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); } });
    form.querySelector("[data-afspraak]")?.addEventListener("click", () => act("afspraak", "Op afspraak gezet"));
    form.querySelector("[data-afmelden]").addEventListener("click", async () => { if (await SM.bevestig("Nooit meer mailen?", `${l.email || l.company} komt op de afmeldlijst en krijgt geen B2B-mail meer.`, "Afmelden")) act("afmelden", "Afgemeld"); });
    form.querySelector("[data-klant]")?.addEventListener("click", () => { dlg.close(); klantDialoog({ company: l.company, email: l.email, phone: l.phone, siteUrl: l.website, notes: l.notes, leadId: l.id }); });
  }

  // ================================================ REVIEWS
  async function reviews(main) {
    const [{ reviews: lijst }, { customers }] = await Promise.all([api("hq/reviews"), api("hq/customers")]);
    const st = (n) => "★".repeat(n) + "☆".repeat(5 - n);
    render(main, html`
      <div class="hq-kop"><div><h1>Reviews</h1><p>Echte reviews van klanten. Gepubliceerde reviews verschijnen op de website; gekoppeld aan een klant = "Geverifieerde klant".</p></div><button class="knop knop-actie" id="nieuw">Review toevoegen</button></div>
      <p class="klein dempen">De opmaak op de website bekijken met invulteksten: <a href="/?reviews=voorbeeld#reviews" target="_blank" rel="noopener">voorbeeldweergave</a>.</p>
      <section class="paneel">${lijst.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Review</th><th>Sterren</th><th>Klant</th><th>Status</th><th></th></tr></thead><tbody>
        ${lijst.map((r) => html`<tr><td><b>${r.name}</b>${r.company ? html` · ${r.company}` : ""}<br><span class="klein dempen">${r.body.length > 120 ? r.body.slice(0, 120) + "…" : r.body}</span></td>
          <td class="nowrap">${st(r.rating)}</td><td>${r.klant ? html`<span class="status s-ok">Geverifieerd</span><br><span class="klein dempen">${r.klant}</span>` : html`<span class="dempen">Niet gekoppeld</span>`}</td>
          <td>${r.published ? html`<span class="status s-ok">Op de website</span>` : html`<span class="status s-grijs">Verborgen</span>`}</td>
          <td class="acties"><button class="knop knop-tekst knop-klein" data-bewerk="${r.id}">Bewerken</button><button class="knop knop-tekst knop-klein" data-weg="${r.id}">Verwijderen</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="leeg"><h3>Nog geen reviews</h3><p>Voeg de reviews toe die je van klanten krijgt. Zolang er geen gepubliceerde review is, staat het reviewblok niet op de website.</p></div>`}</section>`);
    const dialoog = (r = {}) => {
      const dlg = SM.dialoog(r.id ? "Review bewerken" : "Review toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2"><div class="veld"><label for="r-naam">Naam</label><input id="r-naam" name="name" value="${r.name || ""}"><div class="fout" data-fout-voor="name"></div></div>
          <div class="veld"><label for="r-bedrijf">Bedrijf <span class="opt">(optioneel)</span></label><input id="r-bedrijf" name="company" value="${r.company || ""}"></div></div>
        <div class="rij2"><div class="veld"><label for="r-st">Sterren</label><select id="r-st" name="rating">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}" ${n === (r.rating || 5) ? raw("selected") : ""}>${n} ${n === 1 ? "ster" : "sterren"}</option>`)}</select><div class="fout" data-fout-voor="rating"></div></div>
          <div class="veld"><label for="r-datum">Datum</label><input id="r-datum" name="date" type="date" value="${r.date || new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="veld"><label for="r-titel">Titel <span class="opt">(optioneel)</span></label><input id="r-titel" name="title" value="${r.title || ""}"></div>
        <div class="veld"><label for="r-tekst">Review (letterlijk zoals de klant hem gaf)</label><textarea id="r-tekst" name="body">${r.body || ""}</textarea><div class="fout" data-fout-voor="body"></div></div>
        <div class="veld"><label for="r-klant">Koppelen aan klant</label><select id="r-klant" name="customerId"><option value="">Niet koppelen (geen "geverifieerd")</option>${customers.map((c) => html`<option value="${c.id}" ${c.id === r.customerId ? raw("selected") : ""}>${c.company}</option>`)}</select></div>
        <div class="rij2"><div class="veld"><label for="r-bron">Bron <span class="opt">(bijv. Google)</span></label><input id="r-bron" name="source" value="${r.source || ""}"></div><div class="veld"><label for="r-url">Link naar origineel <span class="opt">(optioneel)</span></label><input id="r-url" name="sourceUrl" value="${r.sourceUrl || ""}"></div></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="published" ${r.published ? raw("checked") : ""}> Op de website tonen</label></div>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const b = Object.fromEntries(new FormData(form)); b.published = form.elements.published.checked;
        try { await api(r.id ? "hq/reviews/" + r.id : "hq/reviews", { method: r.id ? "PUT" : "POST", body: b }); dlg.close(); toast("Review opgeslagen"); herlaad(); } catch (err) { SM.toonFouten(form, err); }
      });
    };
    main.querySelector("#nieuw").onclick = () => dialoog();
    main.querySelectorAll("[data-bewerk]").forEach((b) => b.addEventListener("click", () => dialoog(lijst.find((r) => String(r.id) === b.dataset.bewerk))));
    main.querySelectorAll("[data-weg]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig("Review verwijderen?", "De review verdwijnt uit HQ en van de website.", "Verwijderen"))) return;
      try { await api("hq/reviews/" + b.dataset.weg, { method: "DELETE" }); toast("Verwijderd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
  }

  // ================================================ INSTELLINGEN
  async function instellingen(main) {
    const d = await api("hq/settings");
    const s = d.settings, co = s.company, bi = s.billing, b = s.b2b;
    const alleenLezen = !isAdmin();
    const v = (name, label, val, opt = {}) => html`<div class="veld"><label for="s-${name}">${label}${opt.opt ? html` <span class="opt">(${opt.opt})</span>` : ""}</label><input id="s-${name}" name="${name}" value="${val ?? ""}" ${opt.type ? raw(`type="${opt.type}"`) : ""}>${opt.hulp ? html`<div class="hulp">${opt.hulp}</div>` : ""}</div>`;
    render(main, html`
      <div class="hq-kop"><div><h1>Instellingen</h1><p>${alleenLezen ? "Alleen een beheerder kan instellingen wijzigen." : "Wijzigingen gelden direct voor de website, het portaal en de mails."}</p></div></div>
      <div class="twee">
        <div>
          <form class="paneel" id="f-bedrijf" novalidate><h2>Bedrijfsgegevens</h2><p class="klein dempen">Staan op facturen en onder B2B-mails.</p>
            <div class="rij2">${v("name", "Handelsnaam", co.name)}${v("legalName", "Juridische naam", co.legalName, { opt: "bijv. B.V." })}</div>
            ${v("address", "Adres", co.address)}<div class="rij2">${v("postcode", "Postcode", co.postcode)}${v("city", "Plaats", co.city)}</div>
            <div class="rij2">${v("kvk", "KvK-nummer", co.kvk)}${v("vat", "Btw-nummer", co.vat)}</div>${v("iban", "IBAN", co.iban)}
            <div class="rij2">${v("email", "E-mail", co.email, { type: "email" })}${v("phone", "Telefoon", co.phone, { opt: "optioneel" })}</div>
            <button class="knop" type="submit">Opslaan</button></form>
          <form class="paneel" id="f-fact" novalidate><h2>Facturatie en btw</h2>
            <fieldset class="veld"><legend class="label"><b>Btw op de factuur</b></legend><p class="hulp">Op de website en in het portaal staat geen btw. Op de factuur wordt de btw wel uitgesplitst.</p>
              <label class="vinkje"><input type="radio" name="pricesIncludeVat" value="false" ${bi.pricesIncludeVat === false ? raw("checked") : ""}> Klant betaalt €69,95 + btw</label>
              <label class="vinkje"><input type="radio" name="pricesIncludeVat" value="true" ${bi.pricesIncludeVat === true ? raw("checked") : ""}> Klant betaalt €69,95 (btw zit erin; standaard)</label>
              ${bi.pricesIncludeVat == null ? html`<div class="hulp">Nog niet gekozen. Automatische betalingen starten pas als dit is ingesteld.</div>` : ""}</fieldset>
            <div class="rij3"><div class="veld"><label for="s-vat">Btw-tarief</label><select id="s-vat" name="vatRate">${[21, 9, 0].map((r) => html`<option value="${r}" ${r === bi.vatRate ? raw("selected") : ""}>${r}%</option>`)}</select></div>
              ${v("paymentTermDays", "Betaaltermijn (dagen)", bi.paymentTermDays, { type: "number" })}${v("invoicePrefix", "Factuurprefix", bi.invoicePrefix)}</div>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="autoInvoices" ${bi.autoInvoices !== false ? raw("checked") : ""}> Van elke Mollie-betaling automatisch een factuur maken en naar de klant mailen</label></div>
            <button class="knop" type="submit">Opslaan</button></form>
          <form class="paneel" id="f-melding" novalidate><h2>Meldingen</h2>
            ${v("email", "Meldingen naar", s.notify.email, { type: "email", hulp: "Nieuwe aanvragen, wijzigingen, mislukte betalingen en sites offline. Leeg = het afzendadres." })}
            <button class="knop" type="submit">Opslaan</button></form>
        </div>
        <div>
          <section class="paneel"><div class="paneel-kop"><h2>Koppelingen</h2><button class="knop knop-licht knop-klein" id="testmail">Testmail naar mij</button></div>
            <ul class="checklijst">${d.setup.map((x) => html`<li><span class="ic ${x.ok ? "ja" : "nee"}">${x.ok ? "✓" : "!"}</span><div>${x.label}${x.ok ? "" : html`<small>${x.hint}</small>`}</div></li>`)}</ul></section>
          <form class="paneel" id="f-b2b" novalidate><h2>B2B-mail</h2>
            <div class="rij2">${v("senderName", "Je naam als afzender", b.senderName)}${v("dailyMax", "Max. mails per dag", b.dailyMax, { type: "number" })}</div>
            <div class="rij3">${v("from", "Versturen vanaf (uur)", b.sendHours[0], { type: "number" })}${v("to", "tot (uur)", b.sendHours[1], { type: "number" })}${v("followupDays", "Opvolgen na (dagen)", b.followupDays, { type: "number" })}</div>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="aiResearch" ${b.ai.research ? raw("checked") : ""}> Openingszin laten schrijven op basis van de website van het bedrijf (AI)</label></div>
            <h3>Scout (Outscraper)</h3>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="scoutActive" ${b.scout.active ? raw("checked") : ""}> Elke werkdag automatisch nieuwe bedrijven zoeken</label></div>
            <div class="rij2"><div class="veld"><label for="s-cats">Branches</label><textarea id="s-cats" name="categories" rows="4">${b.scout.categories.join("\n")}</textarea><div class="hulp">Eén per regel.</div></div>
              <div class="veld"><label for="s-places">Plaatsen</label><textarea id="s-places" name="places" rows="4">${b.scout.places.join("\n")}</textarea><div class="hulp">Elke dag de volgende plaats.</div></div></div>
            ${v("perDay", "Ongeveer zoveel bedrijven per dag", b.scout.perDay, { type: "number" })}
            <h3>Mailteksten</h3><p class="klein dempen">Te gebruiken: {bedrijf}, {plaats}, {intro}, {afzender}, {link}. De afmeldlink en je bedrijfsgegevens worden er automatisch onder gezet.</p>
            <div class="sjabloon">${v("t1s", "Eerste mail: onderwerp", b.templates.eerste.subject)}<div class="veld"><label for="s-t1b">Eerste mail: tekst</label><textarea id="s-t1b" name="t1b">${b.templates.eerste.body}</textarea></div>
              ${v("t2s", "Opvolgmail: onderwerp", b.templates.opvolging.subject)}<div class="veld"><label for="s-t2b">Opvolgmail: tekst</label><textarea id="s-t2b" name="t2b">${b.templates.opvolging.body}</textarea></div></div>
            <div class="knoppen"><button class="knop" type="submit">Opslaan</button><button class="knop knop-licht" type="button" id="standaard">Standaardteksten terugzetten</button></div></form>
        </div>
      </div>`);
    if (alleenLezen) main.querySelectorAll("form input, form select, form textarea, form button").forEach((x) => (x.disabled = true));
    const opslaan = async (form, body) => {
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
      try { await api("hq/settings", { method: "PUT", body }); toast("Opgeslagen"); herlaad(); } catch (err) { toast(err.message, "fout"); SM.bezig(knop, false); }
    };
    const fd = (form) => Object.fromEntries(new FormData(form));
    main.querySelector("#f-bedrijf").addEventListener("submit", (e) => { e.preventDefault(); opslaan(e.target, { company: fd(e.target) }); });
    main.querySelector("#f-fact").addEventListener("submit", (e) => {
      e.preventDefault(); const f = fd(e.target);
      opslaan(e.target, { billing: { pricesIncludeVat: f.pricesIncludeVat === "true" ? true : f.pricesIncludeVat === "false" ? false : null, vatRate: Number(f.vatRate), paymentTermDays: Number(f.paymentTermDays), invoicePrefix: f.invoicePrefix, autoInvoices: e.target.elements.autoInvoices.checked } });
    });
    main.querySelector("#f-melding").addEventListener("submit", (e) => { e.preventDefault(); opslaan(e.target, { notify: fd(e.target) }); });
    main.querySelector("#f-b2b").addEventListener("submit", (e) => {
      e.preventDefault(); const f = fd(e.target), el = e.target.elements;
      opslaan(e.target, { b2b: { senderName: f.senderName, dailyMax: Number(f.dailyMax), followupDays: Number(f.followupDays), sendHours: [Number(f.from), Number(f.to)], ai: { research: el.aiResearch.checked },
        scout: { active: el.scoutActive.checked, perDay: Number(f.perDay), categories: f.categories, places: f.places },
        templates: { eerste: { subject: f.t1s, body: f.t1b }, opvolging: { subject: f.t2s, body: f.t2b } } } });
    });
    main.querySelector("#standaard").addEventListener("click", () => {
      const t = d.defaults.templates, el = main.querySelector("#f-b2b").elements;
      el.t1s.value = t.eerste.subject; el.t1b.value = t.eerste.body; el.t2s.value = t.opvolging.subject; el.t2b.value = t.opvolging.body;
      toast("Standaardteksten ingevuld; klik op Opslaan om ze te bewaren.");
    });
    main.querySelector("#testmail").addEventListener("click", async (e) => {
      e.target.disabled = false; SM.bezig(e.target, true, "Versturen…");
      try { const r = await api("hq/settings/testmail", { method: "POST" }); toast(r.ok ? `Testmail verstuurd naar ${me.email}` : r.error, r.ok ? "ok" : "fout"); } catch (err) { toast(err.message, "fout"); }
      SM.bezig(e.target, false);
    });
  }

  // ================================================ TEAM
  async function team(main) {
    const d = await api("hq/team");
    render(main, html`
      <div class="hq-kop"><div><h1>Team</h1><p>Medewerkers kunnen klanten, wijzigingen, facturen en B2B beheren. Beheerders ook instellingen, team en het opzeggen van abonnementen.</p></div>${isAdmin() ? html`<button class="knop knop-actie" id="lid">Teamlid toevoegen</button>` : ""}</div>
      <section class="paneel"><div class="tabel-wrap"><table class="tabel"><thead><tr><th>E-mail</th><th>Rol</th><th>Laatst ingelogd</th><th></th></tr></thead><tbody>
        ${d.team.map((u) => html`<tr><td><b>${u.email}</b>${u.name ? html`<br><span class="klein dempen">${u.name}</span>` : ""}</td><td>${u.role === "admin" ? "Beheerder" : "Medewerker"}${u.fromEnv ? html` <span class="status s-info">ADMIN_EMAILS</span>` : ""}${u.active ? "" : html` <span class="status s-grijs">Geblokkeerd</span>`}</td>
          <td>${u.last_login_at ? geleden(u.last_login_at) : "–"}</td><td class="acties">${isAdmin() && u.email !== me.email ? html`<button class="knop knop-tekst knop-klein" data-lid='${JSON.stringify({ email: u.email, name: u.name, role: u.role, active: !u.active })}'>${u.active ? "Blokkeren" : "Toegang geven"}</button>` : ""}</td></tr>`)}</tbody></table></div></section>`);
    main.querySelectorAll("[data-lid]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("hq/team", { method: "POST", body: JSON.parse(b.dataset.lid) }); toast("Bijgewerkt"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelector("#lid")?.addEventListener("click", () => {
      const dlg = SM.dialoog("Teamlid toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="t-email">E-mailadres</label><input id="t-email" name="email" type="email" required></div>
        <div class="veld"><label for="t-naam">Naam</label><input id="t-naam" name="name"></div>
        <div class="veld"><label for="t-rol">Rol</label><select id="t-rol" name="role"><option value="medewerker">Medewerker</option><option value="admin">Beheerder</option></select></div>
        <button class="knop knop-actie" type="submit">Toevoegen</button></form>`);
      dlg.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("hq/team", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); dlg.close(); toast("Teamlid toegevoegd; inloggen gaat met een code per mail"); herlaad(); } catch (err) { SM.toonFouten(e.target, err); }
      });
    });
  }

  // ================================================ MAILS
  async function mails(main) {
    const { mails } = await api("hq/maillog");
    const soort = { inlogcode: "Inlogcode", welkom: "Welkom", factuur: "Factuur", betaallink: "Betaallink", melding: "Melding aan team", "wijziging-ontvangen": "Wijziging ontvangen", "wijziging-status": "Wijziging klaar", "aanvraag-bevestiging": "Bevestiging aanvraag", "b2b-eerste": "B2B eerste mail", "b2b-opvolging": "B2B opvolging", test: "Testmail" };
    render(main, html`<div class="hq-kop"><div><h1>Verstuurde mails</h1><p>De laatste 200 mails die HQ heeft verstuurd of geprobeerd te versturen.</p></div></div>
      <section class="paneel">${mails.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Wanneer</th><th>Aan</th><th>Soort</th><th>Onderwerp</th><th>Resultaat</th></tr></thead><tbody>
        ${mails.map((m) => html`<tr><td class="nowrap">${tijd(m.created_at)}</td><td>${m.to_email}</td><td>${soort[m.kind] || m.kind}</td><td>${m.kind === "inlogcode" ? "Je inlogcode: ••••••" : m.subject}</td><td>${m.ok ? html`<span class="status s-ok">Verstuurd</span>` : html`<span class="status s-fout">Mislukt</span><br><span class="klein dempen">${m.error}</span>`}</td></tr>`)}</tbody></table></div>` : html`<p class="dempen">Nog geen mails verstuurd.</p>`}</section>`);
  }

  start();
})();
