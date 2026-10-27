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
    abo: { geen: ["Niet gestart", "s-grijs"], wacht_op_betaling: ["Wacht op 1e betaling", "s-let"], actief: ["Automatisch (Pay.nl)", "s-ok"], betaling_mislukt: ["Betaling mislukt", "s-fout"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"], handmatig: ["Handmatig gefactureerd", "s-info"] },
    aanvraag: { nieuw: ["Nieuw", "s-fout"], gepland: ["Gesproken", "s-info"], klant: ["Klant geworden", "s-ok"], geen_interesse: ["Geen interesse", "s-grijs"], niet_bereikbaar: ["Niet bereikbaar", "s-let"], geannuleerd: ["Geannuleerd", "s-grijs"] },
    lead: { kandidaat: ["Te onderzoeken", "s-grijs"], nieuw: ["Klaar om te mailen", "s-info"], goedgekeurd: ["In de wachtrij", "s-let"], verstuurd: ["Verstuurd", "s-info"], opvolging_goedgekeurd: ["Opvolging in wachtrij", "s-let"], opgevolgd: ["Opgevolgd", "s-info"], reactie: ["Reactie!", "s-fout"], afspraak: ["Afspraak", "s-ok"], klant: ["Klant", "s-ok"], afgemeld: ["Afgemeld", "s-grijs"], overgeslagen: ["Overgeslagen", "s-grijs"], fout: ["Fout", "s-fout"] },
    betaling: { open: ["Open", "s-let"], pending: ["Bezig", "s-let"], authorized: ["Geautoriseerd", "s-info"], paid: ["Betaald", "s-ok"], failed: ["Mislukt", "s-fout"], canceled: ["Geannuleerd", "s-grijs"], expired: ["Verlopen", "s-grijs"] },
    soort: { eerste: "Bouw + machtiging", abonnement: "Maandtermijn", factuur: "Losse factuur" },
    ai: { wachtrij: ["Claude begint zo", "s-info"], bezig: ["Claude is bezig", "s-info"], voorstel: ["Voorstel klaar", "s-let"], handmatig: ["Zelf afhandelen", "s-grijs"], fout: ["Mislukt", "s-fout"], goedgekeurd: ["Live gezet", "s-ok"] },
    start: { gegevens: ["Vult gegevens in", "s-grijs"], betalen: ["Moet nog betalen", "s-let"], informatie: ["Betaald · levert info aan", "s-info"], bouwen: ["Bouwen!", "s-fout"], klaar: ["Gestart", "s-ok"] },
    opdracht: { wacht: ["Wacht op de ontwerper", "s-grijs"], ontwerpen: ["Wordt ontworpen", "s-info"], controle: ["Klaar: controleer hem", "s-let"], live: ["Live", "s-ok"], fout: ["Lukte niet", "s-fout"] },
    concept: { wachtrij: ["In de wachtrij", "s-grijs"], bezig: ["Site wordt gescand", "s-info"], ontwerp: ["Wacht op de ontwerper", "s-grijs"], ontwerpen: ["Wordt ontworpen", "s-info"], klaar: ["Klaar", "s-ok"], fout: ["Mislukt", "s-fout"], overgeslagen: ["Overgeslagen", "s-grijs"] },
    opzeg: { aangevraagd: ["Opgezegd", "s-fout"], afgerond: ["Beëindigd", "s-grijs"], ingetrokken: ["Ingetrokken", "s-ok"] },
    reden: { te_duur: "Te duur", geen_resultaat: "Levert te weinig op", zelf_doen: "Zelf of ander bureau", stoppen: "Stopt met bedrijf", ontevreden: "Niet tevreden over de service", anders: "Andere reden" },
    domein: { wacht_op_klant: ["Wacht op de klant", "s-let"], aangevraagd: ["DNS instellen", "s-let"], verhuizen: ["Verhuizen", "s-fout"], registreren: ["Registreren", "s-fout"], dns_klaar: ["DNS klopt, https volgt", "s-info"], actief: ["Actief", "s-ok"], probleem: ["Probleem", "s-fout"], opgezegd: ["Opgezegd", "s-grijs"] },
    domeinKeuze: { eigen: "Houdt het zelf", verhuizen: "Verhuizen naar Sitemaker", nieuw: "Nieuw registreren" },
    ticket: { open: ["Open", "s-fout"], beantwoord: ["Beantwoord", "s-ok"], gesloten: ["Gesloten", "s-grijs"] },
    voorkeur: { "": "Geen voorkeur", ochtend: "Ochtend", middag: "Middag", avond: "Begin van de avond", bellen: "Wil gebeld worden" },
  };
  const chip = (map, k) => { const [t, c] = map[k] || [k, "s-grijs"]; return html`<span class="status ${c}">${t}</span>`; };
  const opties = (map, cur) => Object.entries(map).map(([k, [t]]) => html`<option value="${k}" ${k === cur ? raw("selected") : ""}>${t}</option>`);
  const isAdmin = () => me?.role === "admin";
  // Op hq.sitemaker.nl is "/" het dashboard zelf; de website staat dan op het hoofddomein.
  const websiteUrl = location.hostname.startsWith("hq.") ? "https://" + location.hostname.slice(3) + "/" : "/";

  // ------------------------------------------------ start en kader
  SM.onLoggedOut = () => start();
  async function start() {
    try { const r = await api("auth/me"); if (r.user && r.user.role !== "klant") { me = r.user; return kader(); } } catch {}
    const r = await SM.inloggen(app, { portal: "hq", kop: "Inloggen op Sitemaker HQ", titel: "Sitemaker HQ", tekst: "Klanten, wijzigingen, facturen, betalingen, sites en B2B op één plek." });
    if (r.role === "klant") { location.href = location.hostname.startsWith("hq.") ? "https://mijn." + location.hostname.slice(3) + "/" : "/portaal/"; return; }
    const m = await api("auth/me"); me = m.user; kader();
  }

  const NAV = [
    ["bedrijf", "Bedrijf", '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"/>'],
    ["overzicht", "Overzicht", '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>'],
    ["klanten", "Klanten", '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
    ["opdrachten", "Opdrachten", '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'],
    ["wijzigingen", "Wijzigingen", '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'],
    ["service", "Klantvragen", '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'],
    ["aanvragen", "Agenda", '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'],
    ["facturen", "Facturen", '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'],
    ["betalingen", "Betalingen", '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'],
    ["kosten", "Kosten en winst", '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>'],
    ["domeinen", "Domeinen", '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'],
    ["sites", "Sites", '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>'],
    ["b2b", "B2B", '<path d="M4 4h16v16H4z"/><path d="m4 6 8 7 8-7"/>', "Acquisitie"],
    ["concepten", "Concepten", '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8M12 17v4"/>'],
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
          <div class="onder">${me.open ? html`<b>Open modus</b>` : html`${me.email}<br>${me.role === "admin" ? "Beheerder" : "Medewerker"} · <button class="knop knop-tekst" id="uit">Uitloggen</button>`}<br><a href="${websiteUrl}" target="_blank" rel="noopener" class="knop-tekst knop">Website bekijken</a></div>
        </aside>
        <div class="hq-rechts"><div id="credit-balk"></div>${me.open ? html`<div class="open-balk">Open modus: HQ is zonder inloggen bereikbaar. Dit gaat vanzelf dicht zodra de mail is ingesteld.</div>` : ""}<main class="hq-main" id="inhoud" tabindex="-1"></main></div>
      </div>`);
    if (app.querySelector("#uit")) app.querySelector("#uit").onclick = () => SM.uitloggen();
    const zij = app.querySelector("#zij"), mk = app.querySelector("#menu");
    mk.onclick = () => { const o = zij.classList.toggle("open"); mk.setAttribute("aria-expanded", String(o)); };
    zij.addEventListener("click", (e) => { if (e.target.closest("a")) { zij.classList.remove("open"); mk.setAttribute("aria-expanded", "false"); } });
    window.addEventListener("hashchange", route);
    route();
    creditBalk();
    setInterval(creditBalk, 10 * 60000);
  }

  function zetBadges(c) {
    badges = { opdrachten: c.opdrachten_controle, concepten: c.concepten_beoordelen, klanten: c.te_bouwen, wijzigingen: c.open_wijzigingen, aanvragen: c.nieuwe_aanvragen, b2b: c.leads_reactie, sites: c.offline, betalingen: c.betaling_mislukt, service: c.klantvragen, domeinen: c.domeinen_werk, reviews: c.reviews_nieuw };
    app.querySelectorAll("[data-badge]").forEach((el) => { const n = badges[el.dataset.badge]; el.hidden = !n; el.textContent = n || ""; });
  }

  async function route() {
    const [pagina, id] = (location.hash.slice(1) || "bedrijf").split("/");
    app.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", false));
    app.querySelector(`[data-nav="${pagina === "klant" ? "klanten" : pagina === "afdeling" ? "bedrijf" : pagina}"]`)?.setAttribute("aria-current", "page");
    const main = app.querySelector("#inhoud");
    render(main, html`<p class="dempen">Laden…</p>`);
    const fn = { bedrijf, afdeling, overzicht, klanten, klant, opdrachten, wijzigingen, aanvragen, facturen, betalingen, sites, b2b, concepten, reviews, instellingen, team, mails, service, domeinen, kosten }[pagina] || bedrijf;
    if (vraagTimer) { clearTimeout(vraagTimer); vraagTimer = null; }
    try { await fn(main, id); zetBalk(main, pagina); } catch (e) { render(main, html`<div class="melding melding-fout">${raw(icon.let)}<p>${e.message}</p></div>`); }
    window.scrollTo(0, 0);
  }
  const herlaad = () => route();

  // ================================================ BEDRIJF (het kantoor met afdelingen en medewerkers)
  const ORG = () => window.SM_ORG || [];
  const persoon = (key) => { for (const d of ORG()) { const p = d.people.find((x) => x.key === key); if (p) return { ...p, dept: d }; } return null; };
  const naamNaarKey = (naam) => { for (const d of ORG()) { const p = d.people.find((x) => x.person === naam); if (p) return p.key; } return ""; };
  const portret = (key, cls = "portret") => html`<img class="${cls}" data-portret="${key}" alt="" width="44" height="44">`;
  function vulPortretten(el) {
    const P = window.HQ_portraits || {};
    el.querySelectorAll("img[data-portret]").forEach((img) => { if (P[img.dataset.portret]) img.src = P[img.dataset.portret]; });
  }
  window.addEventListener("hq-portraits", () => vulPortretten(app));
  let vraagTimer = null;
  const briefTekst = (t) => html`${String(t || "").split("\n").filter((r) => r.trim()).map((r) => /^[-•*]\s/.test(r.trim()) ? html`<li>${r.trim().replace(/^[-•*]\s*/, "")}</li>` : html`<p>${r.replace(/\*\*/g, "")}</p>`)}`;
  const briefHtml = (t) => { const s = String(briefTekst(t)); return raw(s.replace(/(<li>[\s\S]*?<\/li>)+/g, (m) => `<ul>${m}</ul>`)); };

  async function bedrijf(main) {
    const d = await api("hq/team");
    window.SM_TEAM = { busy: d.busy };
    const directie = d.depts.directie;
    const kaart = (dep) => {
      const st = d.depts[dep.key] || {};
      const alarm = (st.metrics || []).filter((m) => m.alarm).length;
      const live = dep.status === "live" || (dep.key === "marketing" && d.marketingLive);
      const busy = dep.people.filter((p) => d.busy[p.key]).length;
      return html`<a class="afd-kaart" href="#afdeling/${dep.key}" data-kleur="${dep.key}">
        <span class="afd-verdieping">${dep.floor}</span>
        <div class="afd-tekst"><b>${dep.name}</b><span class="klein dempen">${dep.people.map((p) => p.person).join(", ")}</span>
          <span class="klein">${live ? (busy ? `${busy} aan het werk` : "Aan het werk") : "Wacht op koppeling"}${alarm ? ` · ${alarm} aandachtspunt${alarm > 1 ? "en" : ""}` : ""}</span></div>
        ${alarm ? html`<span class="tel">${alarm}</span>` : ""}</a>`;
    };
    render(main, html`
      <div class="hq-kop"><div><h1>Sitemaker</h1><p>Je bedrijf, per afdeling. Klik op een verdieping om het team aan het werk te zien.</p></div>
        <div class="knoppen"><button class="knop knop-licht" id="ververs">${d.ai ? "Briefings opnieuw laten schrijven" : "Briefings bijwerken"}</button></div></div>
      <section class="paneel briefing-directie">
        <div class="briefing-kop">${portret("directeur", "portret groot")}<div><h2>Ochtendbriefing van Victor</h2><span class="klein dempen">Algemeen directeur${directie.briefing ? ` · ${tijd(directie.briefing.at)}` : ""}</span></div></div>
        ${directie.briefing ? html`<div class="briefing-tekst">${briefHtml(directie.briefing.text)}</div>` : html`<p class="dempen">Victor schrijft elke ochtend na 8:00 een briefing op basis van alle afdelingen.</p>`}
        ${d.beslissingen.length ? html`<h3 class="sub-kop">Wacht op jou</h3><ul class="beslis">${d.beslissingen.map((b) => html`<li><a href="${b.href}">${b.text}</a></li>`)}</ul>` : html`<p class="klein dempen">Er wacht nu niets op jou.</p>`}
      </section>
      <div class="bedrijf-raster">
        <section class="paneel gebouw-paneel"><div class="office o3d building3d" id="gebouw"></div></section>
        <div class="afd-lijst">${ORG().slice().sort((a, b) => b.floor - a.floor).map(kaart)}</div>
      </div>
      <section class="paneel"><div class="paneel-kop"><h2>Live logboek</h2><span class="klein dempen">Wat het team deed</span></div>${logboek(d.feed)}</section>`);
    main.querySelector("#ververs").onclick = async (e) => { SM.bezig(e.target, true, "Bezig…"); try { await api("hq/team/briefings", { method: "POST" }); toast(d.ai ? "De managers schrijven nieuwe briefings; over een paar minuten staan ze er." : "Bijgewerkt"); setTimeout(herlaad, d.ai ? 4000 : 500); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); } };
    if (window.SM_Building) window.SM_Building.mountBuilding(main.querySelector("#gebouw"));
    else main.querySelector("#gebouw").replaceWith(document.createRange().createContextualFragment(`<p class="dempen">Het 3D-kantoor kan hier niet laden.</p>`));
    vulPortretten(main);
  }
  function logboek(items) {
    if (!items.length) return html`<p class="dempen">Nog niets gebeurd. Zodra het team aan het werk is, zie je het hier.</p>`;
    return html`<ul class="logboek">${items.map((f) => html`<li>${portret(naamNaarKey(f.wie), "portret klein")}<div><b>${f.wie}</b> ${f.text}<span class="klein dempen">${geleden(f.at)}</span></div></li>`)}</ul>`;
  }

  // Het team van de afdeling bovenaan elke werkpagina: wie er werkt, wat ze nu doen, en hun verdieping in 3D.
  const PAGINA_AFD = { opdrachten: "projecten", b2b: "b2b", concepten: "b2b", wijzigingen: "projecten", domeinen: "domeinen", service: "klantenservice", aanvragen: "klantenservice", sites: "incidenten", facturen: "finance", betalingen: "finance", kosten: "finance" };
  let teamCache = null;
  const balkDicht = () => { try { return localStorage.getItem("sm_balk") === "dicht"; } catch { return false; } };
  async function zetBalk(main, pagina) {
    const key = PAGINA_AFD[pagina], dep = key && ORG().find((x) => x.key === key);
    if (!dep || main.querySelector(".team-balk")) return;
    const plek = document.createElement("section"); plek.className = "paneel team-balk"; plek.dataset.kleur = key;
    const kop = main.querySelector(".hq-kop"); kop ? kop.after(plek) : main.prepend(plek);
    try { if (!teamCache || Date.now() - teamCache.at > 60000) teamCache = { at: Date.now(), d: await api("hq/team") }; } catch { plek.remove(); return; }
    const d = teamCache.d, st = d.depts[key] || { people: {} };
    window.SM_TEAM = { busy: d.busy };
    const dicht = balkDicht();
    render(plek, html`
      <div class="balk-kop"><a href="#afdeling/${key}"><b>Afdeling ${dep.name}</b></a><span class="klein dempen">${dep.people.filter((p) => d.busy[p.key]).length ? `${dep.people.filter((p) => d.busy[p.key]).length} nu bezig` : "aan het werk"}</span>
        <button class="knop knop-tekst knop-klein" type="button" data-balk aria-expanded="${!dicht}">${dicht ? "Team tonen" : "Team verbergen"}</button></div>
      <div class="balk-body" ${dicht ? raw("hidden") : ""}>
        <div class="office o3d floorbox balk-vloer" id="balk-vloer"></div>
        <ul class="balk-team">${dep.people.map((p) => { const s = st.people?.[p.key] || {}; return html`<li>${portret(p.key, "portret")}<div><b>${p.person}</b> <span class="klein dempen">${p.role}</span>${d.busy[p.key] ? html` <span class="status s-ok">Nu bezig</span>` : ""}<p class="klein">${s.text || p.does[0]}</p></div></li>`; })}</ul>
      </div>`);
    vulPortretten(plek);
    const vloer = () => { if (window.SM_Building && !plek.querySelector(".balk-body").hidden && window.matchMedia("(min-width: 821px)").matches) window.SM_Building.showFloor(plek.querySelector("#balk-vloer"), key); };
    vloer();
    plek.querySelector("[data-balk]").onclick = (e) => {
      const body = plek.querySelector(".balk-body"); body.hidden = !body.hidden;
      try { localStorage.setItem("sm_balk", body.hidden ? "dicht" : "open"); } catch {}
      e.target.textContent = body.hidden ? "Team tonen" : "Team verbergen"; e.target.setAttribute("aria-expanded", String(!body.hidden)); vloer();
    };
  }

  async function afdeling(main, key) {
    const dep = ORG().find((x) => x.key === key);
    if (!dep) { location.hash = "#bedrijf"; return; }
    const d = await api("hq/team");
    window.SM_TEAM = { busy: d.busy };
    const st = d.depts[key] || { metrics: [], people: {}, feed: [] };
    const live = dep.status === "live" || (key === "marketing" && d.marketingLive);
    const manager = dep.people.find((p) => p.key === dep.manager);
    const pagina = { concepten: "Naar Concepten", wijzigingen: "Naar Wijzigingen", sites: "Naar Sites", facturen: "Naar Facturen" }[dep.page];
    render(main, html`
      <div class="klant-kop"><div><a class="terug" href="#bedrijf">Bedrijf</a><h1>${dep.name}</h1><p class="dempen">${dep.desc}</p></div>
        <div class="knoppen">${!live ? html`<span class="status s-let">Wacht op koppeling</span>` : html`<span class="status s-ok">Aan het werk</span>`}${pagina ? html`<a class="knop knop-licht" href="#${dep.page}">${pagina}</a>` : ""}</div></div>
      <section class="paneel vloer-paneel"><div class="office o3d floorbox" id="vloer"></div></section>
      ${st.metrics?.length ? html`<div class="kpis">${st.metrics.map((m) => html`<a class="kpi ${m.alarm ? "alarm" : ""}" href="${m.href || "#afdeling/" + key}"><div class="waarde">${m.value}</div><div class="naam">${m.label}${m.sub ? html`<br><b>${m.sub}</b>` : ""}</div></a>`)}</div>` : ""}
      <div class="twee">
        <div>
          <section class="paneel"><h2>Het team</h2><ul class="team-lijst">${dep.people.map((p) => { const s = st.people?.[p.key] || {}; return html`<li>
            ${portret(p.key)}<div><div class="team-naam"><b>${p.person}</b> <span class="klein dempen">${p.role}</span>${d.busy[p.key] ? html`<span class="status s-ok">Nu bezig</span>` : ""}</div>
            ${s.text ? html`<p class="team-nu">${s.text}</p>` : ""}<ul class="klein dempen">${p.does.map((x) => html`<li>${x}</li>`)}</ul></div></li>`; })}</ul></section>
          <section class="paneel"><h2>Vaste taken</h2><ul class="klein">${dep.tasks.map((t) => html`<li>${t}</li>`)}</ul>
            ${key === "marketing" && !live ? html`<div class="melding melding-let">${raw(icon.let)}<p>Marketing draait als geplande Claude-taken, omdat Windsor, Kive en Canva alleen aan Claude gekoppeld zijn. Dit wordt de volgende stap.</p></div>` : ""}</section>
        </div>
        <div>
          ${manager ? html`<section class="paneel"><div class="briefing-kop">${portret(manager.key, "portret groot")}<div><h2>Briefing van ${manager.person}</h2><span class="klein dempen">${manager.role}${st.briefing ? ` · ${tijd(st.briefing.at)}` : ""}</span></div></div>
            ${st.briefing ? html`<div class="briefing-tekst">${briefHtml(st.briefing.text)}</div>` : html`<p class="dempen">${manager.person} schrijft elke ochtend na 8:00 een briefing.</p>`}
            <form novalidate id="vraag-form" class="vraag-form"><div class="veld"><label for="vraag">Vraag aan ${manager.person}</label><textarea id="vraag" name="vraag" rows="2" placeholder="${key === "b2b" ? "Bijv. welke branche reageert het best?" : key === "finance" ? "Bijv. hoeveel hebben we deze maand verdiend?" : "Stel een vraag over de afdeling"}"></textarea><div class="fout" data-fout-voor="vraag"></div></div>
              <button class="knop knop-klein" type="submit">Vraag stellen</button></form>
            <div id="vragen"></div></section>` : ""}
          <section class="paneel"><h2>Logboek</h2>${logboek(st.feed || [])}</section>
        </div>
      </div>`);
    if (window.SM_Building) window.SM_Building.showFloor(main.querySelector("#vloer"), key);
    vulPortretten(main);
    const vragen = async () => {
      const box = main.querySelector("#vragen"); if (!box) return;
      const { vragen: lijst } = await api("hq/team/vragen?dept=" + key);
      render(box, lijst.length ? html`<ul class="qa">${lijst.map((v) => html`<li><p class="vraag-tekst">${v.vraag}</p>${v.status === "open" ? html`<p class="dempen klein">${manager.person} denkt na…</p>` : html`<div class="antwoord ${v.status === "fout" ? "fout" : ""}">${briefHtml(v.antwoord)}</div>`}<span class="klein dempen">${geleden(v.at)}</span></li>`)}</ul>` : "");
      if (lijst.some((v) => v.status === "open") && location.hash === "#afdeling/" + key) vraagTimer = setTimeout(vragen, 3000);
    };
    vragen();
    main.querySelector("#vraag-form")?.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(e.target);
      const knop = e.target.querySelector("[type=submit]"); SM.bezig(knop, true, "Versturen…");
      try { await api("hq/team/vraag", { method: "POST", body: { dept: key, vraag: e.target.elements.vraag.value } }); e.target.reset(); vragen(); } catch (err) { SM.toonFouten(e.target, err); }
      SM.bezig(knop, false);
    });
  }

  // ================================================ OVERZICHT
  async function overzicht(main) {
    const d = await api("hq/overview");
    const c = d.counts; zetBadges(c);
    const kpi = (waarde, naam, href, alarm) => html`<a class="kpi ${alarm ? "alarm" : ""}" href="${href}"><div class="waarde">${waarde}</div><div class="naam">${naam}</div></a>`;
    const nogTeDoen = d.setup.filter((s) => !s.ok);
    render(main, html`
      <div class="hq-kop"><div><h1>Overzicht</h1><p>${new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} · ${maand(d.month)}</p></div>
        <div class="knoppen"><button class="knop knop-actie" id="nieuwe-klant">Nieuwe klant</button></div></div>
      ${d.starters.length ? html`<section class="paneel nieuwe-klanten"><div class="paneel-kop"><h2>Nieuwe klanten</h2><span class="klein dempen">Starten zelf in het portaal</span></div>
        <ul class="lijst">${d.starters.map((k) => html`<li class="factuur-rij"><div><a href="#klant/${k.id}"><b>${k.company}</b></a><br><span class="klein dempen">${k.stage === "bouwen" ? `Informatie binnen ${geleden(k.intakeAt)} · online uiterlijk ${tijd(k.dueAt)}` : k.startedAt ? `Betaald ${geleden(k.startedAt)}` : `Aangemaakt ${geleden(k.createdAt)}`}</span></div>${chip(L.start, k.stage)}</li>`)}</ul></section>` : ""}
      <div class="kpis">
        ${kpi(c.klanten, `klanten (${c.live} live, ${c.in_aanbouw} in aanbouw)`, "#klanten")}
        ${kpi(euro(c.mrr_basis), "aan abonnementen per maand", "#betalingen")}
        ${c.voorstellen ? kpi(c.voorstellen, "voorstellen van Claude klaar om goed te keuren", "#wijzigingen/voorstel", true) : ""}
        ${kpi(c.open_wijzigingen, c.te_laat ? `open wijzigingen, ${c.te_laat} over de 48 uur` : "open wijzigingen", "#wijzigingen", c.te_laat > 0)}
        ${kpi(c.nieuwe_aanvragen, "nieuwe afspraken en terugbelverzoeken", "#aanvragen", c.nieuwe_aanvragen > 0)}
        ${kpi(euro(c.ontvangen_maand), "ontvangen deze maand", "#facturen")}
        ${kpi(`${c.open_facturen} · ${euro(c.open_bedrag)}`, "openstaande facturen", "#facturen")}
        ${kpi(c.betaling_mislukt, "mislukte betalingen", "#betalingen", c.betaling_mislukt > 0)}
        ${kpi(c.offline, "sites offline", "#sites", c.offline > 0)}
        ${kpi(c.concepten_beoordelen, "concepten te beoordelen", "#concepten", c.concepten_beoordelen > 0)}
        ${kpi(c.concepten_bekeken, "concepten bekeken door leads (7 dagen)", "#concepten", c.concepten_bekeken > 0)}
      </div>
      <div class="twee">
        <section class="paneel"><div class="paneel-kop"><h2>Wijzigingen te doen</h2><a href="#wijzigingen">Alle wijzigingen</a></div>
          ${d.todo.length ? html`<ul class="lijst">${d.todo.map(todoRij)}</ul>` : html`<p class="dempen">Niets open. Alle wijzigingen zijn verwerkt.</p>`}</section>
        <div>
          <section class="paneel"><div class="paneel-kop"><h2>Komende afspraken</h2><a href="#aanvragen">Agenda</a></div>
            ${d.appointments.length ? html`<ul class="lijst">${d.appointments.map((a) => html`<li><a href="#aanvragen"><b>${a.company}</b></a> · ${a.name}<br><span class="klein dempen">${a.startsAt ? `${AFSPRAAK_SOORT[a.soort] || "Kennismaking"} · ${afspraakTijd(a.startsAt)}` : `Terugbelverzoek · ${geleden(a.createdAt)}`}</span></li>`)}</ul>` : html`<p class="dempen">Geen afspraken de komende week.</p>`}</section>
          <section class="paneel"><h2>B2B deze maand</h2><p class="dempen">${c.leads_verstuurd_30d} mails verstuurd in 30 dagen · ${c.leads_klaar} leads klaar om te mailen · ${c.leads_reactie} reacties te beantwoorden</p><a class="knop knop-licht knop-klein" href="#b2b">Naar B2B</a></section>
          ${nogTeDoen.length ? html`<section class="paneel"><h2>Nog in te stellen</h2><ul class="checklijst">${nogTeDoen.map((s) => html`<li><span class="ic nee">!</span><div>${s.label}<small>${s.hint}</small></div></li>`)}</ul></section>` : ""}
        </div>
      </div>`);
    main.querySelector("#nieuwe-klant").onclick = () => klantDialoog();
  }
  function todoRij(w) {
    const over = SM.over(w.dueAt);
    return html`<li><div class="wijziging-kop"><a href="#klant/${w.customerId}"><b>${w.company}</b></a>${w.ai?.status ? chip(L.ai, w.ai.status) : chip(L.wijziging, w.status)}</div>
      <p class="wijziging-tekst">${w.description.length > 160 ? w.description.slice(0, 160) + "…" : w.description}</p>
      <div class="wijziging-meta"><span>${tijd(w.createdAt)}</span>${over ? html`<span>Nog ${over}</span>` : html`<span class="status s-fout">Over de 48 uur</span>`}<a href="#wijzigingen${w.ai?.status === "voorstel" ? "/voorstel" : ""}">${w.ai?.status === "voorstel" ? "Bekijken en goedkeuren" : "Afhandelen"}</a></div></li>`;
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
          <td><b>${c.company}</b>${c.siteNaam ? html` · ${c.siteNaam}` : ""}${c.websites > 1 ? html` <span class="status s-info">${c.websites} websites</span>` : ""}<br><span class="klein dempen">${c.email}</span></td>
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
      ${c.id ? html`<div class="veld"><label for="k-bill">Facturatie</label><select id="k-bill" name="billingStatus">${c.billingStatus === "actief" || c.billingStatus === "wacht_op_betaling" || c.billingStatus === "betaling_mislukt" || c.billingStatus === "opgezegd" ? html`<option value="">${L.abo[c.billingStatus][0]} (via Pay.nl)</option>` : ""}<option value="geen" ${c.billingStatus === "geen" ? raw("selected") : ""}>Niet gestart</option><option value="handmatig" ${c.billingStatus === "handmatig" ? raw("selected") : ""}>Handmatig gefactureerd</option><option value="gepauzeerd" ${c.billingStatus === "gepauzeerd" ? raw("selected") : ""}>Gepauzeerd</option></select></div>` : ""}</div>
      <div class="veld"><label for="k-notes">Interne notities <span class="opt">(alleen zichtbaar in HQ)</span></label><textarea id="k-notes" name="notes" rows="3">${c.notes || ""}</textarea></div>`;
  }

  function klantDialoog(voorvul = {}) {
    const dlg = SM.dialoog("Nieuwe klant", html`<form novalidate>
      <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      ${klantVelden(voorvul)}
      <div class="veld"><label class="vinkje"><input type="checkbox" name="onboarding" checked> <span>Klant start zelf in het portaal<small class="hulp">Hij vult zijn gegevens aan, gaat akkoord, betaalt en levert de informatie voor de website aan. Je hoeft nu alleen bedrijfsnaam en e-mail in te vullen.</small></span></label></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="sendWelcome" checked> Stuur een welkomstmail met de link naar het portaal</label></div>
      <div class="knoppen"><button class="knop knop-actie" type="submit">Klant aanmaken</button><button class="knop knop-licht" type="button" data-annuleer>Annuleren</button></div></form>`);
    const form = dlg.querySelector("form");
    dlg.querySelector("[data-annuleer]").onclick = () => dlg.close();
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const b = Object.fromEntries(new FormData(form)); b.sendWelcome = form.elements.sendWelcome.checked; b.onboarding = form.elements.onboarding.checked;
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
      <div class="klant-kop"><div><a class="terug" href="#klanten">Alle klanten</a><h1>${c.company}${c.siteNaam ? html` <span class="dempen">· ${c.siteNaam}</span>` : ""}</h1>
        <p class="dempen">${c.contactName ? c.contactName + " · " : ""}${c.email} ${chip(L.site, c.siteStatus)} ${chip(L.abo, c.billingStatus)}</p></div>
        <div class="knoppen"><button class="knop knop-licht" id="bewerk">Gegevens bewerken</button><button class="knop knop-licht" id="als-klant">Bekijk als klant</button><button class="knop knop-licht" id="welkom">Welkomstmail sturen</button>${c.siteUrl ? html`<a class="knop knop-licht" href="${c.siteUrl}" target="_blank" rel="noopener">${raw(icon.open)}Site openen</a>` : ""}</div></div>
      <div class="klant-raster">
        <div>
          ${d.start ? startPaneel(d.start, c) : ""}
          <section class="paneel"><h2>Zo ziet de klant het portaal</h2>
            <div class="teller" role="img" aria-label="${u.used} van ${u.limit} wijzigingen gebruikt">${Array.from({ length: u.limit }, (_, i) => html`<span class="${i < u.used ? "gebruikt" : ""}"></span>`)}</div>
            <p class="teller-tekst">Nog ${u.left} van ${u.limit} over<small>${maand(u.month)} · ${d.invoices.length} facturen in het portaal</small></p></section>
          <section class="paneel"><div class="paneel-kop"><h2>Wijzigingen</h2></div>
            ${d.changes.length ? html`<ul class="lijst">${d.changes.map((w) => wijzigingItem({ ...w, company: c.company, customerId: c.id }, false))}</ul>` : html`<p class="dempen">Nog geen wijzigingen doorgegeven.</p>`}</section>
          <section class="paneel"><div class="paneel-kop"><h2>Facturen</h2><button class="knop knop-licht knop-klein" id="factuur-nieuw">Factuur toevoegen</button></div>
            ${d.invoices.length ? factuurTabel(d.invoices, false) : html`<p class="dempen">Nog geen facturen. Facturen van automatische betalingen verschijnen hier vanzelf.</p>`}</section>
          <section class="paneel"><h2>Betalingen</h2>
            ${d.payments.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Datum</th><th>Soort</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>${d.payments.map((p) => html`<tr><td>${tijd(p.createdAt)}</td><td>${L.soort[p.kind] || p.kind}</td><td class="nummers">${euro(p.amountCents)}</td><td>${chip(L.betaling, p.status)}${p.checkoutUrl ? html` <button class="knop knop-tekst knop-klein" data-kopieer="${p.checkoutUrl}">Link kopiëren</button>` : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="dempen">Nog geen online betalingen.</p>`}</section>
        </div>
        <div>
          <section class="paneel"><h2>Abonnement en betalen</h2>
            <dl class="gegevens"><dt>Status</dt><dd>${chip(L.abo, c.billingStatus)}</dd><dt>Bouw</dt><dd class="nummers">${euro(c.buildCents)}</dd><dt>Per maand</dt><dd class="nummers">${euro(c.monthlyCents)}</dd>
              ${c.subscriptionStart ? html`<dt>Eerste termijn</dt><dd>${datumLang(c.subscriptionStart)}</dd>` : ""}
              ${mollieSub && !mollieSub.error ? html`<dt>Incasso</dt><dd>${mollieSub.mandaat || ""}${mollieSub.startDate ? ` · vanaf ${datum(mollieSub.startDate)}` : ""}</dd>` : ""}${c.iban ? html`<dt>IBAN</dt><dd>${c.iban}${c.ibanNaam ? ` (${c.ibanNaam})` : ""}</dd>` : ""}
              ${mollieSub?.error ? html`<dt>Pay.nl</dt><dd class="dempen">${mollieSub.error}</dd>` : ""}</dl>
            <p class="klein dempen">Dit zijn de bedragen die de klant betaalt.</p>
            <div class="knoppen">
              ${["geen", "handmatig", "opgezegd", "wacht_op_betaling"].includes(c.billingStatus) ? html`<button class="knop knop-actie knop-klein" id="mollie-start">${c.billingStatus === "wacht_op_betaling" ? "Nieuwe betaallink" : "Automatisch incasseren"}</button>` : ""}
              ${c.mollieSubscriptionId && c.billingStatus !== "opgezegd" && isAdmin() ? html`<button class="knop knop-gevaar knop-klein" id="mollie-stop">Abonnement opzeggen</button>` : ""}
              ${c.billingStatus === "handmatig" && c.iban && isAdmin() ? html`<button class="knop knop-licht knop-klein" id="incasso-start">Incasso starten (${c.iban})</button>` : ""}
            </div></section>
          ${d.opzegging && d.opzegging.status !== "ingetrokken" ? html`<section class="paneel opzeg-paneel"><div class="paneel-kop"><h2>Opzegging</h2>${chip(L.opzeg, d.opzegging.status)}</div>
            <dl class="gegevens"><dt>Opgezegd op</dt><dd>${tijd(d.opzegging.at)}</dd><dt>Einddatum</dt><dd>${datumLang(d.opzegging.einde)}</dd><dt>Reden</dt><dd>${L.reden[d.opzegging.reden] || d.opzegging.reden}</dd>${d.opzegging.toelichting ? html`<dt>Toelichting</dt><dd>${d.opzegging.toelichting}</dd>` : ""}</dl>
            ${d.opzegging.status === "aangevraagd" ? html`<p class="klein dempen">Op de einddatum stopt de incasso bij Pay.nl vanzelf en krijg je een mail met wat er nog moet (site offline zetten).</p><div class="knoppen"><button class="knop knop-licht knop-klein" id="opzeg-in">Klant blijft: intrekken</button></div>` : ""}</section>` : ""}
          <section class="paneel"><div class="paneel-kop"><h2>${d.websites.length ? `Websites van deze klant (${d.websites.length})` : "Websites"}</h2><button class="knop knop-licht knop-klein" id="extra-site">Extra website</button></div>
            ${d.websites.length ? html`<ul class="lijst">${d.websites.map((w) => html`<li class="factuur-rij"><div>${w.id === c.id ? html`<b>${w.naam}</b> <span class="klein dempen">(deze)</span>` : html`<a href="#klant/${w.id}"><b>${w.naam}</b></a>`}<br><span class="klein dempen">${w.url || "nog geen adres"}</span></div><div>${chip(L.site, w.siteStatus)} ${chip(L.abo, w.billingStatus)}</div></li>`)}</ul>
              <p class="klein dempen">Elke website heeft een eigen abonnement, eigen 4 wijzigingen per maand, facturen en domein. De klant wisselt in het portaal met één inlog.</p>`
              : html`<p class="dempen klein">Deze klant heeft één website. Wil hij er meer? Dat kan hij zelf aanvragen in zijn portaal (Account), of je maakt hem hier aan.</p>`}</section>
          <section class="paneel"><div class="paneel-kop"><h2>Domein</h2>${d.domein ? chip(L.domein, d.domein.status) : ""}</div>
            ${d.domein ? html`<dl class="gegevens"><dt>Naam</dt><dd><b>${d.domein.naam}</b></dd><dt>Keuze</dt><dd>${L.domeinKeuze[d.domein.keuze]}</dd>${d.domein.provider ? html`<dt>Provider</dt><dd>${d.domein.provider}</dd>` : ""}${d.domein.dnsAt ? html`<dt>DNS</dt><dd>${d.domein.uitleg}<br><span class="klein dempen">${geleden(d.domein.dnsAt)}</span></dd>` : ""}</dl><a class="meer" href="#domeinen">Naar Domeinen</a>`
              : html`<p class="dempen">De klant heeft nog niet gekozen. Dat doet hij in het portaal bij Account.</p>`}</section>
          <section class="paneel"><div class="paneel-kop"><h2>Website</h2>${c.siteUrl ? html`<button class="knop knop-licht knop-klein" id="check">Nu controleren</button>` : ""}</div>
            <dl class="gegevens"><dt>Adres</dt><dd>${c.siteUrl ? html`<a href="${c.siteUrl}" target="_blank" rel="noopener">${c.siteUrl}</a>` : html`<span class="dempen">Nog niet ingevuld</span>`}</dd>
              <dt>Status</dt><dd>${chip(L.site, c.siteStatus)}</dd>${c.deliveredAt ? html`<dt>Online sinds</dt><dd>${datumLang(c.deliveredAt)}</dd>` : ""}
              <dt>Bereikbaar</dt><dd>${c.check ? html`<span class="mini-site"><span class="punt ${c.check.ok ? "ok" : "fout"}"></span>${c.check.ok ? `Online (${c.check.ms} ms)` : `Niet bereikbaar: ${c.check.error}`}</span><span class="klein dempen">Gecontroleerd ${geleden(c.check.at)}</span>` : html`<span class="dempen">${c.siteStatus === "live" ? "Wordt binnen 15 minuten gecontroleerd" : "Wordt gecontroleerd zodra de site live staat"}</span>`}</dd></dl></section>
          <section class="paneel"><h2>Bron en automatische wijzigingen</h2>
            ${c.site?.repo ? html`<dl class="gegevens"><dt>GitHub</dt><dd><a href="https://github.com/${c.site.repo}" target="_blank" rel="noopener">${c.site.repo}</a></dd>
                <dt>Netlify</dt><dd>${c.site.netlifyName ? html`<a href="${c.site.previewBase}" target="_blank" rel="noopener">${c.site.netlifyName}.netlify.app</a>` : html`<span class="dempen">Nog niet gekoppeld</span>`}</dd>
                ${c.site.theme ? html`<dt>Stijl</dt><dd>${c.site.theme}</dd>` : ""}</dl>
              <p class="klein dempen">Wijzigingen van deze klant gaan eerst naar Claude. Jij keurt elk voorstel goed voordat het live gaat.</p>
              ${!c.site.netlifyName ? html`<p class="klein">Koppel de repo nog in Netlify (Add new project › GitHub › ${c.site.repo}, build-commando <code>node build.mjs</code>, map <code>dist</code>) en vul daarna hier de projectnaam in.</p>` : ""}
              <div class="knoppen"><button class="knop knop-licht knop-klein" id="site-koppel">Koppeling aanpassen</button></div>`
            : html`<p class="dempen">Nog geen eigen repo. Maak de site aan vanuit het Sitemaker-sjabloon (eigen GitHub-repo en eigen Netlify-project), of koppel een bestaande repo.</p>
              <div class="knoppen"><button class="knop knop-actie knop-klein" id="site-maak">Website aanmaken</button><button class="knop knop-licht knop-klein" id="site-koppel">Bestaande site koppelen</button></div>`}</section>
          <section class="paneel"><div class="paneel-kop"><h2>Portaaltoegang</h2><button class="knop knop-licht knop-klein" id="gebruiker">Gebruiker toevoegen</button></div>
            <ul class="lijst">${d.users.map((g) => html`<li class="factuur-rij"><div><b>${g.email}</b>${g.active ? "" : html` <span class="status s-grijs">Geblokkeerd</span>`}<br><span class="klein dempen">${g.lastLoginAt ? "Laatst ingelogd " + geleden(g.lastLoginAt) : "Nog niet ingelogd"}</span></div><div><button class="knop knop-tekst knop-klein" data-toegang="${g.id}" data-actief="${g.active ? "0" : "1"}">${g.active ? "Blokkeren" : "Toegang geven"}</button>${isAdmin() ? html`<button class="knop knop-tekst knop-klein knop-gevaar" data-gebruiker-weg="${g.id}" data-email="${g.email}">Verwijderen</button>` : ""}</div></li>`)}</ul></section>
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
    main.querySelectorAll("[data-gebruiker-weg]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig("Gebruiker verwijderen?", `${b.dataset.email} wordt helemaal verwijderd en uitgelogd. Heeft deze persoon ook andere websites bij ons, dan wordt hij alleen van deze klant losgekoppeld. Facturen en wijzigingen blijven bewaard.`, "Verwijderen"))) return;
      try { const r = await api(`hq/customers/${id}/users/${b.dataset.gebruikerWeg}`, { method: "DELETE" }); toast(r.losgekoppeld ? "Losgekoppeld van deze klant (heeft nog andere websites)." : "Gebruiker verwijderd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelector("#mollie-start")?.addEventListener("click", () => mollieDialoog(c));
    main.querySelector("#incasso-start")?.addEventListener("click", async (e) => {
      if (!(await SM.bevestig("Incasso starten?", `Pay.nl schrijft vanaf volgende maand elke maand ${euro(c.monthlyCents)} af van ${c.iban}. De maandfacturen per mail stoppen dan.`, "Starten"))) return;
      SM.bezig(e.target, true);
      try { const r = await api(`hq/customers/${c.id}/incasso`, { method: "POST", body: {} }); toast(`Incasso staat aan vanaf ${datum(r.start)}`); herlaad(); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    });
    main.querySelector("#mollie-stop")?.addEventListener("click", async () => {
      if (!(await SM.bevestig("Abonnement opzeggen?", `Pay.nl stopt met de maandelijkse afschrijving voor ${c.company}. Dit kun je niet terugdraaien; je kunt later wel een nieuwe incasso starten.`, "Opzeggen"))) return;
      try { await api(`hq/customers/${id}/cancel`, { method: "POST" }); toast("Abonnement opgezegd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    });
    main.querySelector("#factuur-nieuw").onclick = () => factuurDialoog(c.id);
    main.querySelector("#extra-site").onclick = () => {
      const dlg = SM.dialoog("Extra website voor " + c.company, html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <p class="dempen">Maakt een nieuwe website aan met dezelfde bedrijfsgegevens en dezelfde portaalinlog. De klant gaat in het portaal akkoord en betaalt de bouwprijs, en levert daarna de informatie aan.</p>
        <div class="veld"><label for="xs-naam">Naam van de website</label><input id="xs-naam" name="naam"><div class="fout" data-fout-voor="naam"></div></div>
        <div class="veld"><label for="xs-oms">Waar gaat hij over? <span class="opt">(optioneel)</span></label><textarea id="xs-oms" name="omschrijving" rows="3"></textarea><div class="fout" data-fout-voor="omschrijving"></div></div>
        <button class="knop knop-actie" type="submit">Aanmaken</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const b = Object.fromEntries(new FormData(form)); if (!b.omschrijving) delete b.omschrijving;
        try { const r = await api(`hq/customers/${id}/extra-website`, { method: "POST", body: b }); dlg.close(); toast("Website aangemaakt"); location.hash = "#klant/" + r.id; } catch (err) { SM.toonFouten(form, err); }
      });
    };
    main.querySelector("#opzeg-in")?.addEventListener("click", async (e) => {
      if (!(await SM.bevestig("Opzegging intrekken?", `${c.company} blijft klant. Het abonnement loopt gewoon door.`, "Intrekken"))) return;
      try { await api(`hq/customers/${id}/opzegging/intrekken`, { method: "POST" }); toast("Opzegging ingetrokken"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    });
    main.querySelector("#site-maak")?.addEventListener("click", () => siteDialoog(c));
    main.querySelector("#site-koppel")?.addEventListener("click", () => koppelDialoog(c));
    koppelWijzigingen(main);
    koppelFacturen(main);
    koppelKopieer(main);
  }

  const INTAKE_LABEL = { omschrijving: "Wat doet het bedrijf", diensten: "Diensten", onderscheid: "Waarom kiezen klanten voor hen", werkgebied: "Werkgebied", doelgroep: "Klanten", openingstijden: "Openingstijden",
    sitePhone: "Telefoon op de site", siteEmail: "E-mail op de site", siteAddress: "Adres op de site", socials: "Social media", domein: "Domeinnaam", huidigeSite: "Huidige website", stijl: "Stijl", kleuren: "Kleuren", voorbeelden: "Mooie websites", opmerkingen: "Opmerkingen",
    prijzenTonen: "Prijzen tonen", hoofdactie: "Belangrijkste actie", boekingslink: "Online agenda", aanspreekvorm: "Je of u", whatsapp: "WhatsApp", drieWoorden: "Zo wil hij overkomen", voorbeeldenWaarom: "Wat hij daar mooi aan vindt", nietWillen: "Beslist niet", sfeerfotos: "Sfeerfoto's mogen", reviewsLink: "Google-reviews", reviewsToestemming: "Reviews tonen", team: "Team", vragen: "Veelgestelde vragen", voorIngevuld: "Vooraf ingevuld uit", domeinProvider: "Provider domein" };
  function startPaneel(st, c) {
    const stap = (ok, tekst, wanneer) => html`<li><span class="ic ${ok ? "ja" : "nee"}">${ok ? raw(icon.ok) : "·"}</span><div>${tekst}${wanneer ? html`<small>${tijd(wanneer)}</small>` : ""}</div></li>`;
    const ingevuld = Object.keys(INTAKE_LABEL).map((k) => [k, (st.intake || {})[k]]).filter(([, v]) => v);
    return html`<section class="paneel start-klant"><div class="paneel-kop"><h2>Start in het portaal</h2>${chip(L.start, st.stage)}</div>
      <ul class="checklijst">
        ${stap(!!st.detailsAt, "Bedrijfsgegevens ingevuld", st.detailsAt)}
        ${stap(!!st.termsAt, st.termsAt ? `Akkoord voorwaarden en incasso (${st.termsBy})` : "Akkoord voorwaarden en incasso", st.termsAt)}
        ${stap(!!st.startedAt, "Eerste betaling binnen", st.startedAt)}
        ${stap(!!st.intakeAt, "Informatie aangeleverd", st.intakeAt)}
      </ul>
      ${st.stage === "bouwen" ? html`<div class="melding melding-let">${raw(icon.let)}<p><b>Bouwen:</b> online uiterlijk ${tijd(st.dueAt)}. Zet de site daarna op Live (Gegevens bewerken).</p></div>` : ""}
      ${ingevuld.length ? html`<details ${st.stage === "bouwen" ? raw("open") : ""}><summary><b>Informatie van de klant</b>${st.intakeAt ? "" : " (concept)"}</summary>
        <dl class="intake">${ingevuld.map(([k, v]) => html`<dt>${INTAKE_LABEL[k] || k}</dt><dd>${k === "stijl" ? (v === "kies" ? "Laat Sitemaker kiezen" : v) : v}</dd>`)}</dl></details>` : ""}
      ${st.files.length ? html`<h3 class="sub-kop">Bestanden (${st.files.length})</h3><ul class="lijst">${st.files.map((f) => html`<li class="factuur-rij"><div><b>${f.name}</b><br><span class="klein dempen">${f.kind === "logo" ? "Logo" : "Foto"} · ${SM.bytes(f.size)}</span></div><a class="knop knop-licht knop-klein" href="/api/hq/customers/${c.id}/bestanden/${f.id}">${raw(icon.download)}Download</a></li>`)}</ul>` : ""}
    </section>`;
  }

  async function siteDialoog(c) {
    const info = await api("hq/sites/info");
    const mist = [!info.github && "GITHUB_TOKEN en GITHUB_ORG", !info.netlify && "NETLIFY_API_TOKEN en NETLIFY_ACCOUNT_SLUG"].filter(Boolean);
    const dlg = SM.dialoog("Website aanmaken", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      ${!info.github ? html`<div class="melding melding-let">${raw(icon.let)}<p>Zet eerst ${mist.join(" en ")} in Netlify (Project configuration › Environment variables). Daarna kan HQ repo's aanmaken.</p></div>` : ""}
      <p>HQ maakt voor ${c.company} een eigen privé-repo op GitHub met het Sitemaker-sjabloon, gevuld met de bedrijfsgegevens${info.netlify ? ", en een eigen Netlify-project" : ""}.${info.netlify && !info.netlifyLink ? " Zonder NETLIFY_GITHUB_INSTALLATION_ID koppel je de repo daarna nog één keer met de hand in Netlify." : ""}</p>
      <div class="veld"><label for="s-thema">Stijl om mee te beginnen</label><select id="s-thema" name="thema">${Object.entries(info.themas).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></div>
      <button class="knop knop-actie" type="submit" ${info.github ? "" : raw("disabled")}>Aanmaken</button></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Repo en project maken…");
      try {
        const r = await api(`hq/customers/${c.id}/site`, { method: "POST", body: { thema: form.elements.thema.value } });
        dlg.close(); toast(r.needsLink ? "Repo aangemaakt. Koppel hem nog in Netlify." : "Repo en Netlify-project aangemaakt"); herlaad();
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }
  async function koppelDialoog(c) {
    const info = await api("hq/sites/info");
    const dlg = SM.dialoog("Site koppelen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <p class="dempen">De repo moet het Sitemaker-sjabloon gebruiken (content.json en build.mjs), anders kan Claude de wijzigingen niet verwerken.</p>
      <div class="veld"><label for="s-repo">GitHub-repo</label><input id="s-repo" name="repo" required placeholder="sitemaker-sites/site-kapsalon" value="${c.site?.repo || ""}"><div class="fout" data-fout-voor="repo"></div></div>
      <div class="veld"><label for="s-nf">Netlify-projectnaam</label><input id="s-nf" name="netlifyName" placeholder="kapsalon-noor" value="${c.site?.netlifyName || ""}"><div class="hulp">Het deel vóór .netlify.app. Nodig voor de voorbeeldlinks.</div></div>
      <div class="veld"><label for="s-th">Stijl</label><select id="s-th" name="thema"><option value="">Ongewijzigd</option>${Object.entries(info.themas).map(([k, t]) => html`<option value="${k}" ${k === c.site?.theme ? raw("selected") : ""}>${t}</option>`)}</select></div>
      <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      try { await api(`hq/customers/${c.id}/site`, { method: "PUT", body: Object.fromEntries(new FormData(form)) }); dlg.close(); toast("Koppeling opgeslagen"); herlaad(); }
      catch (err) { SM.toonFouten(form, err); }
    });
  }

  function logTekst(l) {
    const t = { "klant.aangemaakt": "Klant aangemaakt", "klant.bijgewerkt": "Gegevens bijgewerkt", "klant.welkomstmail": "Welkomstmail verstuurd", "wijziging.ingediend": "Wijziging doorgegeven door klant", "wijziging.status": `Wijziging op ${(L.wijziging[l.detail?.to] || [l.detail?.to])[0]} gezet`, "factuur.aangemaakt": `Factuur ${l.detail?.number || ""} aangemaakt`, "factuur.status": `Factuur ${l.detail?.number || ""} op ${l.detail?.to} gezet`, "factuur.pdf": `PDF geüpload bij ${l.detail?.number || ""}`, "betaling.eerste_gestart": "Betaallink voor eerste betaling gemaakt", "betaling.factuurlink": "Betaallink voor factuur gemaakt", "abonnement.gestart": "Automatisch abonnement gestart", "abonnement.opgezegd": "Abonnement opgezegd", "portaal.gebruiker_toegevoegd": `Portaalgebruiker ${l.detail?.email || ""} toegevoegd`, "portaal.gebruiker_geblokkeerd": `Toegang ${l.detail?.email || ""} geblokkeerd`, "portaal.gebruiker_actief": `Toegang ${l.detail?.email || ""} hersteld`, "start.gegevens": "Klant heeft bedrijfsgegevens ingevuld", "start.akkoord": "Klant ging akkoord met voorwaarden en incasso", "start.betaald": "Eerste betaling binnen", "start.informatie": "Klant heeft informatie voor de website aangeleverd", "site.aangemaakt": `Repo ${l.detail?.repo || ""} aangemaakt`, "site.gekoppeld": `Gekoppeld aan ${l.detail?.repo || ""}`, "wijziging.goedgekeurd": "Voorstel van Claude goedgekeurd en live gezet", "wijziging.opnieuw": "Nieuw voorstel gevraagd aan Claude", "portaal.bekeken_als_klant": "Portaal bekeken als klant" };
    return t[l.action] || l.action;
  }

  function mollieDialoog(c) {
    const morgen = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const dlg = SM.dialoog("Automatisch incasseren", html`<form novalidate>
      <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <p>${c.company} betaalt via een Pay.nl-link de bouwprijs (${euro(c.buildCents)}). Daarna zet HQ een incasso aan van ${euro(c.monthlyCents)} per maand op het IBAN hieronder. Van elke betaling maakt HQ automatisch een factuur. Zonder IBAN krijgt de klant elke maand een factuur per mail.</p>
      <div class="rij2"><div class="veld"><label for="m-iban">IBAN van de klant</label><input id="m-iban" name="iban" value="${c.iban || ""}" placeholder="NL00 BANK 0123 4567 89"><div class="fout" data-fout-voor="iban"></div></div>
        <div class="veld"><label for="m-ibannaam">Naam rekeninghouder</label><input id="m-ibannaam" name="ibanNaam" value="${c.ibanNaam || c.company}"></div></div>
      <div class="veld"><label for="m-start">Eerste maandtermijn op</label><input id="m-start" name="startDate" type="date" value="${morgen}"><div class="hulp">Standaard een maand na de eerste betaling. Kies bijvoorbeeld de dag na oplevering.</div></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="sendMail" checked> Stuur de betaallink per mail naar ${c.email}</label></div>
      <button class="knop knop-actie" type="submit">Betaallink maken</button></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Bezig…");
      try {
        const r = await api(`hq/customers/${c.id}/payment`, { method: "POST", body: { startDate: form.elements.startDate.value, sendMail: form.elements.sendMail.checked, iban: form.elements.iban.value, ibanNaam: form.elements.ibanNaam.value } });
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
  async function wijzigingen(main, sub) {
    if (sub === "voorstel") { wijzigingFilter = "voorstel"; history.replaceState(null, "", "#wijzigingen"); }
    const api_f = wijzigingFilter === "alle" ? "" : wijzigingFilter === "voorstel" ? "open" : wijzigingFilter;
    let { changes } = await api("hq/changes?status=" + api_f);
    if (wijzigingFilter === "voorstel") changes = changes.filter((w) => w.ai?.status === "voorstel");
    const klaar = changes.filter((w) => w.ai?.status === "voorstel");
    const f = [["voorstel", "Klaar voor goedkeuring"], ["open", "Open"], ["ontvangen", "Ontvangen"], ["in_behandeling", "In behandeling"], ["verwerkt", "Verwerkt"], ["afgewezen", "Niet uitgevoerd"], ["alle", "Alle"]];
    render(main, html`
      <div class="hq-kop"><div><h1>Wijzigingen</h1><p>Claude maakt bij elke wijziging een voorstel op een voorbeeldsite. Jij kijkt het na en keurt goed; dan staat het live en krijgt de klant een mail. Alles binnen 48 uur.</p></div>
        ${klaar.length > 1 ? html`<button class="knop knop-actie" id="alles-goed">Alle ${klaar.length} voorstellen goedkeuren</button>` : ""}</div>
      <div class="filters" role="group" aria-label="Filter">${f.map(([k, t]) => html`<button aria-pressed="${k === wijzigingFilter}" data-f="${k}">${t}</button>`)}</div>
      <section class="paneel">${changes.length ? html`<ul class="lijst">${changes.map((w) => wijzigingItem(w, true))}</ul>` : html`<div class="leeg"><h3>Niets in deze lijst</h3><p>${wijzigingFilter === "open" ? "Alle wijzigingen zijn verwerkt." : wijzigingFilter === "voorstel" ? "Er wachten geen voorstellen op goedkeuring." : "Er zijn geen wijzigingen met deze status."}</p></div>`}</section>`);
    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { wijzigingFilter = b.dataset.f; wijzigingen(main); }));
    main.querySelector("#alles-goed")?.addEventListener("click", async (e) => {
      if (!(await SM.bevestig(`${klaar.length} voorstellen goedkeuren?`, "Alle voorstellen in deze lijst gaan live en de klanten krijgen een mail. Heb je de voorbeeldsites bekeken?", "Alles goedkeuren"))) return;
      SM.bezig(e.target, true, "Live zetten…");
      try {
        const r = await api("hq/changes/goedkeuren", { method: "POST", body: { ids: klaar.map((w) => w.id) } });
        const mis = r.results.filter((x) => !x.ok);
        toast(mis.length ? `${r.results.length - mis.length} live gezet, ${mis.length} mislukt: ${mis[0].error}` : `${r.results.length} wijzigingen live gezet`, mis.length ? "fout" : "ok");
      } catch (err) { toast(err.message, "fout"); }
      herlaad();
    });
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
      ${aiBlok(w, open)}
      <form class="wijziging-form" novalidate>
        <div class="rij3">
          <div class="veld"><label for="ws-${w.id}">Status</label><select id="ws-${w.id}" name="status">${opties(L.wijziging, w.status)}</select></div>
          <div class="veld"><label for="wn-${w.id}">Toelichting voor de klant</label><input id="wn-${w.id}" name="staffNote" value="${w.staffNote || ""}"></div>
          <div class="veld"><span class="label">&nbsp;</span><label class="vinkje"><input type="checkbox" name="counts" ${w.counts ? raw("checked") : ""}> Telt mee voor de 4</label></div>
        </div>
        <div class="knoppen"><button class="knop knop-klein" type="submit">Opslaan</button><label class="vinkje klein"><input type="checkbox" name="notify" checked> Klant mailen bij Verwerkt of Niet uitgevoerd</label></div>
      </form></li>`;
  }
  // Leesbare naam voor een veld uit content.json, bijv. "openingstijden[0].tijd" → "Openingstijden 1 · tijd".
  const VELD = { thema: "Stijl", bedrijf: "Bedrijf", seo: "Zoekmachines", hero: "Bovenaan", diensten: "Diensten", over: "Over ons", fotos: "Foto's", openingstijden: "Openingstijden", contact: "Contact",
    naam: "naam", titel: "kop", tekst: "tekst", label: "label", foto: "foto", knop: "knop", items: "", omschrijving: "omschrijving", telefoon: "telefoon", email: "e-mail", adres: "adres", tijd: "tijd", dag: "dag", plaats: "plaats" };
  const veldNaam = (v) => String(v).replace(/\.items\[/g, "[").split(".").map((d, i) => { const m = d.match(/^(\w+)(?:\[(\d+)\])?$/); if (!m) return d; const n = VELD[m[1]] ?? m[1]; return (i ? n : n.charAt(0).toUpperCase() + n.slice(1)) + (m[2] != null ? " " + (Number(m[2]) + 1) : ""); }).filter(Boolean).join(" · ");

  // Het voorstel van Claude bij een wijziging.
  function aiBlok(w, open) {
    const a = w.ai || {};
    const kort = (v) => { const t = v == null || v === "" ? "–" : typeof v === "string" ? v : JSON.stringify(v); return t.length > 220 ? t.slice(0, 220) + "…" : t; };
    if (!a.status) return open ? html`<div class="ai-blok ai-leeg"><button class="knop knop-licht knop-klein" type="button" data-ai="verwerk">Laat Claude een voorstel maken</button></div>` : "";
    const kop = html`<div class="ai-kop"><b>Claude</b>${chip(L.ai, a.status)}${a.attempts > 1 ? html`<span class="klein dempen">voorstel ${a.attempts}</span>` : ""}${a.updatedAt ? html`<span class="klein dempen">${geleden(a.updatedAt)}</span>` : ""}</div>`;
    if (a.status === "wachtrij" || a.status === "bezig") return html`<div class="ai-blok">${kop}<p class="klein">Claude past de site aan op een aparte voorbeeldversie. Dat duurt meestal een paar minuten; ververs de pagina straks.</p></div>`;
    if (a.status === "voorstel") return html`<div class="ai-blok ai-voorstel">${kop}
      ${a.summary ? html`<p class="ai-samenvatting">${a.summary}</p>` : ""}
      ${a.diff?.length ? html`<div class="tabel-wrap"><table class="tabel ai-diff"><thead><tr><th>Onderdeel</th><th>Was</th><th>Wordt</th></tr></thead><tbody>${a.diff.slice(0, 30).map((d) => html`<tr><td class="klein" title="${d.veld}">${veldNaam(d.veld)}</td><td class="oud">${kort(d.oud)}</td><td class="nieuw">${kort(d.nieuw)}</td></tr>`)}</tbody></table></div>${a.diff.length > 30 ? html`<p class="klein dempen">En nog ${a.diff.length - 30} kleine aanpassingen; zie de pull request.</p>` : ""}` : ""}
      ${a.feedback ? html`<p class="klein dempen">Jouw opmerking: ${a.feedback}</p>` : ""}
      <div class="knoppen">${a.previewUrl ? html`<a class="knop knop-licht knop-klein" href="${a.previewUrl}" target="_blank" rel="noopener">${raw(icon.open)}Voorbeeld bekijken</a>` : ""}
        <button class="knop knop-actie knop-klein" type="button" data-ai="goedkeuren">Goedkeuren en live zetten</button>
        <button class="knop knop-licht knop-klein" type="button" data-ai="opnieuw">Opnieuw, met opmerking</button>
        <button class="knop knop-tekst knop-klein" type="button" data-ai="handmatig">Zelf afhandelen</button>
        ${a.prUrl ? html`<a class="knop knop-tekst knop-klein" href="${a.prUrl}" target="_blank" rel="noopener">Pull request</a>` : ""}</div>
      ${a.previewUrl ? html`<p class="klein dempen">De voorbeeldsite staat meestal binnen een minuut klaar.</p>` : ""}</div>`;
    if (a.status === "goedgekeurd") return html`<div class="ai-blok">${kop}${a.summary ? html`<p class="klein">${a.summary}</p>` : ""}${a.prUrl ? html`<a class="klein" href="${a.prUrl}" target="_blank" rel="noopener">Bekijk de wijziging op GitHub</a>` : ""}</div>`;
    return html`<div class="ai-blok ai-${a.status}">${kop}<p class="klein">${a.status === "fout" ? "Er ging iets mis: " : "Claude doet dit niet automatisch: "}${a.reason || "geen reden opgegeven."}</p>
      ${open ? html`<div class="knoppen"><button class="knop knop-licht knop-klein" type="button" data-ai="verwerk">Claude opnieuw laten proberen</button></div>` : ""}</div>`;
  }

  function koppelWijzigingen(main) {
    main.querySelectorAll("[data-wijziging] [data-ai]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest("[data-wijziging]").dataset.wijziging, actie = b.dataset.ai;
      if (actie === "opnieuw") {
        const dlg = SM.dialoog("Opnieuw, met opmerking", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <p class="dempen">Claude maakt een nieuw voorstel en houdt rekening met wat je hier schrijft.</p>
          <div class="veld"><label for="ai-fb">Wat moet anders?</label><textarea id="ai-fb" name="feedback" rows="4" required placeholder="Bijvoorbeeld: laat de kop staan, pas alleen de openingstijden aan."></textarea><div class="fout" data-fout-voor="feedback"></div></div>
          <button class="knop knop-actie" type="submit">Nieuw voorstel maken</button></form>`);
        const form = dlg.querySelector("form");
        form.addEventListener("submit", async (e) => {
          e.preventDefault(); SM.wisFouten(form);
          const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Bezig…");
          try { await api(`hq/changes/${id}/opnieuw`, { method: "POST", body: { feedback: form.elements.feedback.value } }); dlg.close(); toast("Claude maakt een nieuw voorstel"); herlaad(); }
          catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
        });
        return;
      }
      if (actie === "handmatig" && !(await SM.bevestig("Zelf afhandelen?", "Het voorstel van Claude vervalt. Je past de site zelf aan en zet de wijziging daarna op Verwerkt.", "Zelf afhandelen"))) return;
      SM.bezig(b, true, actie === "goedkeuren" ? "Live zetten…" : "Bezig…");
      try {
        const r = await api(`hq/changes/${id}/${actie}`, { method: "POST", body: {} });
        if (actie === "verwerk" && !r.queued) toast("Kan niet: deze klant heeft nog geen gekoppelde site, of Claude is al bezig.", "fout");
        else toast({ goedkeuren: "Live gezet. De klant krijgt een mail.", verwerk: "Claude gaat aan de slag", handmatig: "Je handelt deze wijziging zelf af" }[actie]);
      } catch (err) { toast(err.message, "fout"); }
      herlaad();
    }));
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

  // ================================================ AGENDA (kennismakingen)
  const dagKop = (iso) => {
    const d = new Date(iso), nu = new Date(), morgen = new Date(Date.now() + 86400000);
    const zelfde = (a, b) => a.toDateString() === b.toDateString();
    const t = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    return zelfde(d, nu) ? `Vandaag, ${t}` : zelfde(d, morgen) ? `Morgen, ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
  };
  const hm = (iso) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const AFSPRAAK_SOORT = { video: "Videomeeting", telefoon: "Belafspraak" };
  const soortChip = (a) => (a.startsAt ? html`<span class="soort-chip soort-${a.soort || "kennis"}">${AFSPRAAK_SOORT[a.soort] || "Kennismaking"}</span>` : "");
  const afspraakTijd = (iso) => `${dagKop(iso)} · ${hm(iso)}`;
  let agendaTab = "afspraken";
  async function aanvragen(main) {
    render(main, html`
      <div class="hq-kop"><div><h1>Agenda</h1><p>Kennismakingen die via de website geboekt zijn, en wanneer je te boeken bent.</p></div>
        <div class="knoppen"><button class="knop knop-licht" id="abonneer">${raw(icon.open)}In je eigen agenda</button></div></div>
      <div class="filters" role="group" aria-label="Weergave">${[["afspraken", "Afspraken"], ["beschikbaarheid", "Beschikbaarheid"], ["instellingen", "Vaste tijden"]].map(([k, t]) => html`<button aria-pressed="${k === agendaTab}" data-tab="${k}">${t}</button>`)}</div>
      <div id="agenda-inhoud"><p class="dempen">Laden…</p></div>`);
    main.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { agendaTab = b.dataset.tab; aanvragen(main); }));
    main.querySelector("#abonneer").onclick = async () => {
      const d = await api("hq/agenda");
      const dlg = SM.dialoog("Afspraken in je eigen agenda", html`<p>Voeg deze link toe als agenda-abonnement. Nieuwe en geannuleerde afspraken verschijnen dan vanzelf, met naam, bedrijf en telefoonnummer.</p>
        <div class="veld"><label for="feed">Agenda-link</label><input id="feed" readonly value="${d.feedUrl}"></div>
        <div class="knoppen"><button class="knop" data-kopieer="${d.feedUrl}">Link kopiëren</button></div>
        <ul class="klein dempen"><li><b>Google Agenda</b> (op de computer): Andere agenda's › + › Via URL › plak de link.</li><li><b>iPhone</b>: Instellingen › Agenda › Accounts › Voeg account toe › Andere › Voeg agenda-abonnement toe.</li><li><b>Outlook</b>: Agenda toevoegen › Abonneren via internet.</li></ul>
        <p class="klein dempen">Houd deze link voor jezelf: iedereen met de link ziet je afspraken. Google ververst een abonnement een paar keer per dag; in HQ zie je nieuwe afspraken altijd meteen.</p>`);
      koppelKopieer(dlg);
    };
    const vak = main.querySelector("#agenda-inhoud");
    if (agendaTab === "afspraken") return agendaAfspraken(vak);
    const d = await api("hq/agenda");
    if (agendaTab === "beschikbaarheid") return agendaBeschikbaarheid(vak, d);
    return agendaInstellingen(vak, d.agenda);
  }

  async function agendaAfspraken(vak) {
    const { appointments } = await api("hq/appointments");
    const nu = Date.now();
    const komend = appointments.filter((a) => a.startsAt && a.status !== "geannuleerd" && Date.parse(a.startsAt) > nu - 30 * 60000);
    const terugbel = appointments.filter((a) => !a.startsAt && a.status === "nieuw");
    const eerder = appointments.filter((a) => !komend.includes(a) && !terugbel.includes(a));
    const perDag = {};
    komend.forEach((a) => { (perDag[dagKop(a.startsAt)] ||= []).push(a); });
    render(vak, html`
      ${terugbel.length ? html`<section class="paneel"><h2>Terugbelverzoeken</h2><p class="klein dempen">Via het formulier, zonder vast moment.</p><ul class="lijst">${terugbel.map((a) => afspraakItem(a))}</ul></section>` : ""}
      <section class="paneel"><h2>Komende afspraken</h2>
        ${komend.length ? Object.entries(perDag).map(([dag, lijst]) => html`<h3 class="sub-kop">${dag}</h3><ul class="lijst">${lijst.map((a) => afspraakItem(a))}</ul>`)
          : html`<div class="leeg"><h3>Nog geen afspraken</h3><p>Zodra iemand via de website een kennismaking boekt, staat hij hier. Je krijgt ook een mail.</p></div>`}</section>
      ${eerder.length ? html`<section class="paneel"><details><summary><b>Eerdere afspraken en aanvragen (${eerder.length})</b></summary><ul class="lijst">${eerder.slice(0, 100).map((a) => afspraakItem(a))}</ul></details></section>` : ""}`);
    vak.querySelectorAll("[data-aanvraag]").forEach((li) => {
      const a = appointments.find((x) => String(x.id) === li.dataset.aanvraag);
      li.querySelector("form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("hq/appointments/" + a.id, { method: "PUT", body: Object.fromEntries(new FormData(e.target)) }); toast("Opgeslagen"); herlaad(); } catch (err) { toast(err.message, "fout"); }
      });
      li.querySelector("[data-klant]")?.addEventListener("click", () => klantDialoog({ company: a.company, contactName: a.name, email: a.email, phone: a.phone, notes: a.message, appointmentId: a.id }));
      li.querySelector("[data-annuleer]")?.addEventListener("click", async () => {
        if (!(await SM.bevestig("Afspraak annuleren?", `${a.name} krijgt een mail dat de kennismaking van ${afspraakTijd(a.startsAt)} niet doorgaat, met een link om een nieuw moment te kiezen.`, "Annuleren en mailen"))) return;
        try { await api(`hq/appointments/${a.id}/annuleren`, { method: "POST", body: {} }); toast("Geannuleerd. Het moment is weer vrij."); herlaad(); } catch (err) { toast(err.message, "fout"); }
      });
    });
  }
  function afspraakItem(a) {
    const geweest = a.startsAt && Date.parse(a.startsAt) < Date.now();
    return html`<li data-aanvraag="${a.id}">
      <div class="wijziging-kop"><div>${a.startsAt ? html`<b class="afspraak-tijd">${hm(a.startsAt)}</b> ` : ""}${soortChip(a)} <b>${a.company}</b> · ${a.name}</div>${chip(L.aanvraag, a.status)}</div>
      <div class="wijziging-meta">${a.phone ? html`<a href="tel:${a.phone.replace(/\s/g, "")}">${raw(icon.tel || "")}${a.phone}</a>` : ""}<a href="mailto:${a.email}">${a.email}</a>${!a.startsAt ? html`<span>${L.voorkeur[a.preference] || ""}</span>` : ""}<span>${a.startsAt && a.status === "geannuleerd" ? `Was ${afspraakTijd(a.startsAt)} · geannuleerd door ${a.canceledBy === "klant" ? "de klant" : "Sitemaker"}` : a.startsAt && geweest ? afspraakTijd(a.startsAt) : `Geboekt ${geleden(a.createdAt)}`}</span></div>
      ${a.message ? html`<p class="wijziging-tekst">${a.message}</p>` : ""}
      ${a.status !== "geannuleerd" ? html`<form novalidate><div class="rij2"><div class="veld"><label for="as-${a.id}">Hoe ging het?</label><select id="as-${a.id}" name="status">${Object.entries(L.aanvraag).filter(([k]) => k !== "geannuleerd").map(([k, [t]]) => html`<option value="${k}" ${k === a.status ? raw("selected") : ""}>${t}</option>`)}</select></div>
          <div class="veld"><label for="an-${a.id}">Notitie</label><input id="an-${a.id}" name="staffNote" value="${a.staffNote || ""}"></div></div>
        <div class="knoppen"><button class="knop knop-klein" type="submit">Opslaan</button>${a.customerId ? html`<a class="knop knop-licht knop-klein" href="#klant/${a.customerId}">Naar klant</a>` : html`<button class="knop knop-actie knop-klein" type="button" data-klant>Maak klant aan</button>`}
          ${a.startsAt && !geweest ? html`<button class="knop knop-tekst knop-klein" type="button" data-annuleer>Afspraak annuleren</button>` : ""}</div></form>` : ""}</li>`;
  }

  function agendaBeschikbaarheid(vak, d) {
    render(vak, html`
      ${!d.agenda.actief ? html`<div class="melding melding-let">${raw(icon.let)}<p>Online boeken staat uit. Bezoekers zien op de website alleen het terugbelformulier. Zet het aan bij Vaste tijden.</p></div>` : ""}
      <section class="paneel"><div class="paneel-kop"><h2>Komende 3 weken</h2><span class="klein dempen">Klik op een tijd om hem dicht of open te zetten. Dagen zonder vaste tijden staan hier niet; die zet je open met Extra tijd.</span></div>
        <div class="slot-legenda klein"><span class="slot vrij">Vrij</span><span class="slot dicht">Dicht</span><span class="slot geboekt">Geboekt</span></div>
        <div class="slot-dagen">${d.days.filter((dag) => dag.slots.length).map((dag) => html`<div class="slot-dag ${dag.slots.some((x) => x.status === "vrij") ? "" : "leeg"}">
          <div class="slot-dagkop"><b>${dag.label.charAt(0).toUpperCase() + dag.label.slice(1)}</b>${dag.slots.some((x) => x.status === "vrij") ? html`<button class="knop knop-tekst knop-klein" data-dagdicht="${dag.date}">Hele dag dicht</button>` : dag.slots.some((x) => x.status === "dicht") ? html`<button class="knop knop-tekst knop-klein" data-dagopen="${dag.date}">Dag weer openzetten</button>` : ""}</div>
          ${dag.slots.length ? html`<div class="slots">${dag.slots.map((x) => x.status === "geboekt"
            ? html`<a class="slot geboekt" href="#aanvragen" title="${x.afspraak.company}">${x.tijd}<small>${x.afspraak.company}</small></a>`
            : html`<button class="slot ${x.status}" ${x.status === "voorbij" ? raw("disabled") : ""} data-slot="${x.start}" data-dicht="${x.status === "vrij" ? "1" : "0"}" aria-label="${x.tijd} ${x.status === "vrij" ? "dichtzetten" : "openzetten"}">${x.tijd}</button>`)}</div>`
            : html`<p class="klein dempen">Geen vaste tijden op deze dag.</p>`}</div>`)}</div></section>
      <div class="twee">
        <section class="paneel"><h2>Vrij nemen</h2><p class="klein dempen">Vakantie of een vrije dag: niemand kan dan boeken. Bestaande afspraken blijven staan.</p>
          <form novalidate id="vrij"><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
            <div class="rij2"><div class="veld"><label for="v-van">Van</label><input id="v-van" name="van" type="date" required><div class="fout" data-fout-voor="van"></div></div><div class="veld"><label for="v-tot">Tot en met</label><input id="v-tot" name="tot" type="date"><div class="fout" data-fout-voor="tot"></div></div></div>
            <div class="veld"><label for="v-note">Notitie <span class="opt">(optioneel)</span></label><input id="v-note" name="note" placeholder="Vakantie"></div>
            <button class="knop knop-klein" type="submit">Dichtzetten</button></form></section>
        <section class="paneel"><h2>Extra tijd openzetten</h2><p class="klein dempen">Bijvoorbeeld één avond of een zaterdagochtend buiten je vaste tijden.</p>
          <form novalidate id="extra"><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
            <div class="veld"><label for="x-dag">Dag</label><input id="x-dag" name="van" type="date" required><div class="fout" data-fout-voor="van"></div></div>
            <div class="rij2"><div class="veld"><label for="x-van">Van</label><input id="x-van" name="vanTijd" type="time" step="900" required><div class="fout" data-fout-voor="vanTijd"></div></div><div class="veld"><label for="x-tot">Tot</label><input id="x-tot" name="totTijd" type="time" step="900" required></div></div>
            <button class="knop knop-klein" type="submit">Openzetten</button></form></section>
      </div>
      ${d.exceptions.length ? html`<section class="paneel"><h2>Gepland vrij en extra tijden</h2><ul class="lijst">${d.exceptions.map((x) => html`<li class="factuur-rij"><div><span class="status ${x.kind === "dicht" ? "s-grijs" : "s-ok"}">${x.kind === "dicht" ? "Dicht" : "Extra open"}</span> ${x.label}${x.note ? html`<br><span class="klein dempen">${x.note}</span>` : ""}</div><button class="knop knop-tekst knop-klein" data-uitzondering="${x.id}">Verwijderen</button></li>`)}</ul></section>` : ""}`);
    vak.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api("hq/agenda/slot", { method: "POST", body: { start: b.dataset.slot, dicht: b.dataset.dicht === "1" } }); const nd = await api("hq/agenda"); agendaBeschikbaarheid(vak, { ...nd }); }
      catch (err) { toast(err.message, "fout"); b.disabled = false; }
    }));
    const dagActie = async (body, melding) => { try { const r = await api("hq/agenda/uitzondering", { method: "POST", body }); toast(r.bestaandeAfspraken ? `${melding} Let op: er ${r.bestaandeAfspraken === 1 ? "staat nog 1 afspraak" : `staan nog ${r.bestaandeAfspraken} afspraken`}.` : melding); agendaBeschikbaarheid(vak, await api("hq/agenda")); } catch (err) { toast(err.message, "fout"); } };
    vak.querySelectorAll("[data-dagdicht]").forEach((b) => b.addEventListener("click", () => dagActie({ kind: "dicht", van: b.dataset.dagdicht, tot: b.dataset.dagdicht }, "Dag dichtgezet.")));
    vak.querySelectorAll("[data-dagopen]").forEach((b) => b.addEventListener("click", async () => {
      const dag = d.days.find((x) => x.date === b.dataset.dagopen);
      for (const x of dag.slots.filter((y) => y.status === "dicht")) await api("hq/agenda/slot", { method: "POST", body: { start: x.start, dicht: false } }).catch(() => {});
      agendaBeschikbaarheid(vak, await api("hq/agenda"));
    }));
    vak.querySelectorAll("[data-uitzondering]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("hq/agenda/uitzondering/" + b.dataset.uitzondering, { method: "DELETE" }); agendaBeschikbaarheid(vak, await api("hq/agenda")); } catch (err) { toast(err.message, "fout"); }
    }));
    for (const [id, kind] of [["#vrij", "dicht"], ["#extra", "open"]]) {
      const form = vak.querySelector(id);
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const b = { kind, ...Object.fromEntries(new FormData(form)) };
        if (kind === "dicht" && !b.tot) b.tot = b.van;
        try { const r = await api("hq/agenda/uitzondering", { method: "POST", body: b }); toast(kind === "dicht" ? (r.bestaandeAfspraken ? `Dichtgezet. Let op: er staan nog ${r.bestaandeAfspraken} afspraak/afspraken in die periode.` : "Dichtgezet.") : "Extra tijd opengezet."); agendaBeschikbaarheid(vak, await api("hq/agenda")); }
        catch (err) { SM.toonFouten(form, err); }
      });
    }
  }

  function agendaInstellingen(vak, a) {
    const DAGEN = [[1, "Maandag"], [2, "Dinsdag"], [3, "Woensdag"], [4, "Donderdag"], [5, "Vrijdag"], [6, "Zaterdag"], [0, "Zondag"]];
    const tekst = (r) => (r || []).map(([f, t]) => `${f}-${t}`).join(", ");
    render(vak, html`<section class="paneel"><form novalidate id="ag-form"><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
      <div class="veld"><label class="vinkje"><input type="checkbox" name="actief" ${a.actief ? raw("checked") : ""}> <span>Online boeken staat aan<small class="hulp">Uit: bezoekers zien alleen het terugbelformulier.</small></span></label></div>
      <h2>Vaste tijden</h2><p class="klein dempen">Per dag de blokken waarin je te boeken bent, bijvoorbeeld <code>09:00-12:00, 13:00-17:00</code>. Leeg = die dag niet.</p>
      <div class="dagen-tijden">${DAGEN.map(([n, t]) => html`<div class="veld"><label for="w-${n}">${t}</label><input id="w-${n}" name="w${n}" value="${tekst(a.week[n])}" placeholder="Niet beschikbaar"><div class="fout" data-fout-voor="w${n}"></div></div>`)}</div>
      <h2>Gesprek</h2>
      <div class="rij3">
        <div class="veld"><label for="ag-duur">Duur (minuten)</label><input id="ag-duur" name="duur" type="number" min="5" max="120" value="${a.duur}"></div>
        <div class="veld"><label for="ag-int">Elke … minuten een moment</label><input id="ag-int" name="interval" type="number" min="5" max="240" value="${a.interval}"><div class="hulp">Duur + pauze. 30 bij 15 minuten bellen = een kwartier ruimte.</div></div>
        <div class="veld"><label for="ag-max">Max. gesprekken per dag</label><input id="ag-max" name="maxPerDag" type="number" min="0" max="50" value="${a.maxPerDag}"><div class="hulp">0 = geen maximum</div></div>
      </div>
      <div class="rij3">
        <div class="veld"><label for="ag-min">Minimaal … uur van tevoren</label><input id="ag-min" name="minUren" type="number" min="0" max="168" value="${a.minUren}"></div>
        <div class="veld"><label for="ag-vooruit">Tot … dagen vooruit</label><input id="ag-vooruit" name="dagenVooruit" type="number" min="1" max="90" value="${a.dagenVooruit}"></div>
        <div class="veld"><label for="ag-soort">Soort gesprek</label><select id="ag-soort" name="soort"><option value="telefoon" ${a.soort === "telefoon" ? raw("selected") : ""}>Telefoon (jij belt)</option><option value="video" ${a.soort === "video" ? raw("selected") : ""}>Videogesprek</option></select></div>
      </div>
      <div class="veld"><label for="ag-video">Link voor videomeetings <span class="opt">(Google Meet of Zoom; staat in elke bevestiging)</span></label><input id="ag-video" name="videoLink" value="${a.videoLink || ""}" placeholder="https://meet.google.com/…"><div class="fout" data-fout-voor="videoLink"></div></div>
      <button class="knop knop-actie" type="submit">Opslaan</button></form></section>`);
    const form = vak.querySelector("#ag-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const f = form.elements, week = {}, errors = {};
      for (const [n] of DAGEN) {
        const v = f["w" + n].value.trim();
        const ranges = v ? v.split(/[,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\./g, ":").split(/\s*[-–]\s*/).map((t) => (t.length === 4 ? "0" + t : t))) : [];
        if (ranges.some((r) => r.length !== 2 || !/^\d\d:\d\d$/.test(r[0]) || !/^\d\d:\d\d$/.test(r[1]) || r[0] >= r[1])) errors["w" + n] = "Schrijf het zo: 09:00-12:00, 13:00-17:00";
        week[n] = ranges;
      }
      if (Object.keys(errors).length) return SM.toonFouten(form, { message: "Controleer de tijden.", data: { errors } });
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opslaan…");
      try {
        await api("hq/agenda/instellingen", { method: "PUT", body: { actief: f.actief.checked, week, duur: f.duur.value, interval: f.interval.value, maxPerDag: f.maxPerDag.value, minUren: f.minUren.value, dagenVooruit: f.dagenVooruit.value, soort: f.soort.value, videoLink: f.videoLink.value } });
        toast("Opgeslagen. De website toont direct de nieuwe tijden."); SM.bezig(knop, false);
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
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
      <div class="hq-kop"><div><h1>Betalingen</h1><p>Online betalen via Pay.nl: eerste betaling (bouwprijs), daarna elke maand automatische incasso van het abonnement.</p></div></div>
      ${!d.mollie.ready ? html`<div class="melding melding-let">${raw(icon.let)}<p><b>Pay.nl is nog niet gekoppeld.</b> Zet PAYNL_SERVICE_ID, PAYNL_SERVICE_SECRET, PAYNL_AT_CODE en PAYNL_TOKEN in Netlify. Tot die tijd kun je klanten op "Handmatig gefactureerd" zetten en losse facturen toevoegen.</p></div>`
        : d.mollie.mode === "test" ? html`<div class="melding melding-info">${raw(icon.let)}<p>Pay.nl draait in <b>testmodus</b>: er wordt niets echt afgeschreven.</p></div>` : ""}
      ${!d.vatSet ? html`<div class="melding melding-let">${raw(icon.let)}<p>Kies eerst bij <a href="#instellingen">Instellingen</a> of de prijzen inclusief of exclusief btw zijn. Daarvan hangt af wat Pay.nl afschrijft.</p></div>` : ""}
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
          <td>${chip(L.site, s.siteStatus)}${s.site?.repo ? html`<br><span class="klein dempen">Automatisch via ${s.site.repo.split("/")[1]}</span>` : ""}</td>
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
  // ================================================ B2B: overzicht (waar we zoeken, wat het oplevert) + leads
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
  const b2bTabs = (actief, d) => html`<nav class="sub-tabs" aria-label="B2B"><a href="#b2b" ${actief === "overzicht" ? raw('aria-current="page"') : ""}>Overzicht</a><a href="#b2b/leads" ${actief === "leads" ? raw('aria-current="page"') : ""}>Leads${d ? html` <span class="n">${d}</span>` : ""}</a><a href="#concepten">Concepten</a></nav>`;
  let mailPeriode = "d7";
  function mailPrestaties(vak, d) {
    const P = { vandaag: "Vandaag", d7: "7 dagen", d30: "30 dagen", alles: "Alles" };
    const s = d.mail[mailPeriode], pc = (v) => (v == null ? "–" : String(v).replace(".", ",") + "%");
    const tegel = (waarde, naam, sub, cls = "") => html`<div class="kpi ${cls}"><div class="waarde">${waarde}</div><div class="naam">${naam}${sub ? html`<br><span class="klein">${sub}</span>` : ""}</div></div>`;
    render(vak, html`<div class="paneel-kop"><h2>Mailprestaties</h2>
        <div class="segment" role="group" aria-label="Periode">${Object.entries(P).map(([k, t]) => html`<button class="knop knop-klein ${k === mailPeriode ? "" : "knop-licht"}" data-p="${k}" aria-pressed="${k === mailPeriode}">${t}</button>`)}</div></div>
      ${d.mail.waarschuwingen.map((w) => html`<div class="melding melding-fout">${raw(icon.let)}<p>${w}</p></div>`)}
      <div class="kpis kpis-8">
        ${tegel(s.verstuurd, "verstuurd", `${s.eerste} eerste · ${s.opvolging} opvolg${s.mislukt ? ` · ${s.mislukt} mislukt` : ""}`)}
        ${tegel(pc(s.pct.afgeleverd), "afgeleverd", `${s.afgeleverd} mails`)}
        ${tegel(pc(s.pct.bounce), "bounce", `${s.bounces} kwamen niet aan`, s.verstuurd >= 20 && s.pct.bounce > 3 ? "alarm" : "")}
        ${tegel(d.meten.opens ? pc(s.pct.geopend) : "uit", "geopend", d.meten.opens ? `${s.geopend} mails · indicatie` : "meten staat uit")}
        ${tegel(pc(s.pct.geklikt), "geklikt", `${s.geklikt} op link of concept`)}
        ${tegel(pc(s.pct.reacties), "reacties", `${s.reacties} mails`, s.reacties ? "goed" : "")}
        ${tegel(pc(s.pct.afmeldingen), "afgemeld", `${s.afmeldingen} mails`, s.verstuurd >= 20 && s.pct.afmeldingen > 2 ? "alarm" : "")}
        ${tegel(pc(s.pct.klachten), "klachten", `${s.klachten} als spam/klacht`, s.klachten ? "alarm" : "")}
      </div>
      <p class="klein dempen">Percentages ten opzichte van afgeleverde mails. Geopend is een indicatie: sommige mailprogramma's laden plaatjes vooraf (telt te hoog) of blokkeren ze (telt te laag). Klikken en reacties zeggen meer. Opens en klikken binnen een minuut na verzenden of van virusscanners tellen niet mee. Richtwaarden: bounce onder 3%, klachten bijna 0.${isAdmin() ? html` <button class="knop knop-tekst knop-klein" type="button" id="meten">Meten aan/uit</button>` : ""}</p>`);
    vak.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => { mailPeriode = b.dataset.p; mailPrestaties(vak, d); }));
    vak.querySelector("#meten")?.addEventListener("click", () => {
      const dlg = SM.dialoog("Meten in B2B-mails", html`<form novalidate>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="opens" ${d.meten.opens ? raw("checked") : ""}> Opens meten (onzichtbaar plaatje)</label></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="kliks" ${d.meten.kliks ? raw("checked") : ""}> Klikken meten (links lopen via sitemaker)</label></div>
        <p class="klein dempen">Dit staat ook in de privacyverklaring. Uitzetten kan de afleverbaarheid iets verbeteren; je ziet dan alleen reacties en concept-bezoeken.</p>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => { e.preventDefault(); try { await api("hq/settings", { method: "PUT", body: { b2b: { meten: { opens: form.elements.opens.checked, kliks: form.elements.kliks.checked } } } }); dlg.close(); toast("Opgeslagen"); herlaad(); } catch (err) { toast(err.message, "fout"); } });
    });
  }
  async function b2b(main, sub) {
    if (sub === "leads") return b2bLeads(main);
    const d = await api("hq/b2b");
    const t = d.totaal, v = d.vandaag, z = d.verzenden, sc = d.scout;
    const dag = (s) => new Date(s + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric" });
    const maxDag = Math.max(1, ...d.dagen.map((x) => Math.max(x.gevonden, x.verstuurd)));
    const vensterTekst = !z.mail ? "Mail is nog niet ingesteld; goedgekeurde mails wachten in de wachtrij."
      : z.open ? `Verzenden staat open tot ${z.uren[1]}:00. Elke 5 minuten gaan er een paar de deur uit.`
      : z.weekend ? `Weekend: maandag vanaf ${z.uren[0]}:00 gaat het verzenden weer verder.`
      : `Buiten verzendtijd (${z.uren[0]}:00–${z.uren[1]}:00).`;
    const scoutTekst = !sc.klaar ? "Outscraper is niet gekoppeld (OUTSCRAPER_API_KEY)." : !sc.actief ? "De scout staat uit. Zet hem aan om elke werkdag automatisch te zoeken." : `Zoekt elke werkdag vanaf 7:00 automatisch, ongeveer ${sc.perDag} bedrijven per dag.`;
    render(main, html`
      <div class="hq-kop"><div><h1>B2B</h1><p>Joep zoekt bedrijven, Fleur zoekt hun mailadres, Sam maakt een concept-website en Ties verstuurt wat jij goedkeurt.</p></div>
        <div class="knoppen">${sc.klaar ? html`<button class="knop knop-licht" id="scout">Scout nu zoeken</button>` : ""}<a class="knop knop-actie" href="#b2b/leads">Naar de leads</a></div></div>
      ${b2bTabs("overzicht", t.klaar)}
      <div class="kpis kpis-6">
        <a class="kpi" href="#b2b/leads"><div class="waarde">${t.leads}</div><div class="naam">bedrijven gevonden<br><span class="klein">${t.met_mail} met mailadres</span></div></a>
        <a class="kpi" href="#b2b/leads"><div class="waarde">${t.klaar}</div><div class="naam">klaar om te mailen<br><span class="klein">${t.te_onderzoeken} nog te onderzoeken</span></div></a>
        <div class="kpi"><div class="waarde">${t.verstuurd}</div><div class="naam">gemaild<br><span class="klein">${t.afgemeld} afgemeld · ${t.bounces} bounces</span></div></div>
        <div class="kpi ${t.reacties ? "goed" : ""}"><div class="waarde">${t.reacties}</div><div class="naam">reacties<br><span class="klein">${pct(t.reacties, t.verstuurd)} van gemaild</span></div></div>
        <div class="kpi"><div class="waarde">${t.afspraken}</div><div class="naam">afspraken<br><span class="klein">${t.klanten} klant geworden</span></div></div>
      </div>
      <section class="paneel" id="mailprest"></section>
      <div class="twee">
        <section class="paneel"><div class="paneel-kop"><h2>Vandaag</h2><span class="status ${z.open ? "s-ok" : "s-grijs"}">${z.open ? "Verzenden open" : "Verzenden dicht"}</span></div>
          <div class="voortgang" role="img" aria-label="${z.vandaag} van ${z.max} mails verstuurd"><span data-w="${Math.min(100, Math.round((z.vandaag / Math.max(1, z.max)) * 100))}"></span></div>
          <p class="teller-tekst">${z.vandaag} van ${z.max} mails verstuurd<small>${z.opvolgingen ? `waarvan ${z.opvolgingen} opvolgmails · ` : ""}nog ${z.rest} ruimte vandaag</small></p>
          <p class="klein dempen">${vensterTekst}${z.nogTeVersturenVandaag ? ` Er gaan er vandaag nog ongeveer ${z.nogTeVersturenVandaag} uit.` : ""}</p>
          <dl class="gegevens vandaag">
            <dt>In de wachtrij</dt><dd>${z.wachtrij.eerste} eerste mails · ${z.wachtrij.opvolging} opvolgmails</dd>
            <dt>Nieuw gevonden</dt><dd>${v.gevonden}</dd>
            <dt>Onderzocht</dt><dd>${v.onderzocht}</dd>
            <dt>Concepten gemaakt</dt><dd>${v.concepten}</dd>
            <dt>Concept voor het eerst bekeken</dt><dd>${v.bekeken}</dd>
            <dt>Reacties</dt><dd>${v.reacties ? html`<a href="#b2b/leads" data-naar="reactie"><b>${v.reacties}</b></a>` : 0}</dd>
            <dt>Inbox gelezen</dt><dd>${d.inbox?.at ? geleden(d.inbox.at) : "nog niet"}${d.inbox?.error ? html` <span class="klein dempen">(${d.inbox.error})</span>` : ""}</dd>
          </dl>
          ${isAdmin() ? html`<div class="knoppen"><button class="knop knop-licht knop-klein" id="limiet">Daglimiet en verzendtijden</button></div>` : ""}</section>
        <section class="paneel"><div class="paneel-kop"><h2>Waar we zoeken</h2><span class="status ${sc.klaar && sc.actief ? "s-ok" : "s-let"}">${sc.klaar && sc.actief ? "Scout aan" : "Scout uit"}</span></div>
          <p class="klein dempen">${scoutTekst}${sc.laatsteDag ? ` Laatst gezocht: ${datumLang(sc.laatsteDag)}.` : ""}${sc.bezig ? ` ${sc.bezig} zoekopdracht${sc.bezig > 1 ? "en" : ""} lopen nog.` : ""}</p>
          <h3 class="sub-kop">Branches</h3><div class="chips">${sc.categorieen.length ? sc.categorieen.map((c) => html`<span class="chip">${c}</span>`) : html`<span class="dempen klein">Nog geen branches</span>`}</div>
          <h3 class="sub-kop">Plaatsen</h3><div class="chips">${sc.plaatsen.length ? sc.plaatsen.map((c) => html`<span class="chip licht">${c}</span>`) : html`<span class="dempen klein">Nog geen plaatsen</span>`}</div>
          ${sc.plan.length && sc.plaatsen.length ? html`<h3 class="sub-kop">Volgende zoekopdracht per branche</h3><ul class="lijst plan">${sc.plan.map((p) => html`<li><span><b>${p.categorie}</b> in ${p.volgende}</span><span class="klein dempen">${p.rondes ? `ronde ${p.rondes + 1} · ` : ""}${p.gedaan} van ${sc.plaatsen.length} plaatsen gedaan</span></li>`)}</ul>` : ""}
          ${isAdmin() ? html`<div class="knoppen"><button class="knop knop-licht knop-klein" id="zoek-aanpassen">Branches en plaatsen aanpassen</button></div>` : ""}</section>
      </div>
      <section class="paneel"><div class="paneel-kop"><h2>Laatste 14 dagen</h2><span class="legenda"><span class="sw gevonden"></span>Gevonden <span class="sw omzet"></span>Gemaild <span class="sw reactie"></span>Reacties</span></div>
        <div class="staven veertien" role="img" aria-label="Gevonden, gemaild en reacties per dag">${d.dagen.map((x) => html`<div class="staaf-groep" title="${dag(x.dag)}: ${x.gevonden} gevonden, ${x.verstuurd} gemaild, ${x.reacties} reacties"><div class="staaf-paar"><span class="staaf gevonden" data-h="${Math.round((x.gevonden / maxDag) * 100)}"></span><span class="staaf omzet" data-h="${Math.round((x.verstuurd / maxDag) * 100)}"></span><span class="staaf reactie" data-h="${Math.round((x.reacties / maxDag) * 100)}"></span></div><span class="klein dempen">${dag(x.dag)}</span></div>`)}</div></section>
      <section class="paneel"><div class="paneel-kop"><h2>Per branche</h2><span class="klein dempen">Wat werkt het best</span></div>
        ${d.perCategorie.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Branche</th><th class="rechts">Gevonden</th><th class="rechts">Met mail</th><th class="rechts">Gemaild</th><th class="rechts">Concept bekeken</th><th class="rechts">Reacties</th><th class="rechts">Afspraken</th><th class="rechts">Reactie %</th></tr></thead><tbody>
          ${d.perCategorie.map((r) => html`<tr><td><b>${r.naam}</b></td><td class="rechts nummers">${r.gevonden}</td><td class="rechts nummers">${r.met_mail}</td><td class="rechts nummers">${r.verstuurd}</td><td class="rechts nummers">${r.bekeken}</td><td class="rechts nummers">${r.reacties}</td><td class="rechts nummers">${r.afspraken}</td><td class="rechts nummers">${pct(r.reacties, r.verstuurd)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="dempen">Nog geen bedrijven. Zet de scout aan of importeer een CSV bij Leads.</p>`}</section>
      <div class="twee">
        <section class="paneel"><h2>Per plaats</h2>
          ${d.perPlaats.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Plaats</th><th class="rechts">Gevonden</th><th class="rechts">Met mail</th><th class="rechts">Gemaild</th><th class="rechts">Reacties</th></tr></thead><tbody>
            ${d.perPlaats.map((r) => html`<tr><td>${r.naam}</td><td class="rechts nummers">${r.gevonden}</td><td class="rechts nummers">${r.met_mail}</td><td class="rechts nummers">${r.verstuurd}</td><td class="rechts nummers">${r.reacties}</td></tr>`)}</tbody></table></div>` : html`<p class="dempen">Nog niets gevonden.</p>`}</section>
        <section class="paneel"><h2>Laatste zoekopdrachten</h2>
          ${sc.geschiedenis.length ? html`<ul class="lijst zoekopdrachten">${sc.geschiedenis.map((h) => html`<li><div><b>${h.cat}</b> in ${h.place}<br><span class="klein dempen">${tijd(h.at)}</span></div>
            <div class="rechts">${h.status === "klaar" ? html`<span class="nummers">${h.gevonden} gevonden</span><br><span class="klein dempen">${h.nieuw} nieuw</span>` : h.status === "mislukt" ? html`<span class="status s-fout">Mislukt</span>` : html`<span class="status s-info">Bezig</span>`}</div></li>`)}</ul>`
            : html`<p class="dempen">${sc.klaar ? "Nog geen zoekopdrachten. Klik op Scout nu zoeken of zet de scout aan." : "Koppel Outscraper om automatisch bedrijven te zoeken."}</p>`}
          <p class="klein dempen">Bronnen: ${Object.entries(d.bron).map(([k, n]) => `${{ scout: "scout", import: "CSV-import", handmatig: "handmatig", website: "website" }[k] || k} ${n}`).join(" · ") || "–"}</p></section>
      </div>`);
    mailPrestaties(main.querySelector("#mailprest"), d);
    main.querySelectorAll("[data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w + "%"));
    main.querySelectorAll(".staaf[data-h]").forEach((el) => el.style.setProperty("--h", el.dataset.h + "%"));
    main.querySelector("[data-naar]")?.addEventListener("click", () => { leadFilter = "reactie"; });
    main.querySelector("#scout")?.addEventListener("click", async (e) => { SM.bezig(e.target, true, "Zoeken…"); try { await api("hq/scout", { method: "POST" }); toast("Zoekopdrachten gestart; resultaten komen binnen het uur binnen."); setTimeout(herlaad, 800); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); } });
    main.querySelector("#zoek-aanpassen")?.addEventListener("click", () => {
      const dlg = SM.dialoog("Waar zoeken we", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="active" ${sc.actief ? raw("checked") : ""}> Scout aan: elke werkdag automatisch zoeken</label></div>
        <div class="veld"><label for="z-cat">Branches (één per regel)</label><textarea id="z-cat" name="categories" rows="6">${sc.categorieen.join("\n")}</textarea><div class="hulp">Zoals mensen ze in Google Maps zoeken, bijvoorbeeld kapper of loodgieter.</div></div>
        <div class="veld"><label for="z-pl">Plaatsen (één per regel)</label><textarea id="z-pl" name="places" rows="6">${sc.plaatsen.join("\n")}</textarea></div>
        <div class="veld"><label for="z-pd">Ongeveer hoeveel bedrijven per dag</label><input id="z-pd" name="perDay" type="number" min="5" max="300" value="${sc.perDag}"></div>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        try { await api("hq/settings", { method: "PUT", body: { b2b: { scout: { active: form.elements.active.checked, categories: form.elements.categories.value, places: form.elements.places.value, perDay: form.elements.perDay.value } } } }); dlg.close(); toast("Opgeslagen"); herlaad(); }
        catch (err) { SM.toonFouten(form, err); }
      });
    });
    main.querySelector("#limiet")?.addEventListener("click", () => {
      const dlg = SM.dialoog("Daglimiet en verzendtijden", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="l-max">Maximaal aantal mails per dag</label><input id="l-max" name="dailyMax" type="number" min="0" max="200" value="${z.max}"><div class="hulp">Begin rustig (20–40 per dag) zodat je mails niet in de spam belanden; bouw daarna op.</div></div>
        <div class="rij2"><div class="veld"><label for="l-van">Versturen vanaf (uur)</label><input id="l-van" name="van" type="number" min="0" max="23" value="${z.uren[0]}"></div>
          <div class="veld"><label for="l-tot">Tot (uur)</label><input id="l-tot" name="tot" type="number" min="1" max="23" value="${z.uren[1]}"></div></div>
        <div class="veld"><label for="l-uur">Maximaal per uur</label><input id="l-uur" name="perUur" type="number" min="0" max="50" value="${z.perUur || 0}"><div class="hulp">0 = automatisch verdelen over de dag (nu ${z.perUurNu} per uur). Gespreid versturen oogt natuurlijker en laat zien op welk uur mensen reageren.</div></div>
        <p class="klein dempen">Alleen op werkdagen.</p>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        try { await api("hq/settings", { method: "PUT", body: { b2b: { dailyMax: form.elements.dailyMax.value, perUur: form.elements.perUur.value, sendHours: [form.elements.van.value, form.elements.tot.value] } } }); dlg.close(); toast("Opgeslagen"); herlaad(); }
        catch (err) { SM.toonFouten(form, err); }
      });
    });
  }

  async function b2bLeads(main) {
    const d = await api("hq/leads?status=" + (leadFilter === "alle" ? "" : leadFilter));
    const c = d.counts;
    const n = (k) => c[k] || 0;
    const filters = [["bekeken", "Concept bekeken"], ["nieuw", "Klaar om te mailen"], ["goedgekeurd", "Wachtrij"], ["verstuurd", "Verstuurd"], ["opgevolgd", "Opgevolgd"], ["reactie", "Reacties"], ["afspraak", "Afspraak"], ["kandidaat", "Te onderzoeken"], ["overgeslagen", "Overgeslagen"], ["afgemeld", "Afgemeld"], ["fout", "Fout"], ["alle", "Alle"]];
    const opvolgKlaar = d.followupDue.length;
    render(main, html`
      <div class="hq-kop"><div><h1>B2B</h1><p>Bedrijven benaderen per mail. Niets gaat de deur uit zonder jouw goedkeuring; afmelden kan altijd met één klik. Vandaag verstuurd: ${d.sentToday} van max. ${d.dailyMax}.</p></div>
        <div class="knoppen"><button class="knop knop-gevaar" id="offline" title="Iemand wil het niet: concept direct offline en nooit meer mailen">Direct offline</button><button class="knop knop-actie" id="lead-nieuw">Lead toevoegen</button><button class="knop knop-licht" id="lead-import">CSV importeren</button>${d.ready.scout ? html`<button class="knop knop-licht" id="scout">Scout nu zoeken</button>` : ""}</div></div>
      ${b2bTabs("leads", n("nieuw"))}
      ${!d.ready.mail ? html`<div class="melding melding-let">${raw(icon.let)}<p>Mail is nog niet ingesteld (MAIL_USER/MAIL_PASSWORD). Goedgekeurde mails blijven in de wachtrij tot dat geregeld is.</p></div>` : ""}
      ${!d.ready.company ? html`<div class="melding melding-let">${raw(icon.let)}<p>Vul bij <a href="#instellingen">Instellingen</a> je bedrijfsnaam en KvK-nummer in; die staan verplicht onder elke zakelijke mail.</p></div>` : ""}
      ${opvolgKlaar ? html`<div class="melding melding-info">${raw(icon.let)}<div><p><b>${opvolgKlaar} leads</b> zijn langer dan je opvolgtermijn geleden gemaild zonder reactie.</p><button class="knop knop-klein" id="opvolgen">Opvolging goedkeuren</button></div></div>` : ""}
      <div class="filters" role="group" aria-label="Filter">${filters.map(([k, t]) => html`<button aria-pressed="${k === leadFilter}" data-f="${k}">${t}${k !== "alle" ? html`<span class="n">${k === "opgevolgd" ? n("opgevolgd") + n("opvolging_goedgekeurd") : n(k)}</span>` : ""}</button>`)}</div>
      <section class="paneel">${d.leads.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th><input type="checkbox" class="selecteer" id="alles" aria-label="Alles selecteren"></th><th>Bedrijf</th><th>E-mail</th><th>Plaats / branche</th><th>Concept</th><th>Status</th><th>Laatst</th></tr></thead><tbody>
        ${d.leads.map((l) => html`<tr class="klikbaar" data-lead="${l.id}"><td><input type="checkbox" class="selecteer" value="${l.id}" aria-label="Selecteer ${l.company}"></td>
          <td><b>${l.company}</b>${l.intro ? html`<br><span class="klein dempen">Met openingszin</span>` : ""}${l.rejectReason && l.status === "overgeslagen" ? html`<br><span class="klein dempen">${l.rejectReason}</span>` : ""}</td>
          <td class="klein">${l.email || html`<span class="dempen">–</span>`}</td><td class="klein">${[l.city, l.category].filter(Boolean).join(" · ")}</td>
          <td>${conceptCel(l)}</td>
          <td>${chip(L.lead, l.status)}${l.error ? html`<br><span class="klein dempen">${l.error}</span>` : ""}</td><td class="klein nowrap">${geleden(l.updatedAt)}</td></tr>`)}</tbody></table></div>
        <div class="balk-acties" id="balk" hidden><span id="aantal"></span>
          <button class="knop knop-actie knop-klein" data-actie="goedkeuren">Goedkeuren voor verzending</button>
          <button class="knop knop-licht knop-klein" data-actie="concept">Concept maken</button>
          <button class="knop knop-licht knop-klein" data-actie="opvolgen">Opvolging goedkeuren</button>
          <button class="knop knop-licht knop-klein" data-actie="terug">Uit wachtrij</button>
          <button class="knop knop-licht knop-klein" data-actie="overslaan">Overslaan</button>
          <button class="knop knop-licht knop-klein" data-actie="verwijderen">Verwijderen</button></div>`
        : html`<div class="leeg"><h3>Geen leads in deze lijst</h3><p>Voeg leads toe, importeer een CSV${d.ready.scout ? " of laat de scout zoeken" : ""}.</p></div>`}</section>
      <p class="klein dempen">Mailteksten, verzendtijden en de scout stel je in bij <a href="#instellingen">Instellingen</a>. ${d.ready.ai ? "Openingszinnen worden met AI geschreven op basis van de eigen website van het bedrijf." : ""}</p>`);

    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", async () => { leadFilter = b.dataset.f; await b2bLeads(main); zetBalk(main, "b2b"); }));
    main.querySelector("#lead-nieuw").onclick = () => leadToevoegen();
    main.querySelector("#offline").onclick = () => offlineDialoog();
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
      try { const r = await api("hq/leads/action", { method: "POST", body: { action: b.dataset.actie, ids } }); toast(b.dataset.actie === "concept" ? `${r.changed} concepten in de wachtrij${r.skipped ? ` (${r.skipped} zonder website overgeslagen)` : ""}` : b.dataset.actie === "goedkeuren" ? `${r.changed} goedgekeurd; ze gaan uit zodra hun voorbeeldwebsite klaar is${r.skipped ? ` (${r.skipped} overgeslagen: geen website of al gemaild)` : ""}` : `${r.changed} leads bijgewerkt`); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelectorAll("tr[data-lead]").forEach((tr) => tr.addEventListener("click", (e) => { if (e.target.closest("a")) return; leadDetail(d.leads.find((l) => String(l.id) === tr.dataset.lead)); }));
  }
  function conceptCel(l) {
    const c = l.concept;
    if (!c) return l.website ? html`<span class="klein dempen">Nog niet</span>` : html`<span class="klein dempen">Geen website</span>`;
    if (c.status !== "klaar") return html`${chip(L.concept, c.status)}${c.reden ? html`<br><span class="klein dempen">${c.reden}</span>` : ""}`;
    return html`<a class="klein" href="${c.url}?hq=1" target="_blank" rel="noopener">Bekijken</a>${c.views ? html`<br><span class="status s-fout">${c.views}× bekeken</span>` : html`<br><span class="klein dempen">Nog niet geopend</span>`}`;
  }

  // Iemand reageert boos of wil het niet: zoek de lead en haal het voorbeeld direct offline (en nooit meer mailen).
  function offlineDialoog() {
    const dlg = SM.dialoog("Direct offline halen", html`<form novalidate>
      <div class="veld"><label for="off-q">Domein, e-mailadres of bedrijfsnaam</label><input id="off-q" name="q" autocomplete="off" placeholder="bijv. fysiokilic.nl"></div>
      <div id="off-lijst" class="klein dempen">Typ minstens 3 tekens.</div></form>`);
    const inp = dlg.querySelector("#off-q"), lijst = dlg.querySelector("#off-lijst");
    let timer;
    const zoek = async () => {
      const v = inp.value.trim();
      if (v.length < 3) { lijst.textContent = "Typ minstens 3 tekens."; return; }
      try {
        const r = await api("hq/leads/zoek?q=" + encodeURIComponent(v));
        if (!r.leads.length) { lijst.textContent = "Niets gevonden."; return; }
        render(lijst, html`<ul class="offline-lijst">${r.leads.map((l) => html`<li><div><b>${l.company}</b><br><span class="klein dempen">${l.website || ""}${l.email ? ` · ${l.email}` : ""}${l.status === "afgemeld" ? " · al afgemeld" : ""}</span></div>
          <button class="knop knop-gevaar knop-klein" type="button" data-id="${l.id}" data-naam="${l.company}">${l.status === "afgemeld" ? "Nogmaals offline" : "Offline halen"}</button></li>`)}</ul>`);
      } catch (e) { lijst.textContent = e.message; }
    };
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(zoek, 250); });
    dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); zoek(); });
    lijst.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-id]"); if (!b) return;
      if (!(await SM.bevestig("Direct offline halen?", `Het voorbeeld van ${b.dataset.naam} gaat meteen offline en ze krijgen nooit meer een mail van ons.`, "Offline halen"))) return;
      try { await api("hq/leads/action", { method: "POST", body: { action: "afmelden", ids: [Number(b.dataset.id)] } }); toast("Offline gehaald en afgemeld"); dlg.close(); herlaad(); } catch (err) { toast(err.message, "fout"); }
    });
    inp.focus();
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
      ${l.website ? conceptBlok(l) : ""}
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2"><div class="veld"><label for="d-bedrijf">Bedrijfsnaam</label><input id="d-bedrijf" name="company" value="${l.company}"></div><div class="veld"><label for="d-email">E-mailadres</label><input id="d-email" name="email" type="email" value="${l.email || ""}"></div></div>
        <div class="rij3"><div class="veld"><label for="d-plaats">Plaats</label><input id="d-plaats" name="city" value="${l.city}"></div><div class="veld"><label for="d-cat">Branche</label><input id="d-cat" name="category" value="${l.category}"></div><div class="veld"><label for="d-tel">Telefoon</label><input id="d-tel" name="phone" value="${l.phone}"></div></div>
        <div class="veld"><label for="d-intro">Openingszin <span class="opt">(komt bovenaan de eerste mail)</span></label><textarea id="d-intro" name="intro" rows="2">${l.intro}</textarea></div>
        <div class="veld"><label for="d-notes">Notities</label><input id="d-notes" name="notes" value="${l.notes}"></div>
        <div class="knoppen"><button class="knop" type="submit">Opslaan</button>${l.website ? html`<button class="knop knop-licht" type="button" data-onderzoek>Website opnieuw onderzoeken</button>` : ""}
          ${["reactie", "afspraak", "verstuurd", "opgevolgd"].includes(l.status) ? html`<button class="knop knop-actie" type="button" data-klant>Maak klant aan</button><button class="knop knop-licht" type="button" data-afspraak>Afspraak gepland</button>` : ""}
          <button class="knop knop-gevaar" type="button" data-afmelden>Direct offline en nooit meer mailen</button></div></form>
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
    form.querySelector("[data-afmelden]").addEventListener("click", async () => { if (await SM.bevestig("Direct offline halen?", `Het voorbeeld van ${l.company} gaat meteen offline en ${l.email || "dit bedrijf"} krijgt nooit meer een mail van ons.`, "Offline halen")) act("afmelden", "Offline gehaald en afgemeld"); });
    form.querySelector("[data-klant]")?.addEventListener("click", () => { dlg.close(); klantDialoog({ company: l.company, email: l.email, phone: l.phone, siteUrl: l.website, notes: l.notes, leadId: l.id }); });
    koppelConcept(dlg, l, () => { dlg.close(); herlaad(); });
  }
  function conceptBlok(l) {
    const c = l.concept;
    return html`<section class="concept-blok"><div class="paneel-kop"><h3>Concept-website</h3>${c ? chip(L.concept, c.status) : ""}</div>
      ${!c ? html`<p class="klein dempen">Nog geen concept. De agent bekijkt hun site en Claude maakt een opzet in de Sitemaker-opmaak.</p>` : ""}
      ${c?.status === "klaar" ? html`<p><a class="knop knop-licht knop-klein" href="${c.url}?hq=1" target="_blank" rel="noopener">${raw(icon.open)}Concept bekijken</a> <button class="knop knop-tekst knop-klein" type="button" data-kopieer="${c.url}">Link kopiëren</button></p>
        <p class="klein dempen">${c.views ? `${c.views}× bekeken, eerst ${tijd(c.firstViewAt)}, laatst ${geleden(c.lastViewAt)}` : "Nog niet geopend door de lead"}${c.expiresAt ? ` · geldig tot ${datum(c.expiresAt)}` : ""} · ${c.fotos} foto's · ${c.uniek ? "uniek ontwerp" : "vaste opmaak"}</p>
        ${l.status === "nieuw" ? (l.email ? html`<div class="knoppen"><button class="knop knop-actie knop-klein" type="button" data-akkoord>Akkoord, verstuur mail</button><button class="knop knop-tekst knop-klein" type="button" data-afwijzen>Niet mailen</button></div>` : html`<p class="klein dempen">Geen e-mailadres gevonden; bel ze of vul een adres in.</p>`) : ""}` : ""}
      ${c?.reden && c.status !== "klaar" ? html`<p class="klein">${c.reden}</p>` : ""}
      ${c?.punten?.length ? html`<p class="klein"><b>Hun huidige site:</b> ${c.punten.join(" · ")}</p>` : ""}
      ${!c || c.status !== "bezig" ? html`<div class="veld"><label for="c-instr">Wens voor ${c ? "een nieuw" : "het"} concept <span class="opt">(optioneel)</span></label><input id="c-instr" data-instructie placeholder="Bijv. stoerder, meer nadruk op spoedservice" value="${c?.instructie || ""}"></div>
        <div class="knoppen"><button class="knop knop-klein ${c ? "knop-licht" : "knop-actie"}" type="button" data-concept>${c ? "Opnieuw maken" : "Concept maken"}</button>${c ? html`<button class="knop knop-tekst knop-klein" type="button" data-concept-weg>Verwijderen</button>` : ""}</div>` : html`<p class="klein dempen">Wordt nu gemaakt; dat duurt meestal 1 à 2 minuten.</p>`}
    </section>`;
  }
  function koppelConcept(el, l, klaar) {
    koppelKopieer(el);
    el.querySelector("[data-concept]")?.addEventListener("click", async (e) => {
      SM.bezig(e.target, true, "Starten…");
      try { await api(`hq/leads/${l.id}/concept`, { method: "POST", body: { instructie: el.querySelector("[data-instructie]")?.value || "" } }); toast("De agent gaat aan de slag. Over 1 à 2 minuten staat het concept klaar."); klaar(); } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    });
    el.querySelector("[data-concept-weg]")?.addEventListener("click", async () => {
      if (!(await SM.bevestig("Concept verwijderen?", "De link werkt daarna niet meer.", "Verwijderen"))) return;
      try { await api(`hq/leads/${l.id}/concept`, { method: "DELETE" }); toast("Concept verwijderd"); klaar(); } catch (err) { toast(err.message, "fout"); }
    });
    el.querySelector("[data-akkoord]")?.addEventListener("click", () => akkoordMail(l.id, l.company, klaar));
    el.querySelector("[data-afwijzen]")?.addEventListener("click", async () => {
      if (!(await SM.bevestig("Niet mailen?", `${l.company} krijgt geen mail en verdwijnt uit de lijst om te beoordelen.`, "Niet mailen"))) return;
      try { await api("hq/leads/action", { method: "POST", body: { action: "overslaan", ids: [l.id] } }); toast("Overgeslagen"); klaar(); } catch (err) { toast(err.message, "fout"); }
    });
  }

  // Concept bekeken en goed? Dan toont HQ de mail die verstuurd wordt; pas na "Versturen" gaat hij in de wachtrij.
  async function akkoordMail(leadId, company, klaar) {
    let p;
    try { p = await api(`hq/leads/${leadId}/preview?kind=eerste`); } catch (err) { return toast(err.message, "fout"); }
    const dlg = SM.dialoog(`Mail aan ${company}`, html`<p class="dempen">Dit is de mail die verstuurd wordt, met de link naar het concept. Hij gaat binnen je verzendtijden de deur uit.</p>
      <div class="preview">Onderwerp: ${p.subject}

${p.body}</div>
      <div class="knoppen"><button class="knop knop-actie" data-ok>Versturen</button><button class="knop knop-licht" data-nee>Annuleren</button></div>`, { breed: true });
    dlg.querySelector("[data-nee]").onclick = () => dlg.close();
    dlg.querySelector("[data-ok]").onclick = async (e) => {
      SM.bezig(e.target, true, "Bezig…");
      try { const r = await api("hq/leads/action", { method: "POST", body: { action: "goedkeuren", ids: [leadId] } }); dlg.close(); toast(r.changed ? "In de wachtrij: de mail gaat binnen je verzendtijden de deur uit." : "Deze lead stond niet meer klaar om te mailen.", r.changed ? "ok" : "fout"); klaar(); }
      catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    };
  }

  // ================================================ CONCEPTEN (galerij)
  let conceptFilter = "beoordelen";
  async function concepten(main) {
    const d = await api("hq/concepten?filter=" + conceptFilter);
    const f = [["beoordelen", "Te beoordelen", d.counts.beoordelen], ["bekeken", "Bekeken", d.counts.bekeken], ["", "Alle", d.counts.alle], ["klaar", "Klaar", d.counts.klaar], ["bezig", "Wordt gemaakt", d.counts.bezig], ["overgeslagen", "Overgeslagen", d.counts.overgeslagen]];
    render(main, html`
      <div class="hq-kop"><div><h1>Concepten</h1><p>Voorbeeldsites voor leads. De ontwerper (geplande Claude-taak) maakt ze in rondes, drie keer per dag. Bekijk ze en klik op "Akkoord, verstuur mail". Bekeken = de lead heeft de link geopend: bel ze!</p></div><a class="knop knop-licht" href="#b2b">Naar B2B-mail</a></div>
      <div class="filters" role="group" aria-label="Filter">${f.map(([k, t, n]) => html`<button aria-pressed="${k === conceptFilter}" data-f="${k}">${t}<span class="n">${n}</span></button>`)}</div>
      ${d.concepts.length ? html`<div class="concept-raster">${d.concepts.map((c) => html`<article class="concept-kaart thema-${c.thema || "natuur"}">
          <a class="concept-beeld" ${c.status === "klaar" ? raw(`href="${SM.esc(c.hqUrl)}" target="_blank" rel="noopener"`) : ""} aria-label="${c.company} openen">
            ${c.heroImg ? html`<img src="${c.heroImg}" alt="" loading="lazy">` : ""}
            <div class="concept-mini"><span class="concept-naam">${c.company}</span>${c.titel ? html`<b>${c.titel}</b>` : html`<b>${L.concept[c.status]?.[0] || c.status}</b>`}</div>
            ${c.views ? html`<span class="concept-gezien">${c.views}× bekeken</span>` : ""}</a>
          <div class="concept-info"><div class="wijziging-kop"><b>${c.company}</b>${chip(L.concept, c.status)}</div>
            <p class="klein dempen">${[c.category, c.city].filter(Boolean).join(" · ")}${c.status === "klaar" ? ` · ${c.fotos} foto's · ${c.uniek ? "uniek ontwerp" : "vaste opmaak"}` : ""}${c.reden && c.status !== "klaar" ? ` · ${c.reden}` : ""}</p>${c.status === "klaar" && !c.uniek && c.ontwerpFout ? html`<p class="klein dempen">Ontwerp-agent: ${c.ontwerpFout}</p>` : ""}
            ${c.views ? html`<p class="klein"><b>Laatst bekeken ${geleden(c.lastViewAt)}</b>${c.phone ? html` · <a href="tel:${c.phone}">${c.phone}</a>` : ""}</p>` : ""}
            ${c.status === "klaar" && c.leadStatus === "nieuw" ? html`<div class="knoppen">${c.email ? html`<button class="knop knop-actie knop-klein" data-akkoord="${c.leadId}" data-naam="${c.company}">Akkoord, verstuur mail</button>` : html`<span class="klein dempen">Geen e-mailadres</span>`}<button class="knop knop-tekst knop-klein" data-opnieuw="${c.leadId}">Opnieuw maken</button></div>` : c.status === "klaar" ? html`<p class="klein">${chip(L.lead, c.leadStatus)}</p>` : ""}
            <div class="knoppen">${c.status === "klaar" ? html`<a class="knop knop-licht knop-klein" href="${c.hqUrl}" target="_blank" rel="noopener">Bekijken</a><button class="knop knop-tekst knop-klein" data-kopieer="${c.url}">Link kopiëren</button><button class="knop knop-tekst knop-klein" data-testmail="${c.leadId}">Testmail naar mij</button>` : ""}${/^https?:\/\//i.test(c.website || "") ? html`<a class="knop knop-licht knop-klein" href="${c.website}" target="_blank" rel="noopener noreferrer" title="${c.website}">Huidige website</a>` : ""}${c.status !== "overgeslagen" && ["kandidaat", "nieuw", "goedgekeurd", "fout"].includes(c.leadStatus) ? html`<button class="knop knop-tekst knop-klein" data-afwijzen="${c.leadId}" data-naam="${c.company}">Afwijzen</button>` : ""}<button class="knop knop-tekst knop-klein" data-lead="${c.leadId}">Lead</button></div></div>
        </article>`)}</div>`
        : html`<section class="paneel"><div class="leeg"><h3>Nog geen concepten${conceptFilter ? " in deze lijst" : ""}</h3><p>Voor nieuwe leads met een website maakt de agent automatisch een concept (instelbaar bij Instellingen). Je kunt het ook per lead starten bij B2B-mail.</p></div></section>`}`);
    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { conceptFilter = b.dataset.f; concepten(main); }));
    koppelKopieer(main);
    main.querySelectorAll("[data-akkoord]").forEach((b) => b.addEventListener("click", () => akkoordMail(Number(b.dataset.akkoord), b.dataset.naam, () => concepten(main))));
    main.querySelectorAll("[data-opnieuw]").forEach((b) => b.addEventListener("click", async () => {
      const dlg = SM.dialoog("Opnieuw maken", html`<form novalidate><div class="veld"><label for="o-w">Wat moet anders? <span class="opt">(optioneel)</span></label><input id="o-w" name="instructie" placeholder="Bijv. meer nadruk op spoedservice"></div><button class="knop knop-actie" type="submit">Opnieuw maken</button></form>`);
      dlg.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api(`hq/leads/${b.dataset.opnieuw}/concept`, { method: "POST", body: { instructie: e.target.elements.instructie.value } }); dlg.close(); toast("Staat klaar voor de ontwerper: in de volgende ronde wordt hij opnieuw gemaakt."); concepten(main); } catch (err) { toast(err.message, "fout"); }
      });
    }));
    main.querySelectorAll("[data-testmail]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { const r = await api(`hq/leads/${b.dataset.testmail}/testmail`, { method: "POST", body: { kind: "eerste" } }); toast(`Testmail verstuurd naar ${r.aan}.`); } catch (err) { toast(err.message, "fout"); } finally { b.disabled = false; }
    }));
    main.querySelectorAll("[data-afwijzen]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig(`${b.dataset.naam} afwijzen?`, "Er gaat geen mail naar dit bedrijf, de voorbeeldwebsite gaat offline en het concept verdwijnt uit je lijst. De lead komt niet terug.", "Ja, afwijzen"))) return;
      try { await api(`hq/leads/${b.dataset.afwijzen}/afwijzen`, { method: "POST", body: {} }); toast(`${b.dataset.naam} is afgewezen.`); concepten(main); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelectorAll("[data-lead]").forEach((b) => b.addEventListener("click", async () => {
      const { leads } = await api("hq/leads?status=");
      const l = leads.find((x) => String(x.id) === b.dataset.lead);
      if (l) leadDetail(l);
    }));
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
          <td>${r.published ? html`<span class="status s-ok">Op de website</span>` : html`<span class="status ${r.uitPortaal ? "s-let" : "s-grijs"}">${r.uitPortaal ? "Nieuw, uit het portaal" : "Verborgen"}</span>`}</td>
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

  // ================================================ KLANTVRAGEN (Emma)
  let serviceFilter = "";
  async function service(main) {
    const { tickets } = await api("hq/service?status=" + serviceFilter);
    render(main, html`
      <div class="hq-kop"><div><h1>Klantvragen</h1><p>Vragen uit het portaal en mails van klanten in de inbox. Emma zet een antwoord klaar; jij past het aan en verstuurt.</p></div>
        <div class="segment" role="group" aria-label="Filter">${[["", "Open"], ["gesloten", "Gesloten"], ["alle", "Alles"]].map(([k, t]) => html`<button class="knop knop-klein ${serviceFilter === k ? "" : "knop-licht"}" data-filter="${k}" aria-pressed="${serviceFilter === k}">${t}</button>`)}</div></div>
      ${tickets.length ? html`<ul class="tickets">${tickets.map((t) => html`<li class="paneel ticket" data-id="${t.id}">
        <div class="paneel-kop"><div><h2>${t.onderwerp}</h2><p class="klein dempen">${t.customerId ? html`<a href="#klant/${t.customerId}">${t.company}</a>` : t.naam || t.email} · ${t.bron === "mail" ? "per mail" : t.bron === "opzeggen" ? "tijdens opzeggen" : t.bron === "website" ? "via het contactformulier" : "via het portaal"} · ${geleden(t.updatedAt)}</p></div>${chip(L.ticket, t.status)}</div>
        <ol class="gesprek">${t.berichten.map((m) => html`<li class="${m.van === "klant" ? "van-klant" : "van-ons"}"><span class="klein dempen">${m.van === "klant" ? t.naam || "Klant" : "Sitemaker"} · ${tijd(m.at)}</span><p>${m.tekst}</p></li>`)}</ol>
        ${t.status !== "gesloten" ? html`<form novalidate class="antwoord"><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <div class="veld"><label for="a-${t.id}">Antwoord${t.conceptStatus === "klaar" ? html` <span class="status s-info">Klaargezet door Emma</span>` : t.conceptStatus === "wacht" || t.conceptStatus === "bezig" ? html` <span class="status s-grijs">Emma schrijft een antwoord…</span>` : ""}</label>
            <textarea id="a-${t.id}" name="tekst" rows="6">${t.concept || ""}</textarea><div class="fout" data-fout-voor="tekst"></div></div>
          <div class="knoppen"><button class="knop knop-actie knop-klein" type="submit">Versturen</button><button class="knop knop-licht knop-klein" type="button" data-sluit-na>Versturen en sluiten</button>
            <button class="knop knop-tekst knop-klein" type="button" data-concept>Nieuw antwoord laten schrijven</button><button class="knop knop-tekst knop-klein" type="button" data-sluit>Sluiten zonder antwoord</button></div>
          <p class="klein dempen">Het antwoord gaat per mail naar ${t.email || "de klant"} en staat ook in het portaal.</p></form>` : ""}
      </li>`)}</ul>`
        : html`<section class="paneel"><div class="leeg"><h3>${serviceFilter ? "Niets gevonden" : "Geen open vragen"}</h3><p>Stelt een klant een vraag in het portaal of mailt hij naar het Sitemaker-adres, dan staat hij hier.</p></div></section>`}`);
    main.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { serviceFilter = b.dataset.filter; herlaad(); }));
    main.querySelectorAll("li.ticket").forEach((li) => {
      const id = li.dataset.id, form = li.querySelector("form");
      if (!form) return;
      const stuur = async (sluiten, knop) => {
        SM.wisFouten(form); SM.bezig(knop, true, "Versturen…");
        try { const r = await api(`hq/service/${id}/antwoord`, { method: "POST", body: { tekst: form.elements.tekst.value, sluiten } }); toast(r.mailed && r.mailed.ok === false ? "Opgeslagen; de mail kon niet worden verstuurd" : "Verstuurd", r.mailed && r.mailed.ok === false ? "fout" : "ok"); herlaad(); }
        catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
      };
      form.addEventListener("submit", (e) => { e.preventDefault(); stuur(false, form.querySelector("[type=submit]")); });
      form.querySelector("[data-sluit-na]").onclick = (e) => stuur(true, e.target);
      form.querySelector("[data-concept]").onclick = async (e) => { SM.bezig(e.target, true, "Bezig…"); try { await api(`hq/service/${id}/concept`, { method: "POST" }); toast("Emma schrijft een nieuw antwoord; ververs over een minuut"); } catch (err) { toast(err.message, "fout"); } SM.bezig(e.target, false); };
      form.querySelector("[data-sluit]").onclick = async () => { if (!(await SM.bevestig("Sluiten zonder antwoord?", "De klant krijgt geen bericht.", "Sluiten"))) return; try { await api(`hq/service/${id}/sluiten`, { method: "POST" }); herlaad(); } catch (err) { toast(err.message, "fout"); } };
    });
  }

  // ================================================ DOMEINEN (Dirk)
  async function domeinen(main) {
    const { domeinen: lijst } = await api("hq/domeinen");
    const werk = lijst.filter((d) => ["verhuizen", "registreren", "probleem"].includes(d.status));
    render(main, html`
      <div class="hq-kop"><div><h1>Domeinen</h1><p>Klanten kopen en beheren hun domein zelf; wij verbinden het met hun site. De DNS wordt elk halfuur gecontroleerd tot hij klopt, daarna dagelijks.</p></div></div>
      ${werk.length ? html`<div class="melding melding-let">${raw(icon.let)}<p><b>${werk.length === 1 ? "1 domein wijst" : `${werk.length} domeinen wijzen`} niet (meer) naar de site.</b> Vraag de klant de instellingen bij zijn provider na te lopen.</p></div>` : ""}
      <section class="paneel">${lijst.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Domein</th><th>Klant</th><th>Keuze</th><th>Status</th><th>DNS</th><th>Verloopt</th><th class="acties"></th></tr></thead><tbody>
        ${lijst.map((d) => html`<tr><td><b>${d.naam}</b>${d.notitie ? html`<br><span class="klein dempen">${d.notitie}</span>` : ""}</td><td><a href="#klant/${d.customerId}">${d.company}</a></td>
          <td>${L.domeinKeuze[d.keuze]}${d.provider ? html`<br><span class="klein dempen">${d.provider}</span>` : ""}${d.verhuiscode ? html`<br><span class="klein">Verhuiscode: <code>${d.verhuiscode}</code></span>` : ""}</td>
          <td>${chip(L.domein, d.status)}${d.netlify ? html`<br><span class="klein dempen">Gekoppeld aan ${d.siteNaam || "de site"}</span>` : ""}</td>
          <td>${d.dnsAt ? html`<span class="mini-site"><span class="punt ${d.dnsOk ? "ok" : "fout"}"></span>${d.dnsOk ? "Klopt" : "Klopt nog niet"}</span>${d.dnsOk ? html`<span class="mini-site"><span class="punt ${d.https ? "ok" : "fout"}"></span>${d.https ? "https werkt" : "https nog niet"}</span>` : ""}<span class="klein dempen">${geleden(d.dnsAt)}</span>` : html`<span class="dempen">–</span>`}</td>
          <td>${d.verlooptOp ? datum(d.verlooptOp) : html`<span class="dempen">–</span>`}</td>
          <td class="acties"><button class="knop knop-licht knop-klein" data-check="${d.id}">Nu controleren</button><button class="knop knop-tekst knop-klein" data-bewerk="${d.id}">Bewerken</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="leeg"><h3>Nog geen domeinen</h3><p>Klanten kiezen hun domein in het portaal bij Account. Dan verschijnt het hier.</p></div>`}</section>`);
    main.querySelectorAll("[data-check]").forEach((b) => b.addEventListener("click", async () => {
      SM.bezig(b, true, "Controleren…");
      try { const r = await api(`hq/domeinen/${b.dataset.check}/check`, { method: "POST" }); toast(r.dns?.ok ? "DNS klopt" : (r.dns?.uitleg || "Klopt nog niet"), r.dns?.ok ? "ok" : "fout"); herlaad(); } catch (e) { toast(e.message, "fout"); SM.bezig(b, false); }
    }));
    main.querySelectorAll("[data-bewerk]").forEach((b) => b.addEventListener("click", () => {
      const d = lijst.find((x) => String(x.id) === b.dataset.bewerk);
      const dlg = SM.dialoog(d.naam, html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2"><div class="veld"><label for="dm-st">Status</label><select id="dm-st" name="status">${opties(L.domein, d.status)}</select></div>
          <div class="veld"><label for="dm-prov">Provider / registrar</label><input id="dm-prov" name="provider" value="${d.provider || ""}"></div></div>
        <div class="rij2"><div class="veld"><label for="dm-ver">Verloopt op <span class="opt">(optioneel)</span></label><input id="dm-ver" name="verlooptOp" type="date" value="${d.verlooptOp || ""}"><div class="hulp">Als je hem weet: 30 dagen vooraf krijg je een seintje om de klant te herinneren.</div></div>
          <div class="veld"><label for="dm-code">Verhuiscode</label><input id="dm-code" name="verhuiscode" value="${d.verhuiscode || ""}" autocomplete="off"><div class="hulp">Wordt gewist zodra het domein klopt.</div></div></div>
        <div class="veld"><label for="dm-not">Notitie</label><textarea id="dm-not" name="notitie" rows="2">${d.notitie || ""}</textarea></div>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        try { await api("hq/domeinen/" + d.id, { method: "PUT", body: Object.fromEntries(new FormData(form)) }); dlg.close(); toast("Opgeslagen"); herlaad(); } catch (err) { SM.toonFouten(form, err); }
      });
    }));
  }

  // ================================================ KOSTEN EN WINST (Bram)
  // ================================================ OPDRACHTEN (echte websites van betalende klanten)
  function aftellen(due) {
    if (!due) return "";
    const s = (new Date(due).getTime() - Date.now()) / 1000;
    if (s <= 0) return "te laat";
    const u = Math.floor(s / 3600), d = Math.floor(u / 24);
    return d ? `nog ${d} ${d === 1 ? "dag" : "dagen"} ${u % 24} uur` : u ? `nog ${u} uur` : `nog ${Math.max(1, Math.round(s / 60))} min`;
  }
  async function opdrachten(main) {
    const d = await api("hq/opdrachten");
    const open = d.opdrachten.filter((o) => o.status !== "live"), live = d.opdrachten.filter((o) => o.status === "live");
    const kaart = (o) => {
      const krap = o.dueAt && o.status !== "live" && new Date(o.dueAt).getTime() - Date.now() < 12 * 3600 * 1000;
      const pad = (() => { try { return new URL(o.voorbeeldUrl).pathname; } catch { return o.voorbeeldUrl; } })();
      const stap = (n, titel, uitleg, klaar, nu) => html`<li class="${klaar ? "klaar" : nu ? "nu" : ""}"><b>${klaar ? raw(icon.ok) : n}</b><div><strong>${titel}</strong><span>${uitleg}</span></div></li>`;
      const ontwerpKlaar = ["controle", "live"].includes(o.status), isLive = o.status === "live", domActief = o.domein?.status === "actief";
      return html`<article class="opdracht-groot ${krap ? "krap" : ""}">
        <div class="og-voorbeeld">${ontwerpKlaar ? html`<div class="og-schaal"><iframe src="${pad}" title="Voorbeeld van ${o.company}" loading="lazy" tabindex="-1"></iframe></div><a class="og-open" href="${o.voorbeeldUrl}" target="_blank" rel="noopener">Open op volle grootte</a>` : html`<div class="og-leeg">${o.status === "fout" ? "Ontwerp mislukt" : "De ontwerper is bezig…"}</div>`}</div>
        <div class="og-info">
          <div class="og-kop"><h2><a href="#klant/${o.customerId}">${o.company}</a></h2>${chip(L.opdracht, o.status)}</div>
          <p class="klein dempen">${o.opBasisVanConcept ? "Op basis van het concept dat de klant zag" : "Nieuw ontwerp"} · ${o.fotos} foto's${o.intakeAt ? ` · informatie binnen ${geleden(o.intakeAt)}` : ""}</p>
          ${!isLive && o.dueAt ? html`<p class="og-aftel ${krap ? "rood" : ""}"><b>${aftellen(o.dueAt)}</b> <span>online uiterlijk ${tijd(o.dueAt)}</span></p>` : ""}
          ${o.feedback && !isLive ? html`<div class="notitie"><b>Jouw feedback:</b> ${o.feedback}</div>` : ""}
          ${o.status === "fout" && o.reden ? html`<div class="melding melding-fout"><p>${o.reden}</p></div>` : ""}
          <ol class="og-stappen">
            ${stap(1, "Ontwerp", ontwerpKlaar ? "Klaar" : "De ontwerper maakt de site", ontwerpKlaar, !ontwerpKlaar)}
            ${stap(2, "Jij controleert", "Bekijk het voorbeeld; feedback kan", isLive, o.status === "controle")}
            ${stap(3, "Live zetten", isLive ? html`Online${o.siteUrl ? html`: <a href="${o.siteUrl}" target="_blank" rel="noopener">${o.siteUrl.replace(/^https?:\/\//, "")}</a>` : ""}${o.repo ? html` · GitHub ${o.repo}` : ""}` : "Maakt de GitHub-repo en het Netlify-project, de klant krijgt een mail", isLive, false)}
            ${stap(4, "Domein", o.domein ? (domActief ? html`${o.domein.naam} werkt` : html`${o.domein.naam}: klant zet de DNS bij zijn provider; HQ controleert en regelt https`) : "Klant heeft nog geen domein opgegeven (portaal › Account)", domActief, isLive && !domActief)}
          </ol>
          <div class="knoppen">
            ${ontwerpKlaar ? html`<a class="knop knop-licht" href="${o.voorbeeldUrl}" target="_blank" rel="noopener">Bekijken</a>` : ""}
            ${o.status === "controle" ? html`<button class="knop knop-actie" data-live="${o.id}" data-naam="${o.company}">Live zetten</button>` : ""}
            ${["controle", "fout"].includes(o.status) ? html`<button class="knop knop-tekst" data-opnieuw="${o.id}">${o.status === "controle" ? "Aanpassen (feedback)" : "Opnieuw laten maken"}</button>` : ""}
            ${isLive && o.domein && !domActief ? html`<a class="knop knop-licht" href="#domeinen">Naar Domeinen</a>` : ""}
          </div>
        </div></article>`;
    };
    render(main, html`
      <div class="hq-kop"><div><h1>Opdrachten</h1><p>Betaalde klanten die op hun website wachten. De ontwerper maakt hun site (op basis van het concept dat ze zagen, of nieuw). Jij bekijkt hem, geeft eventueel feedback en zet hem live.</p></div></div>
      ${d.zonderOpdracht.length ? html`<section class="paneel"><h2>Informatie binnen, nog geen opdracht</h2><ul class="lijst">${d.zonderOpdracht.map((k) => html`<li class="factuur-rij"><div><a href="#klant/${k.customerId}"><b>${k.company}</b></a><br><span class="klein dempen">${aftellen(k.dueAt)}</span></div><button class="knop knop-actie knop-klein" data-start="${k.customerId}">Opdracht starten</button></li>`)}</ul></section>` : ""}
      ${open.length ? html`<div class="opdracht-lijst">${open.map(kaart)}</div>` : html`<section class="paneel"><div class="leeg"><h3>Geen openstaande opdrachten</h3><p>Zodra een klant na betalen zijn informatie aanlevert, verschijnt hij hier en gaat de ontwerper aan de slag.</p></div></section>`}
      ${live.length ? html`<details class="paneel"><summary><b>Live gezet (${live.length})</b></summary><div class="opdracht-lijst">${live.map(kaart)}</div></details>` : ""}`);
    main.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", async () => {
      SM.bezig(b, true, "Starten…");
      try { await api(`hq/customers/${b.dataset.start}/opdracht`, { method: "POST" }); toast("De ontwerper pakt hem op in de volgende ronde."); opdrachten(main); } catch (e) { toast(e.message, "fout"); SM.bezig(b, false); }
    }));
    main.querySelectorAll("[data-live]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig(`${b.dataset.naam} live zetten?`, "HQ maakt een eigen GitHub-repo en Netlify-project voor deze klant, publiceert de website en mailt de klant dat zijn site online staat. Daarna koppel je het domein (stap 4).", "Live zetten"))) return;
      SM.bezig(b, true, "Live zetten…");
      try { const r = await api(`hq/opdrachten/${b.dataset.live}/live`, { method: "POST" }); toast(r.url ? `Live: ${r.url}` : "Live gezet", "ok"); if (r.needsLink) toast("Koppel de repo nog even met de hand aan het Netlify-project.", "fout"); opdrachten(main); }
      catch (e) { toast(e.message, "fout"); SM.bezig(b, false); }
    }));
    main.querySelectorAll("[data-opnieuw]").forEach((b) => b.addEventListener("click", () => {
      const dlg = SM.dialoog("Wat moet er anders?", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div><div class="veld"><label for="op-fb">Feedback voor de ontwerper</label><textarea id="op-fb" name="feedback" rows="4" placeholder="Bijv. de hero mag rustiger, gebruik de foto van het team bovenaan, telefoonnummer groter"></textarea></div><button class="knop knop-actie" type="submit">Terug naar de ontwerper</button></form>`);
      dlg.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api(`hq/opdrachten/${b.dataset.opnieuw}/opnieuw`, { method: "POST", body: { feedback: e.target.elements.feedback.value } }); dlg.close(); toast("De ontwerper past hem aan in de volgende ronde."); opdrachten(main); } catch (err) { SM.toonFouten(e.target, err); }
      });
    }));
  }

  // Netlify-credits: melding bovenaan HQ vanaf 75% (bij 100% zet Netlify alles op pauze).
  async function creditBalk() {
    const plek = document.getElementById("credit-balk"); if (!plek) return;
    plek.replaceChildren(); return; // besluit Maxim (27-10): geen melding bovenaan; de stand staat bij Kosten
    const c = await api("hq/credits").catch(() => null);
    const s = c?.status;
    if (!s || (s.pct < 75 && !c.spaarstand)) { plek.replaceChildren(); return; }
    render(plek, html`<div class="credit-balk ${s.pct >= 90 ? "rood" : ""}" role="alert"><b>Netlify-credits: ${s.pct}% gebruikt</b> (${s.gebruikt.toLocaleString("nl-NL")} van ${s.inbegrepen.toLocaleString("nl-NL")}). Bij 100% gaan alle websites offline.${c.spaarstand ? " Spaarstand staat aan." : ""} <a href="#kosten">Bekijken</a></div>`);
  }

  function creditPaneel(c) {
    const s = c?.status;
    if (!s) return html`<section class="paneel compact"><h2>Netlify-credits</h2><p class="dempen">Nog geen meting. De eerste komt binnen een half uur na de deploy.</p></section>`;
    const kleur = s.pct >= 90 ? "rood" : s.pct >= 75 ? "oranje" : "";
    return html`<section class="paneel" id="credits"><div class="paneel-kop"><h2>Netlify-credits</h2><span class="chip ${c.spaarstand ? "s-let" : "s-ok"}">${c.spaarstand ? "Spaarstand aan" : "Normaal"}</span></div>
      <p><b class="credit-groot">${s.pct}%</b> gebruikt: ${s.gebruikt.toLocaleString("nl-NL")} van ${s.inbegrepen.toLocaleString("nl-NL")} credits, periode ${datum(s.periode)} tot ${datum(s.tot)}. Verwacht aan het eind van de periode: ${s.prognose.toLocaleString("nl-NL")}.</p>
      <div class="credit-meter ${kleur}" role="img" aria-label="${s.pct}% gebruikt"><span data-w="${Math.min(100, s.pct)}"></span><i data-w="75"></i></div>
      <p class="klein dempen">${s.onderdelen.deploysAantal} productiedeploys (${s.onderdelen.deploys} credits) · rekentijd ±${s.onderdelen.compute} · AI ±${s.onderdelen.ai}. ${s.bron === "netlify" ? "Getal van Netlify." : s.bron === "ijkpunt" ? `Vanaf jouw ijkpunt (${c.ijkpunt?.waarde}) bijgeteld.` : "Schatting: bandbreedte en bezoekers tellen we niet mee, vul daarom af en toe het echte getal in."} Bijgewerkt ${geleden(s.at)}.</p>
      <p class="klein">Vanaf 75% krijg je een mail en gaat de spaarstand aan: geen nieuwe leads zoeken, geen concepten scannen en geen AI-briefings. Mail, betalingen, klantvragen en klantsites lopen door. Zeker weten dat niets offline gaat? Zet in Netlify › Billing <b>Auto recharge</b> aan.</p>
      ${isAdmin() ? html`<form class="rij-form" id="credit-form"><div class="veld"><label for="cr-g">Gebruikt volgens Netlify <span class="opt">(Billing › Credit usage)</span></label><input id="cr-g" name="gebruikt" type="number" min="0" inputmode="numeric" placeholder="${s.gebruikt}"></div>
        <div class="veld"><label for="cr-t">Totaal credits deze periode <span class="opt">(na bijkopen of upgraden)</span></label><input id="cr-t" name="totaal" type="number" min="0" inputmode="numeric" value="${c.totaal || ""}" placeholder="${s.inbegrepen}"></div>
        <div class="veld"><label for="cr-d">Periode begint op dag</label><input id="cr-d" name="periodeDag" type="number" min="1" max="28" value="${c.periodeDag}"></div>
        <button class="knop knop-licht" type="submit">Opslaan</button><button class="knop knop-tekst" type="button" id="cr-spaar">${c.spaarstand ? "Spaarstand uitzetten" : "Spaarstand aanzetten"}</button></form>` : ""}</section>`;
  }

  async function kosten(main) {
    const [d, cr] = await Promise.all([api("hq/kosten"), api("hq/credits").catch(() => null)]);
    const mnd = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 15).toLocaleDateString("nl-NL", { month: "short", year: "2-digit" }); };
    const max = Math.max(1, ...d.maanden.map((m) => Math.max(m.omzet, m.kosten)));
    const nu = new Date(), jaar = nu.getFullYear(), kw = Math.floor(nu.getMonth() / 3) + 1;
    const SOORT = { maandelijks: "per maand", jaarlijks: "per jaar", eenmalig: "eenmalig" };
    render(main, html`
      <div class="hq-kop"><div><h1>Kosten en winst</h1><p>Vul je vaste en losse kosten in (exclusief btw). Omzet komt uit de betaalde facturen.</p></div>${isAdmin() ? html`<button class="knop knop-actie" id="nieuw">Kosten toevoegen</button>` : ""}</div>
      <div class="kpis">
        <div class="kpi"><div class="waarde">${euro(d.mrr)}</div><div class="naam">abonnementen per maand</div></div>
        <div class="kpi"><div class="waarde">${euro(d.vasteKostenPerMaand)}</div><div class="naam">vaste kosten per maand (jaarkosten gedeeld door 12)</div></div>
        <div class="kpi ${d.mrr - d.vasteKostenPerMaand < 0 ? "alarm" : ""}"><div class="waarde">${euro(d.mrr - d.vasteKostenPerMaand)}</div><div class="naam">blijft per maand over, excl. btw en vóór belasting</div></div>
      </div>
      ${creditPaneel(cr)}
      <section class="paneel"><div class="paneel-kop"><h2>Laatste 12 maanden</h2><span class="legenda"><span class="sw omzet"></span>Omzet <span class="sw kosten"></span>Kosten</span></div>
        <div class="staven" role="img" aria-label="Omzet en kosten per maand">${d.maanden.map((m) => html`<div class="staaf-groep" title="${mnd(m.maand)}: omzet ${euro(m.omzet)}, kosten ${euro(m.kosten)}"><div class="staaf-paar"><span class="staaf omzet" data-h="${Math.round((m.omzet / max) * 100)}"></span><span class="staaf kosten" data-h="${Math.round((m.kosten / max) * 100)}"></span></div><span class="klein dempen">${mnd(m.maand)}</span></div>`)}</div>
        <div class="tabel-wrap"><table class="tabel"><thead><tr><th>Maand</th><th class="rechts">Omzet</th><th class="rechts">Kosten</th><th class="rechts">Winst</th></tr></thead><tbody>
          ${d.maanden.slice().reverse().map((m) => html`<tr><td>${mnd(m.maand)}</td><td class="rechts nummers">${euro(m.omzet)}</td><td class="rechts nummers">${euro(m.kosten)}</td><td class="rechts nummers ${m.winst < 0 ? "min" : ""}">${euro(m.winst)}</td></tr>`)}</tbody></table></div>
        <p class="klein dempen">Bedragen exclusief btw. Omzet = betaalde facturen in die maand.</p></section>
      <section class="paneel"><div class="paneel-kop"><h2>Kostenposten</h2></div>
        ${d.kosten.length ? html`<div class="tabel-wrap"><table class="tabel"><thead><tr><th>Omschrijving</th><th>Categorie</th><th class="rechts">Bedrag excl. btw</th><th>Periode</th><th class="acties"></th></tr></thead><tbody>
          ${d.kosten.map((k) => html`<tr><td><b>${k.omschrijving}</b>${k.leverancier ? html`<br><span class="klein dempen">${k.leverancier}</span>` : ""}</td><td>${d.categorieen[k.categorie] || k.categorie}</td>
            <td class="rechts nummers">${euro(k.bedragCents)} <span class="klein dempen">${SOORT[k.soort]}</span></td>
            <td>${k.soort === "eenmalig" ? datum(k.datum) : html`vanaf ${datum(k.datum)}${k.tot ? html`<br>tot en met ${datum(k.tot)}` : ""}`}</td>
            <td class="acties">${isAdmin() ? html`<button class="knop knop-tekst knop-klein" data-bewerk="${k.id}">Bewerken</button><button class="knop knop-tekst knop-klein" data-weg="${k.id}">Verwijderen</button>` : ""}</td></tr>`)}</tbody></table></div>`
          : html`<div class="leeg"><h3>Nog geen kosten ingevuld</h3><p>Denk aan Netlify, je mailprovider, Claude, Outscraper, domeinen en advertenties. Dan zie je hier wat er echt overblijft.</p></div>`}</section>
      <section class="paneel compact"><h2>Export voor de boekhouder</h2>
        <p class="dempen">Een CSV-bestand (opent in Excel) met alle facturen en kosten van de periode, met btw apart.</p>
        <form class="rij-form" id="export"><div class="veld"><label for="ex-jaar">Jaar</label><select id="ex-jaar" name="jaar">${[jaar, jaar - 1].map((y) => html`<option>${y}</option>`)}</select></div>
          <div class="veld"><label for="ex-kw">Periode</label><select id="ex-kw" name="kwartaal">${[1, 2, 3, 4].map((k) => html`<option value="${k}" ${k === kw ? raw("selected") : ""}>Kwartaal ${k}</option>`)}<option value="0">Heel het jaar</option></select></div>
          <button class="knop knop-licht" type="submit">${raw(icon.download)}Downloaden</button></form></section>`);
    main.querySelectorAll(".staaf[data-h]").forEach((el) => el.style.setProperty("--h", el.dataset.h + "%"));
    main.querySelectorAll(".credit-meter [data-w]").forEach((el) => el.style.setProperty("--w", el.dataset.w + "%"));
    main.querySelector("#credit-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      try { await api("hq/credits", { method: "POST", body: { gebruikt: f.gebruikt.value, periodeDag: f.periodeDag.value, totaal: f.totaal.value } }); toast("Opgeslagen."); creditBalk(); kosten(main); } catch (err) { toast(err.message, "fout"); }
    });
    main.querySelector("#cr-spaar")?.addEventListener("click", async () => {
      try { await api("hq/credits", { method: "POST", body: { spaarstand: !cr.spaarstand } }); toast(cr.spaarstand ? "Spaarstand staat uit voor deze periode." : "Spaarstand staat aan."); creditBalk(); kosten(main); } catch (err) { toast(err.message, "fout"); }
    });
    main.querySelector("#export").addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(e.target); location.href = `/api/hq/kosten/export?jaar=${f.get("jaar")}&kwartaal=${f.get("kwartaal")}`; });
    const dialoog = (k = {}) => {
      const bedrag = (c) => c != null ? (c / 100).toFixed(2).replace(".", ",") : "";
      const dlg = SM.dialoog(k.id ? "Kosten bewerken" : "Kosten toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="rij2"><div class="veld"><label for="k-oms">Omschrijving</label><input id="k-oms" name="omschrijving" value="${k.omschrijving || ""}" placeholder="Bijvoorbeeld Netlify Pro"><div class="fout" data-fout-voor="omschrijving"></div></div>
          <div class="veld"><label for="k-lev">Leverancier <span class="opt">(optioneel)</span></label><input id="k-lev" name="leverancier" value="${k.leverancier || ""}"></div></div>
        <div class="rij2"><div class="veld"><label for="k-cat">Categorie</label><select id="k-cat" name="categorie">${Object.entries(d.categorieen).map(([v, t]) => html`<option value="${v}" ${v === (k.categorie || "software") ? raw("selected") : ""}>${t}</option>`)}</select></div>
          <div class="veld"><label for="k-soort">Soort</label><select id="k-soort" name="soort">${Object.entries(SOORT).map(([v, t]) => html`<option value="${v}" ${v === (k.soort || "maandelijks") ? raw("selected") : ""}>${t[0].toUpperCase() + t.slice(1)}</option>`)}</select></div></div>
        <div class="rij2"><div class="veld"><label for="k-bed">Bedrag exclusief btw</label><input id="k-bed" name="bedrag" inputmode="decimal" value="${bedrag(k.bedragCents)}" placeholder="19,00"><div class="fout" data-fout-voor="bedrag"></div></div>
          <div class="veld"><label for="k-btw">Btw-bedrag <span class="opt">(optioneel)</span></label><input id="k-btw" name="btw" inputmode="decimal" value="${k.id ? bedrag(k.btwCents) : ""}" placeholder="0,00"><div class="hulp">Voor de export; buitenlandse diensten vaak 0 (verlegd).</div><div class="fout" data-fout-voor="btw"></div></div></div>
        <div class="rij2"><div class="veld"><label for="k-dat" data-label-datum>Vanaf</label><input id="k-dat" name="datum" type="date" value="${k.datum || new Date().toISOString().slice(0, 10)}"><div class="fout" data-fout-voor="datum"></div></div>
          <div class="veld" data-tot><label for="k-tot">Tot en met <span class="opt">(leeg = loopt door)</span></label><input id="k-tot" name="tot" type="date" value="${k.tot || ""}"></div></div>
        <button class="knop knop-actie" type="submit">Opslaan</button></form>`);
      const form = dlg.querySelector("form");
      const wissel = () => { const een = form.elements.soort.value === "eenmalig"; form.querySelector("[data-tot]").hidden = een; form.querySelector("[data-label-datum]").textContent = een ? "Datum" : "Vanaf"; };
      form.elements.soort.addEventListener("change", wissel); wissel();
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        try { await api(k.id ? "hq/kosten/" + k.id : "hq/kosten", { method: k.id ? "PUT" : "POST", body: Object.fromEntries(new FormData(form)) }); dlg.close(); toast("Opgeslagen"); herlaad(); } catch (err) { SM.toonFouten(form, err); }
      });
    };
    main.querySelector("#nieuw")?.addEventListener("click", () => dialoog());
    main.querySelectorAll("[data-bewerk]").forEach((b) => b.addEventListener("click", () => dialoog(d.kosten.find((k) => String(k.id) === b.dataset.bewerk))));
    main.querySelectorAll("[data-weg]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig("Kostenpost verwijderen?", "Hij telt dan ook niet meer mee in eerdere maanden.", "Verwijderen"))) return;
      try { await api("hq/kosten/" + b.dataset.weg, { method: "DELETE" }); toast("Verwijderd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
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
            <div class="veld"><label class="vinkje"><input type="checkbox" name="autoInvoices" ${bi.autoInvoices !== false ? raw("checked") : ""}> Van elke online betaling automatisch een factuur maken en naar de klant mailen</label></div>
            <button class="knop" type="submit">Opslaan</button></form>
          <form class="paneel" id="f-melding" novalidate><h2>Meldingen</h2>
            ${v("email", "Meldingen naar", s.notify.email, { type: "email", hulp: "Nieuwe aanvragen, wijzigingen, mislukte betalingen en sites offline. Leeg = het afzendadres." })}
            <button class="knop" type="submit">Opslaan</button></form>
          <form class="paneel" id="f-tracking" novalidate><h2>Tracking en cookies</h2>
            <p class="klein dempen">Zonder tracking toont de website geen cookiebanner (alleen noodzakelijke cookies). Vul je een Meta Pixel-ID in, dan verschijnt de banner en laadt de pixel pas na toestemming.</p>
            ${v("metaPixelId", "Meta Pixel-ID", s.tracking?.metaPixelId || "", { hulp: "Te vinden in Meta Events Manager. Leeg = geen tracking." })}
            <button class="knop" type="submit">Opslaan</button></form>
        </div>
        <div>
          <section class="paneel"><div class="paneel-kop"><h2>Koppelingen</h2><div class="knoppen"><button class="knop knop-licht knop-klein" id="koppeltest">Koppelingen testen</button><button class="knop knop-licht knop-klein" id="testmail">Testmail naar mij</button></div></div>
            <ul class="checklijst">${d.setup.map((x) => html`<li><span class="ic ${x.ok ? "ja" : "nee"}">${x.ok ? "✓" : "!"}</span><div>${x.label}${x.ok ? "" : html`<small>${x.hint}</small>`}</div></li>`)}</ul></section>
          <form class="paneel" id="f-b2b" novalidate><h2>B2B-mail</h2>
            <div class="rij3">${v("senderName", "Je naam als afzender", b.senderName)}${v("dailyMax", "Max. mails per dag", b.dailyMax, { type: "number" })}${v("perUur", "Max. per uur (0 = automatisch)", b.perUur || 0, { type: "number" })}</div>
            <div class="rij3">${v("from", "Versturen vanaf (uur)", b.sendHours[0], { type: "number" })}${v("to", "tot (uur)", b.sendHours[1], { type: "number" })}${v("followupDays", "Opvolgen na (dagen)", b.followupDays, { type: "number" })}</div>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="aiResearch" ${b.ai.research ? raw("checked") : ""}> Openingszin laten schrijven op basis van de website van het bedrijf (AI)</label></div>
            <h3>Concept-websites</h3>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="cAuto" ${b.concepten?.auto !== false ? raw("checked") : ""}> <span>Automatisch een concept maken voor nieuwe leads met een website<small class="hulp">De link komt in de eerste mail. De ontwerper (geplande Claude-taak) maakt ze elk uur.</small></span></label></div>
            <p class="klein dempen">Elke eerste mail gaat altijd met een voorbeeldwebsite. Een goedgekeurde mail wacht tot het concept klaar is; lukt het concept niet, dan gaat de lead terug naar "Klaar om te mailen".</p>
            <div class="rij2">${v("cPerDag", "Max. concepten per dag", b.concepten?.perDag ?? 20, { type: "number" })}${v("cDagen", "Link geldig (dagen)", b.concepten?.geldigDagen ?? 30, { type: "number" })}</div>
            <h3>Scout (Outscraper)</h3>
            <div class="veld"><label class="vinkje"><input type="checkbox" name="scoutActive" ${b.scout.active ? raw("checked") : ""}> Elke werkdag automatisch nieuwe bedrijven zoeken</label></div>
            <div class="rij2"><div class="veld"><label for="s-cats">Branches</label><textarea id="s-cats" name="categories" rows="4">${b.scout.categories.join("\n")}</textarea><div class="hulp">Eén per regel.</div></div>
              <div class="veld"><label for="s-places">Plaatsen</label><textarea id="s-places" name="places" rows="4">${b.scout.places.join("\n")}</textarea><div class="hulp">Elke dag de volgende plaats.</div></div></div>
            ${v("perDay", "Ongeveer zoveel bedrijven per dag", b.scout.perDay, { type: "number" })}
            <h3>Mailteksten</h3><p class="klein dempen">Te gebruiken: {bedrijf}, {plaats}, {intro}, {concept} (zin met de link naar hun concept, leeg als er geen is), {conceptlink}, {afzender}, {link}. De afmeldlink wordt er automatisch onder gezet.</p>
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
    main.querySelector("#f-tracking").addEventListener("submit", (e) => { e.preventDefault(); opslaan(e.target, { tracking: fd(e.target) }); });
    main.querySelector("#f-b2b").addEventListener("submit", (e) => {
      e.preventDefault(); const f = fd(e.target), el = e.target.elements;
      opslaan(e.target, { b2b: { senderName: f.senderName, dailyMax: Number(f.dailyMax), perUur: Number(f.perUur), followupDays: Number(f.followupDays), sendHours: [Number(f.from), Number(f.to)], ai: { research: el.aiResearch.checked },
        concepten: { auto: el.cAuto.checked, perDag: Number(f.cPerDag), geldigDagen: Number(f.cDagen) },
        scout: { active: el.scoutActive.checked, perDay: Number(f.perDay), categories: f.categories, places: f.places },
        templates: { eerste: { subject: f.t1s, body: f.t1b }, opvolging: { subject: f.t2s, body: f.t2b } } } });
    });
    main.querySelector("#standaard").addEventListener("click", () => {
      const t = d.defaults.templates, el = main.querySelector("#f-b2b").elements;
      el.t1s.value = t.eerste.subject; el.t1b.value = t.eerste.body; el.t2s.value = t.opvolging.subject; el.t2b.value = t.opvolging.body;
      toast("Standaardteksten ingevuld; klik op Opslaan om ze te bewaren.");
    });
    main.querySelector("#koppeltest")?.addEventListener("click", async (e) => {
      SM.bezig(e.target, true, "Testen… (± 1 minuut)");
      try {
        const r = await api("hq/koppelingen/test", { method: "POST" });
        const regels = (r.stappen || []).map((x) => `${x.ok ? "✓" : "✗"} ${x.naam}${x.info ? ` (${x.info})` : ""}`).join("\n");
        SM.dialoog(r.ok ? "Koppelingen werken" : "Er gaat iets mis", html`<pre class="klein">${regels}</pre>`);
      } catch (err) { toast(err.message, "fout"); }
      SM.bezig(e.target, false);
    });
    main.querySelector("#testmail").addEventListener("click", async (e) => {
      e.target.disabled = false; SM.bezig(e.target, true, "Versturen…");
      try { const r = await api("hq/settings/testmail", { method: "POST" }); toast(r.ok ? `Testmail verstuurd naar ${me.email}` : r.error, r.ok ? "ok" : "fout"); } catch (err) { toast(err.message, "fout"); }
      SM.bezig(e.target, false);
    });
  }

  // ================================================ TEAM
  async function team(main) {
    const d = await api("hq/medewerkers");
    render(main, html`
      <div class="hq-kop"><div><h1>Team</h1><p>Medewerkers kunnen klanten, wijzigingen, facturen en B2B beheren. Beheerders ook instellingen, team en het opzeggen van abonnementen.</p></div>${isAdmin() ? html`<button class="knop knop-actie" id="lid">Teamlid toevoegen</button>` : ""}</div>
      <section class="paneel"><div class="tabel-wrap"><table class="tabel"><thead><tr><th>E-mail</th><th>Rol</th><th>Laatst ingelogd</th><th></th></tr></thead><tbody>
        ${d.team.map((u) => html`<tr><td><b>${u.email}</b>${u.name ? html`<br><span class="klein dempen">${u.name}</span>` : ""}</td><td>${u.role === "admin" ? "Beheerder" : "Medewerker"}${u.fromEnv ? html` <span class="status s-info">ADMIN_EMAILS</span>` : ""}${u.active ? "" : html` <span class="status s-grijs">Geblokkeerd</span>`}</td>
          <td>${u.last_login_at ? geleden(u.last_login_at) : "–"}</td><td class="acties">${isAdmin() && u.email !== me.email ? html`<button class="knop knop-tekst knop-klein" data-lid='${JSON.stringify({ email: u.email, name: u.name, role: u.role, active: !u.active })}'>${u.active ? "Blokkeren" : "Toegang geven"}</button>${u.fromEnv ? "" : html`<button class="knop knop-tekst knop-klein knop-gevaar" data-lid-weg="${u.id}" data-email="${u.email}">Verwijderen</button>`}` : ""}</td></tr>`)}</tbody></table></div></section>`);
    main.querySelectorAll("[data-lid]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("hq/medewerkers", { method: "POST", body: JSON.parse(b.dataset.lid) }); toast("Bijgewerkt"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelectorAll("[data-lid-weg]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await SM.bevestig("Teamlid verwijderen?", `${b.dataset.email} wordt verwijderd en uitgelogd en kan niet meer inloggen in HQ. Wat deze persoon eerder deed, blijft in het logboek staan.`, "Verwijderen"))) return;
      try { await api(`hq/medewerkers/${b.dataset.lidWeg}`, { method: "DELETE" }); toast("Teamlid verwijderd"); herlaad(); } catch (err) { toast(err.message, "fout"); }
    }));
    main.querySelector("#lid")?.addEventListener("click", () => {
      const dlg = SM.dialoog("Teamlid toevoegen", html`<form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="t-email">E-mailadres</label><input id="t-email" name="email" type="email" required></div>
        <div class="veld"><label for="t-naam">Naam</label><input id="t-naam" name="name"></div>
        <div class="veld"><label for="t-rol">Rol</label><select id="t-rol" name="role"><option value="medewerker">Medewerker</option><option value="admin">Beheerder</option></select></div>
        <button class="knop knop-actie" type="submit">Toevoegen</button></form>`);
      dlg.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api("hq/medewerkers", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); dlg.close(); toast("Teamlid toegevoegd; inloggen gaat met een code per mail"); herlaad(); } catch (err) { SM.toonFouten(e.target, err); }
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
