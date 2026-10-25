// Klantenportaal › Account: domeinnaam, hulp (klantvragen), review en opzeggen.
// Wordt aangeroepen vanuit app.js met SM_ACCOUNT.toon(main, state, herlaad).
(() => {
  const { html, raw, render, api, euro, datumLang, tijd, toast, icon } = SM;
  let acc = null;
  const datum = (d) => d ? new Date(String(d).length === 10 ? d + "T12:00:00" : d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "";
  const STATUS_KLASSE = { wacht_op_klant: "s-let", aangevraagd: "s-let", verhuizen: "s-info", registreren: "s-info", dns_klaar: "s-info", actief: "s-ok", probleem: "s-fout", opgezegd: "s-grijs" };
  const VRAAG = { open: ["We kijken ernaar", "s-info"], beantwoord: ["Beantwoord", "s-ok"], gesloten: ["Afgerond", "s-grijs"] };

  async function toon(main, state) {
    render(main, html`<div class="hq-kop"><div><h1>Account</h1><p>Hulp van ons, je websites en je abonnement.</p></div></div><p class="dempen">Laden…</p>`);
    try { acc = await api("portal/account"); } catch (e) { render(main, html`<div class="melding melding-fout">${e.message}</div>`); return; }
    const sub = (location.hash.split("/")[1] || "");
    if (sub === "opzeggen") return opzeggen(main, state);
    render(main, html`
      <div class="hq-kop"><div><h1>Account</h1><p>Hulp van ons, je websites en je abonnement.</p></div></div>
      <div class="p-raster">
        <div>
          <section class="paneel" id="domein" aria-labelledby="t-domein"></section>
          <section class="paneel" id="hulp" aria-labelledby="t-hulp"></section>
        </div>
        <div>
          <section class="paneel compact" id="websites" aria-labelledby="t-sites"></section>
          ${acc.review.kan || acc.review.gedaan ? html`<section class="paneel compact" id="review" aria-labelledby="t-review"></section>` : ""}
          <section class="paneel compact" id="abo" aria-labelledby="t-abo2"></section>
        </div>
      </div>`);
    domein(main.querySelector("#domein"));
    hulp(main.querySelector("#hulp"));
    if (main.querySelector("#review")) review(main.querySelector("#review"));
    abonnement(main.querySelector("#abo"), state);
    websitesPaneel(main.querySelector("#websites"), state);
    if (location.hash.split("/")[1]) main.querySelector("#" + location.hash.split("/")[1])?.scrollIntoView();
  }

  // ------------------------------------------------ domein
  function domein(vak) {
    const { domein: d } = acc.domein;
    // De domeinnaam geeft de klant op bij de start (informatie aanleveren). Hier alleen nog de stappen zolang hij niet werkt.
    if (!d || d.status === "actief") { vak.hidden = true; return; }
    const ins = d.instructies;
    render(vak, html`
      <div class="paneel-kop"><h2 id="t-domein">Domeinnaam</h2><span class="status ${STATUS_KLASSE[d.status] || "s-grijs"}">${d.statusLabel}</span></div>
      <p class="domein-naam">${d.naam}</p>
        ${d.status === "actief" ? html`<div class="melding melding-ok">${raw(icon.ok)}<p>Je website draait op ${d.naam}. Er is niets meer te doen.</p></div>` : html`
          <p>Je domein blijft van jou en bij je eigen provider; wij beheren het niet. Log in bij je provider${d.provider ? ` (${d.provider})` : ""} en zet deze twee instellingen bij de DNS van ${d.naam}:</p>
          ${ins.records.length ? html`<div class="tabel-scroll"><table class="dns-tabel"><thead><tr><th>Type</th><th>Naam</th><th>Waarde</th></tr></thead><tbody>
            ${ins.records.map((r) => html`<tr><td><b>${r.type}</b></td><td>${r.naam}</td><td><code>${r.waarde}</code> <button class="knop knop-tekst knop-klein" type="button" data-kopieer="${r.waarde}">Kopiëren</button></td></tr>`)}
          </tbody></table></div>
          <p class="klein dempen">${ins.letop} Staan er al A- of CNAME-records voor @ of www? Vervang die dan.</p>`
          : html`<div class="melding melding-info">${raw(icon.let)}<p>Zodra je website klaarstaat, zie je hier precies welke instellingen je moet aanpassen. Je krijgt dan ook een mail.</p></div>`}
          ${d.dnsAt ? html`<p class="klein ${d.dnsOk ? "" : "dempen"}">Laatste controle ${tijd(d.dnsAt)}: ${d.uitleg}</p>` : ""}
          ${ins.records.length ? html`<div class="knoppen"><button class="knop" type="button" id="dns-check">Ik heb het aangepast, controleer nu</button></div>` : ""}
          <p class="klein dempen">We controleren het ook zelf elk halfuur en mailen je als het werkt.</p>`}
      <p class="klein dempen">Klopt de domeinnaam niet? Stel hieronder een vraag, dan passen we het aan.</p>`);
    vak.querySelectorAll("[data-kopieer]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.kopieer); toast("Gekopieerd"); } catch { toast("Kopiëren lukte niet; selecteer de tekst", "fout"); } }));
    vak.querySelector("#dns-check")?.addEventListener("click", async (e) => {
      SM.bezig(e.target, true, "Controleren…");
      try { acc.domein = await api("portal/domein/check", { method: "POST" }); domein(vak); toast(acc.domein.domein.dnsOk ? "Het klopt!" : "Nog niet goed; zie de uitleg"); }
      catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    });

  }



  // ------------------------------------------------ meerdere websites
  const SITESTATUS = { in_aanbouw: ["In aanbouw", "s-info"], live: ["Online", "s-ok"], gepauzeerd: ["Gepauzeerd", "s-let"], opgezegd: ["Opgezegd", "s-grijs"] };
  function websitesPaneel(vak, state) {
    const lijst = state.websites || [], c = state.customer, o = state.offer;
    render(vak, html`<h2 id="t-sites">${lijst.length > 1 ? "Je websites" : "Je website"}</h2>
      <ul class="lijst sites-lijst">${lijst.map((w) => html`<li class="${w.id === c.id ? "actief" : ""}"><div><b>${w.naam}</b><br><span class="klein dempen">${w.url ? w.url.replace(/^https?:\/\//, "") : w.start ? "Nog te starten" : "Nog geen adres"}</span></div>
        <div>${(() => { const [t, k] = SITESTATUS[w.siteStatus] || [w.siteStatus, "s-grijs"]; return html`<span class="status ${k}">${t}</span>`; })()}${w.id === c.id ? html`<span class="klein dempen">Open</span>` : html` <button class="knop knop-licht knop-klein" type="button" data-open="${w.id}">Openen</button>`}</div></li>`)}</ul>
      <details class="anders" id="extra"><summary>Extra website aanvragen</summary>
        <p class="klein">Een extra website werkt net zo: ${euro(o.buildCents)} eenmalig en ${euro(o.monthlyCents)} per maand, met hosting en ${o.changesPerMonth} wijzigingen per maand voor die website. Je beheert alles met deze inlog.</p>
        <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <div class="veld"><label for="x-naam">Naam van de website</label><input id="x-naam" name="naam" maxlength="120" placeholder="Bijvoorbeeld de naam van je tweede zaak"><div class="fout" data-fout-voor="naam"></div></div>
          <div class="veld"><label for="x-oms">Waar gaat de website over?</label><textarea id="x-oms" name="omschrijving" rows="3" maxlength="3000"></textarea><div class="fout" data-fout-voor="omschrijving"></div></div>
          <div class="veld"><label for="x-site">Huidige website <span class="opt">(optioneel)</span></label><input id="x-site" name="huidigeSite" maxlength="300"></div>
          <div class="knoppen"><button class="knop knop-actie" type="submit">Aanvragen</button></div>
          <p class="klein dempen">Na het aanvragen ga je akkoord en betaal je de bouwprijs; daarna lever je de informatie aan en staat de website binnen ${o.deliveryText} online.</p>
        </form></details>`);
    vak.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => window.SM_PORTAAL_WISSEL(Number(b.dataset.open))));
    const form = vak.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Aanvragen…");
      try { await api("portal/website/nieuw", { method: "POST", body: Object.fromEntries(new FormData(form)) }); location.hash = "#overzicht"; location.reload(); }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
    if (location.hash === "#account/extra") vak.querySelector("#extra").open = true;
  }

  // ------------------------------------------------ hulp / klantvragen
  function hulp(vak) {
    const vragen = acc.vragen;
    render(vak, html`
      <h2 id="t-hulp">Hulp nodig?</h2>
      <p class="dempen">Een vraag over je website, je factuur of iets anders? Stel hem hier, dan reageren we zo snel mogelijk. Wil je iets op je website laten aanpassen? Geef dat door als <a href="#nieuw">wijziging</a>.</p>
      <form novalidate id="vraag-form"><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="v-ond">Onderwerp</label><input id="v-ond" name="onderwerp" maxlength="160" required><div class="fout" data-fout-voor="onderwerp"></div></div>
        <div class="veld"><label for="v-tekst">Je vraag</label><textarea id="v-tekst" name="tekst" rows="4" maxlength="6000" required></textarea><div class="fout" data-fout-voor="tekst"></div></div>
        <div class="knoppen"><button class="knop knop-actie" type="submit">Vraag versturen</button></div>
      </form>
      ${vragen.length ? html`<h3 class="sub-kop">Je vragen</h3><ul class="lijst vragen">${vragen.map((v) => html`<li>
        <details><summary><span class="vraag-kop"><b>${v.onderwerp}</b><span class="status ${VRAAG[v.status][1]}">${VRAAG[v.status][0]}</span></span><span class="klein dempen">${tijd(v.updatedAt)}</span></summary>
          <ol class="gesprek">${v.berichten.map((m) => html`<li class="${m.van === "klant" ? "van-klant" : "van-ons"}"><span class="klein dempen">${m.van === "klant" ? "Jij" : "Sitemaker"} · ${tijd(m.at)}</span><p>${m.tekst}</p></li>`)}</ol>
          ${v.status !== "gesloten" ? html`<form class="reageer" data-id="${v.id}" novalidate><label class="sr" for="r-${v.id}">Reageren</label><textarea id="r-${v.id}" name="tekst" rows="2" placeholder="Reageren…"></textarea><button class="knop knop-licht knop-klein" type="submit">Versturen</button></form>` : ""}
        </details></li>`)}</ul>` : ""}`);
    const form = vak.querySelector("#vraag-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Versturen…");
      try {
        await api("portal/vragen", { method: "POST", body: Object.fromEntries(new FormData(form)) });
        acc = await api("portal/account"); hulp(vak);
        const ok = html`<div class="melding melding-ok" role="status">${raw(icon.ok)}<p>Je vraag is verstuurd. Je krijgt ons antwoord per mail en ziet het ook hier.</p></div>`;
        vak.insertAdjacentHTML("afterbegin", String(ok));
      } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
    vak.querySelectorAll("form.reageer").forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tekst = f.elements.tekst.value.trim(); if (tekst.length < 2) return;
      const knop = f.querySelector("button"); SM.bezig(knop, true, "Versturen…");
      try { await api(`portal/vragen/${f.dataset.id}`, { method: "POST", body: { tekst } }); acc = await api("portal/account"); hulp(vak); toast("Verstuurd"); }
      catch (err) { toast(err.message, "fout"); SM.bezig(knop, false); }
    }));
  }

  // ------------------------------------------------ review (één keer)
  function review(vak) {
    const r = acc.review;
    if (r.gedaan) {
      render(vak, html`<h2 id="t-review">Je review</h2><p class="sterren" aria-label="${r.gedaan.rating} van 5 sterren">${"★".repeat(r.gedaan.rating)}<span class="leeg">${"★".repeat(5 - r.gedaan.rating)}</span></p>
        ${r.gedaan.title ? html`<p><b>${r.gedaan.title}</b></p>` : ""}<p>${r.gedaan.body}</p><p class="klein dempen">Dank je wel! ${r.gedaan.gepubliceerd ? "Je review staat op onze website." : "We plaatsen hem binnenkort op onze website."}</p>`);
      return;
    }
    render(vak, html`<h2 id="t-review">Hoe bevalt je website?</h2>
      <p class="dempen">Je kunt één keer een review schrijven. Met je toestemming zetten we hem op onze website.</p>
      <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <fieldset class="sterren-kies"><legend>Je beoordeling</legend>
          ${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" name="rating" id="st-${n}" value="${n}"><label for="st-${n}" title="${n} van 5">★<span class="sr">${n} van 5 sterren</span></label>`)}
        </fieldset><div class="fout" data-fout-voor="rating"></div>
        <div class="veld"><label for="rv-titel">Titel <span class="opt">(optioneel)</span></label><input id="rv-titel" name="titel" maxlength="120"></div>
        <div class="veld"><label for="rv-tekst">Je ervaring</label><textarea id="rv-tekst" name="tekst" rows="4" maxlength="1500" required placeholder="Hoe ging het maken van je website, en wat vind je ervan?"></textarea><div class="fout" data-fout-voor="tekst"></div></div>
        <div class="veld"><label for="rv-naam">Naam bij je review</label><input id="rv-naam" name="naam" value="${r.naam}" maxlength="80" required><div class="hulp">Met je bedrijfsnaam: ${r.bedrijf}</div><div class="fout" data-fout-voor="naam"></div></div>
        <div class="veld"><label class="vinkje"><input type="checkbox" name="toestemming"> <span>Sitemaker mag deze review met mijn naam en bedrijfsnaam op de website tonen.</span></label><div class="fout" data-fout-voor="toestemming"></div></div>
        <div class="knoppen"><button class="knop knop-actie" type="submit">Review versturen</button></div>
      </form>`);
    const form = vak.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); SM.wisFouten(form);
      const b = Object.fromEntries(new FormData(form)); b.toestemming = form.elements.toestemming.checked;
      if (!b.rating) return SM.toonFouten(form, { message: "Kies 1 tot 5 sterren.", data: { field: "rating" } });
      const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Versturen…");
      try { acc.review = await api("portal/review", { method: "POST", body: b }); review(vak); toast("Dank je wel voor je review!"); }
      catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
    });
  }

  // ------------------------------------------------ abonnement + opzeggen
  function abonnement(vak, state) {
    const o = acc.opzeggen, c = state.customer;
    render(vak, html`<h2 id="t-abo2">Abonnement</h2>
      <div class="regel"><span>Per maand</span><b class="nummers">${euro(c.monthlyCents)}</b></div>
      ${c.subscriptionStart ? html`<div class="regel"><span>Sinds</span><span>${datumLang(c.subscriptionStart)}</span></div>` : ""}
      ${o.status === "aangevraagd" ? html`<div class="melding melding-let">${raw(icon.let)}<div><p><b>Je hebt opgezegd.</b> Je abonnement loopt tot en met ${datum(o.einde)}. Tot dan blijft je website online.</p><button class="knop knop-licht knop-klein" type="button" id="intrekken">Toch blijven</button></div></div>`
        : o.status === "afgerond" ? html`<p class="klein dempen">Je abonnement is beëindigd.</p>`
        : o.kan ? html`<p class="klein dempen">Opzeggen kan per maand, met een opzegtermijn van één kalendermaand. <a href="#account/opzeggen" class="dempen">Abonnement opzeggen</a></p>` : ""}`);
    vak.querySelector("#intrekken")?.addEventListener("click", async (e) => {
      SM.bezig(e.target, true, "Even geduld…");
      try { acc.opzeggen = await api("portal/opzeggen/intrekken", { method: "POST" }); abonnement(vak, state); toast("Fijn dat je blijft! Je opzegging is ingetrokken."); }
      catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
    });
  }

  // Opzeggen in drie stappen: waarom → kunnen we helpen? → wat er gebeurt + bevestigen.
  function opzeggen(main, state) {
    const o = acc.opzeggen;
    if (o.status === "aangevraagd" || !o.kan) { location.hash = "#account"; return; }
    const keuze = { reden: "", toelichting: "" };
    const kop = (n) => html`<div class="hq-kop"><div><a class="terug" href="#account">Terug naar je account</a><h1>Abonnement opzeggen</h1><p>Stap ${n} van 3</p></div></div>`;
    const HULP = {
      te_duur: "Vertel ons wat voor jou een goede prijs zou zijn of wat je mist. Soms kunnen we iets voor je betekenen.",
      geen_resultaat: `Een website die weinig oplevert kan vaak beter: andere teksten, een duidelijkere knop of een betere startpagina. Je hebt elke maand ${state.offer.changesPerMonth} wijzigingen; we denken graag met je mee.`,
      zelf_doen: "Jammer! Weet je dat je teksten en foto's van jou blijven en je domein ook? We helpen je graag met een goede overstap.",
      stoppen: "Wat vervelend, of juist spannend. We regelen het netjes voor je.",
      ontevreden: "Dat willen we graag goedmaken. Vertel ons wat er beter moet; Maxim belt je persoonlijk.",
      anders: "Vertel ons gerust waarom, dan kijken we of we iets kunnen doen.",
    };
    const stap1 = () => {
      render(main, html`${kop(1)}<section class="paneel smal"><h2>Waarom wil je opzeggen?</h2>
        <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <fieldset class="keuze-lijst"><legend class="sr">Reden</legend>${Object.entries(o.redenen).map(([k, t]) => html`<label class="keuze-kaart klein"><input type="radio" name="reden" value="${k}"><span>${t}</span></label>`)}</fieldset>
          <div class="fout" data-fout-voor="reden"></div>
          <div class="veld"><label for="oz-toel">Toelichting <span class="opt">(optioneel)</span></label><textarea id="oz-toel" name="toelichting" rows="3" maxlength="2000"></textarea></div>
          <div class="knoppen"><button class="knop" type="submit">Verder</button><a class="knop knop-licht" href="#account">Ik blijf toch</a></div>
        </form></section>`);
      const form = main.querySelector("form");
      form.addEventListener("submit", (e) => {
        e.preventDefault(); SM.wisFouten(form);
        if (!form.elements.reden.value) return SM.toonFouten(form, { message: "Kies de reden waarom je opzegt.", data: { field: "reden" } });
        keuze.reden = form.elements.reden.value; keuze.toelichting = form.elements.toelichting.value; stap2();
      });
    };
    const stap2 = () => {
      render(main, html`${kop(2)}<section class="paneel smal"><h2>Kunnen we je nog helpen?</h2>
        <p>${HULP[keuze.reden]}</p>
        <div class="behoud">
          <button class="knop knop-actie" type="button" id="bel">Bel me even terug</button>
          ${["geen_resultaat", "ontevreden"].includes(keuze.reden) && state.canSubmit?.ok && state.usage?.left > 0 ? html`<a class="knop knop-licht" href="#nieuw">Een wijziging doorgeven</a>` : ""}
        </div>
        <div class="knoppen tussen"><button class="knop knop-tekst" type="button" id="terug1">Vorige</button><button class="knop knop-tekst" type="button" id="verder">Nee, ik wil opzeggen</button></div>
      </section>`);
      main.querySelector("#terug1").onclick = stap1;
      main.querySelector("#verder").onclick = stap3;
      main.querySelector("#bel").onclick = async (e) => {
        SM.bezig(e.target, true, "Versturen…");
        try {
          await api("portal/opzeggen/bel-me", { method: "POST", body: keuze });
          render(main, html`${kop(2)}<section class="paneel smal bevestiging"><div class="vink">${raw(icon.ok)}</div><h2>We bellen je terug</h2><p>We nemen zo snel mogelijk contact met je op. Je abonnement loopt gewoon door; je hebt nog niets opgezegd.</p><div class="knoppen"><a class="knop" href="#overzicht">Naar je overzicht</a></div></section>`);
        } catch (err) { toast(err.message, "fout"); SM.bezig(e.target, false); }
      };
    };
    const stap3 = () => {
      render(main, html`${kop(3)}<section class="paneel smal"><h2>Dit gebeurt er als je opzegt</h2>
        <ul class="gevolgen">
          <li>Je abonnement loopt door tot en met <b>${datum(o.einde)}</b> (opzegtermijn van één kalendermaand). Tot die datum betaal je de maandelijkse ${euro(state.customer.monthlyCents)}.</li>
          <li>Na die datum gaat je website <b>offline</b> en kun je geen wijzigingen meer doorgeven.</li>
          <li>De bouwprijs krijg je niet terug.</li>
          <li>Binnen 30 dagen na de einddatum kun je je eigen teksten en foto's opvragen.</li>
          ${o.domein ? html`<li>Je domein ${o.domein.naam} staat bij je eigen provider en blijft van jou. Zet de instellingen daar om naar je nieuwe website, of zeg het op bij je provider.</li>` : ""}
          <li>Bedacht? Tot de einddatum kun je de opzegging hier intrekken.</li>
        </ul>
        <form novalidate><div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
          <div class="veld"><label class="vinkje"><input type="checkbox" name="akkoord"> <span>Ik begrijp dat mijn website na ${datum(o.einde)} offline gaat.</span></label><div class="fout" data-fout-voor="akkoord"></div></div>
          <div class="veld"><label for="oz-naam">Typ je bedrijfsnaam om te bevestigen: <b>${o.bedrijf}</b></label><input id="oz-naam" name="bevestig" autocomplete="off" required><div class="fout" data-fout-voor="bevestig"></div></div>
          <div class="knoppen tussen"><button class="knop knop-tekst" type="button" id="terug2">Vorige</button><button class="knop knop-gevaar" type="submit">Abonnement opzeggen</button></div>
        </form></section>`);
      main.querySelector("#terug2").onclick = stap2;
      const form = main.querySelector("form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const knop = form.querySelector("[type=submit]"); SM.bezig(knop, true, "Opzeggen…");
        try {
          acc.opzeggen = await api("portal/opzeggen", { method: "POST", body: { ...keuze, akkoord: form.elements.akkoord.checked, bevestig: form.elements.bevestig.value } });
          render(main, html`<section class="paneel smal bevestiging"><div class="vink">${raw(icon.ok)}</div><h1>Je opzegging is ontvangen</h1><p>Je abonnement loopt tot en met <b>${datum(acc.opzeggen.einde)}</b>. Je krijgt een bevestiging per mail. Bedacht? Dan kun je de opzegging tot die datum intrekken bij Account.</p><div class="knoppen"><a class="knop" href="#account">Naar je account</a></div></section>`);
        } catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
      });
    };
    stap1();
  }

  window.SM_ACCOUNT = { toon };
})();
