// "Ik heb interesse" (/interesse?concept=…&bedrijf=…): kiezen tussen direct starten, videomeeting of bellen.
(() => {
  const $ = (s) => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const concept = /^[\w-]{8,40}$/.test(qs.get("concept") || "") ? qs.get("concept") : "";
  const bedrijf = (qs.get("bedrijf") || "").slice(0, 120);
  const geopend = Date.now();
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (bedrijf) { $("#voor-bedrijf").textContent = ` in een nieuwe website voor ${bedrijf}`; $("#s-bedrijf").value = bedrijf; $("#a-bedrijf").value = bedrijf; }

  if (!concept) document.querySelectorAll(".jason-zin").forEach((el) => (el.textContent = "Zullen we samen jouw nieuwe website maken?"));
  if (concept) document.querySelectorAll("[data-met-concept]").forEach((el) => (el.hidden = false));
  const vakken = { start: $("#vak-start"), afspraak: $("#vak-afspraak") };
  let soort = "video", gekozen = null;
  document.querySelectorAll(".optie").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".optie").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const k = b.dataset.keuze;
    vakken.start.hidden = k !== "start";
    vakken.afspraak.hidden = k === "start";
    if (k !== "start") { soort = k; laadMomenten(); }
    (k === "start" ? vakken.start : vakken.afspraak).scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  // Vanaf de homepage: ?keuze=start|video|telefoon opent die keuze meteen.
  const voorkeuze = qs.get("keuze");
  if (["start", "video", "telefoon"].includes(voorkeuze)) setTimeout(() => document.querySelector(`.optie[data-keuze="${voorkeuze}"]`)?.click(), 150);

  // Knoppen verderop op de pagina openen dezelfde keuze bovenaan.
  document.querySelectorAll("[data-naar]").forEach((b) => b.addEventListener("click", () => document.querySelector(`.optie[data-keuze="${b.dataset.naar}"]`)?.click()));

  // Foutmeldingen bij velden
  const zetFouten = (form, prefix, errors) => {
    form.querySelectorAll(".fout").forEach((el) => (el.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
    for (const [k, v] of Object.entries(errors || {})) {
      const el = document.getElementById(`${prefix}-${k}`), input = form.elements[k];
      if (el) el.textContent = v;
      if (input) input.setAttribute("aria-invalid", "true");
    }
    const eerste = Object.keys(errors || {})[0];
    if (eerste && form.elements[eerste]) form.elements[eerste].focus();
  };
  const bedankt = (vak, titel, tekst, knop) => {
    const div = document.createElement("div");
    div.className = "bedankt"; div.setAttribute("role", "status"); div.tabIndex = -1;
    div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><h3>${esc(titel)}</h3><p>${tekst}</p>${knop ? `<div class="b-acties"><a class="knop knop-actie" href="${esc(knop.href)}">${esc(knop.label)}</a></div>` : ""}`;
    vak.replaceChildren(div); div.focus();
  };

  // ---------------- Direct starten
  const sf = $("#start-form");
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fout = $("#s-fout"); fout.hidden = true;
    const d = Object.fromEntries(new FormData(sf)), err = {};
    if ((d.naam || "").trim().length < 2) err.naam = "Vul je naam in.";
    if ((d.bedrijf || "").trim().length < 2) err.bedrijf = "Vul de naam van je bedrijf in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || "").trim())) err.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
    if (Object.keys(err).length) return zetFouten(sf, "se", err);
    const knop = sf.querySelector("[type=submit]"); knop.disabled = true; knop.textContent = "Bezig…";
    try {
      const r = await fetch("/api/start/aanmelden", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify({ ...d, concept, t: geopend }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { if (res.errors) zetFouten(sf, "se", res.errors); else { fout.textContent = res.error || "Dat lukte niet. Probeer het opnieuw."; fout.hidden = false; fout.focus(); } return; }
      const naar = { label: "Naar je portaal", href: res.portaal || "/portaal/" };
      try { window.fbq && (window.fbq("track", "Lead", { content_name: "direct starten" }), window.fbq("track", "CompleteRegistration")); } catch {}
      if (res.bestaat) bedankt(vakken.start, "Je hebt al een account", `Log in op je portaal met <b>${esc(res.email)}</b>; je krijgt een code per mail.`, naar);
      else bedankt(vakken.start, "Je account staat klaar", `We hebben je een mail gestuurd. Log in op je portaal met <b>${esc(res.email)}</b>; je krijgt een code per mail. Daarna loop je de drie stappen door en gaan wij aan de slag.`, naar);
    } catch { fout.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw."; fout.hidden = false; }
    finally { knop.disabled = false; knop.textContent = "Account aanmaken"; }
  });

  // ---------------- Videomeeting of bellen
  const af = $("#afspraak-form"), momenten = $("#momenten");
  async function laadMomenten() {
    $("#afspraak-titel").textContent = soort === "video" ? "Kies een moment voor de videomeeting" : "Kies een moment, wij bellen jou";
    $("#afspraak-uitleg").textContent = soort === "video" ? "Samen het voorbeeld doorlopen en je wensen bespreken. Je krijgt een bevestiging met de link per mail." : "Wij bellen je op het gekozen moment op het nummer dat je invult.";
    af.hidden = true; gekozen = null;
    momenten.innerHTML = '<p class="dempen">Momenten laden…</p>';
    let d = null;
    try { d = await (await fetch(`/api/agenda/slots?soort=${soort}`, { headers: { accept: "application/json" } })).json(); } catch {}
    if (!d?.actief || !d.days?.length) {
      momenten.innerHTML = `<p>Er zijn op dit moment geen vrije momenten. <a href="/contact">Stuur ons een bericht</a>, dan nemen we snel contact op.</p>`;
      return;
    }
    const kort = (date, opt) => new Date(date + "T12:00:00").toLocaleDateString("nl-NL", opt);
    let dag = d.days[0].date;
    const teken = () => {
      const dd = d.days.find((x) => x.date === dag);
      momenten.innerHTML = `<div class="b-dagen-wrap"><div class="b-dagen">${d.days.map((x) => `<button type="button" class="b-dag" data-dag="${x.date}" aria-pressed="${x.date === dag}" aria-label="${esc(x.label)}"><small>${kort(x.date, { weekday: "short" })}</small><b>${kort(x.date, { day: "numeric" })}</b><small>${kort(x.date, { month: "short" })}</small></button>`).join("")}</div></div>
        <p class="b-tijdkop">${esc(dd.label)}</p><div class="b-tijden">${dd.times.map((t) => `<button type="button" class="b-tijd" data-start="${t.start}">${t.tijd}</button>`).join("")}</div>`;
      momenten.querySelectorAll(".b-dag").forEach((b) => b.addEventListener("click", () => { dag = b.dataset.dag; teken(); }));
      momenten.querySelectorAll(".b-tijd").forEach((b) => b.addEventListener("click", () => {
        gekozen = b.dataset.start;
        $("#gekozen").innerHTML = `<b>${esc(dd.label)} om ${esc(b.textContent)}</b> · ${soort === "video" ? "videomeeting" : "wij bellen jou"} <button type="button" class="b-wijzig" id="wijzig">Ander moment</button>`;
        momenten.hidden = true; af.hidden = false;
        $("#wijzig").addEventListener("click", () => { af.hidden = true; momenten.hidden = false; });
        af.elements.name.focus();
      }));
    };
    momenten.hidden = false; teken();
  }
  af.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fout = $("#a-fout"); fout.hidden = true;
    const d = Object.fromEntries(new FormData(af)), err = {};
    if ((d.name || "").trim().length < 2) err.name = "Vul je naam in.";
    if ((d.company || "").trim().length < 2) err.company = "Vul de naam van je bedrijf in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || "").trim())) err.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
    if (!/^[+()\d\s-]{8,20}$/.test((d.phone || "").trim())) err.phone = "Vul je telefoonnummer in.";
    if (Object.keys(err).length) return zetFouten(af, "ae", err);
    const knop = af.querySelector("[type=submit]"); knop.disabled = true; knop.textContent = "Bezig…";
    try {
      const r = await fetch("/api/agenda/boek", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify({ ...d, start: gekozen, soort, concept, t: geopend }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (res.slotGone) { fout.textContent = res.error; fout.hidden = false; laadMomenten(); }
        else if (res.errors) zetFouten(af, "ae", res.errors);
        else { fout.textContent = res.error || "Dat lukte niet. Probeer het opnieuw."; fout.hidden = false; fout.focus(); }
        return;
      }
      try { window.fbq && (window.fbq("track", "Lead", { content_name: soort }), window.fbq("track", "Schedule")); } catch {}
      bedankt(vakken.afspraak, "Je afspraak staat vast", `<b>${esc(res.wanneer)}</b>, ${esc(res.hoe)}. Je krijgt een bevestiging per mail, met een link om te annuleren.`);
    } catch { fout.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw."; fout.hidden = false; }
    finally { knop.disabled = false; knop.textContent = "Afspraak bevestigen"; }
  });
})();
