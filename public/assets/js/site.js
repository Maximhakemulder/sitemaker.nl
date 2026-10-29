// Sitemaker.nl — menu, kennismaking boeken, aanvraagformulier en de vaste knop op mobiel.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const jaar = $("#jaar"); if (jaar) jaar.textContent = new Date().getFullYear();

  // Menu op mobiel
  const knop = $(".menuknop"), menu = $("#menu");
  knop?.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    knop.setAttribute("aria-expanded", String(open));
    knop.setAttribute("aria-label", open ? "Menu sluiten" : "Menu openen");
  });
  menu?.addEventListener("click", (e) => { if (e.target.closest("a")) { menu.classList.remove("open"); knop?.setAttribute("aria-expanded", "false"); } });

  // Vaste knop onderin: pas tonen na de hero, en weg zodra het formulier in beeld is
  const cta = $("#mobiel-cta"), vak = $("#kennismaking"), hero = $(".hero");
  if (cta && "IntersectionObserver" in window) {
    if (hero) new IntersectionObserver(([e]) => cta.classList.toggle("zichtbaar", !e.isIntersecting), { threshold: 0 }).observe(hero);
    if (vak) new IntersectionObserver(([e]) => cta.classList.toggle("weg", e.isIntersecting), { threshold: 0.05 }).observe(vak);
  }

  // Komt de bezoeker van een concept-website? Dan koppelen we de afspraak aan dat concept en vullen we de bedrijfsnaam in.
  const qs = new URLSearchParams(location.search);
  const conceptToken = /^[\w-]{8,40}$/.test(qs.get("concept") || "") ? qs.get("concept") : "";
  const bedrijfNaam = (qs.get("bedrijf") || "").slice(0, 120);
  if (bedrijfNaam) document.querySelectorAll('input[name="company"]').forEach((i) => { if (!i.value) i.value = bedrijfNaam; });
  // De keuzekaarten nemen het concept mee naar /interesse.
  if (conceptToken) document.querySelectorAll("[data-keuze-link]").forEach((a) => { const u = new URL(a.href); u.searchParams.set("concept", conceptToken); if (bedrijfNaam) u.searchParams.set("bedrijf", bedrijfNaam); a.href = u.pathname + u.search; });

  // ------------------------------------------------ Kennismaking boeken
  const boeken = $("#boeken"), aanvraagForm = $("#aanvraag");
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toonAanvraag = (terugKnop) => { if (boeken) boeken.hidden = true; if (aanvraagForm) aanvraagForm.hidden = false; const t = $("#b-terug"); if (t) t.hidden = !terugKnop; };
  if (boeken && aanvraagForm && "fetch" in window) {
    let data = null, dag = null, gekozen = null;
    const geopendB = Date.now();
    const dagen = $("#b-dagen"), tijden = $("#b-tijden"), kies = $("#b-kies"), gegevens = $("#b-gegevens"), klaar = $("#b-klaar"), bform = $("#boek-form"), bfout = $("#b-fout");
    const kort = (date, opt) => new Date(date + "T12:00:00").toLocaleDateString("nl-NL", opt);
    const toonDagen = () => {
      dagen.innerHTML = data.days.map((d) => `<button type="button" class="b-dag" data-dag="${d.date}" aria-pressed="${d.date === dag}" aria-label="${esc(d.label)}"><small>${kort(d.date, { weekday: "short" })}</small><b>${kort(d.date, { day: "numeric" })}</b><small>${kort(d.date, { month: "short" })}</small></button>`).join("");
    };
    const toonTijden = () => {
      const d = data.days.find((x) => x.date === dag);
      $("#b-tijdkop").textContent = d ? d.label.charAt(0).toUpperCase() + d.label.slice(1) : "";
      tijden.innerHTML = d ? d.times.map((t) => `<button type="button" class="b-tijd" data-start="${t.start}" aria-label="${esc(d.label)} om ${t.tijd}">${t.tijd}</button>`).join("") : "";
    };
    const laad = async (houdDag) => {
      const r = await fetch("/api/agenda/slots", { headers: { accept: "application/json" } });
      data = await r.json();
      if (!r.ok || !data.actief || !data.days.length) { toonAanvraag(false); return false; }
      if (!houdDag || !data.days.some((d) => d.date === dag)) dag = data.days[0].date;
      if (data.soort === "video") $("#b-sub").textContent = "Videogesprek: samen online je website bespreken.";
      else $("#b-sub").textContent = `Telefonisch, ${data.duur} minuten. Wij bellen jou.`;
      toonDagen(); toonTijden();
      boeken.hidden = false; aanvraagForm.hidden = true;
      return true;
    };
    laad().catch(() => toonAanvraag(false));
    dagen.addEventListener("click", (e) => { const b = e.target.closest("[data-dag]"); if (!b) return; dag = b.dataset.dag; toonDagen(); toonTijden(); });
    tijden.addEventListener("click", (e) => {
      const b = e.target.closest("[data-start]"); if (!b) return;
      const d = data.days.find((x) => x.date === dag);
      gekozen = { start: b.dataset.start, tijd: b.textContent, label: d.label };
      const eind = new Date(Date.parse(gekozen.start) + data.duur * 60000).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
      $("#b-dag").textContent = d.label.charAt(0).toUpperCase() + d.label.slice(1);
      $("#b-tijd").textContent = `${gekozen.tijd} – ${eind}`;
      kies.hidden = true; gegevens.hidden = false;
      bform.elements.name.focus();
    });
    $("#b-wijzig").addEventListener("click", () => { gegevens.hidden = true; kies.hidden = false; $(`[data-start="${gekozen?.start}"]`)?.focus(); });
    $("#b-liever").addEventListener("click", () => { toonAanvraag(true); aanvraagForm.elements.name.focus(); });
    $("#b-zelf")?.addEventListener("click", () => { boeken.hidden = false; aanvraagForm.hidden = true; });
    const bzet = (k, t) => { const el = $("#be-" + k), inp = bform.elements[k]; if (el) el.textContent = t || ""; if (inp) inp.setAttribute("aria-invalid", t ? "true" : "false"); };
    bform.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") bzet(e.target.name, ""); });
    bform.addEventListener("submit", async (e) => {
      e.preventDefault(); bfout.hidden = true;
      ["name", "company", "email", "phone"].forEach((k) => bzet(k, ""));
      const f = bform.elements, fouten = {};
      if (f.name.value.trim().length < 2) fouten.name = "Vul je naam in.";
      if (f.company.value.trim().length < 2) fouten.company = "Vul de naam van je bedrijf in.";
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.value.trim())) fouten.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
      if (!/^[+()\d\s-]{8,20}$/.test(f.phone.value.trim())) fouten.phone = "Vul je telefoonnummer in, dan bellen we je.";
      if (Object.keys(fouten).length) { Object.entries(fouten).forEach(([k, v]) => bzet(k, v)); f[Object.keys(fouten)[0]].focus(); return; }
      const knop = bform.querySelector("[type=submit]"); knop.disabled = true; knop.textContent = "Bezig…";
      try {
        const r = await fetch("/api/agenda/boek", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify({ ...Object.fromEntries(new FormData(bform)), start: gekozen.start, t: geopendB, concept: conceptToken }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (res.errors) { Object.entries(res.errors).forEach(([k, v]) => bzet(k, v)); f[Object.keys(res.errors)[0]]?.focus(); }
          else if (res.slotGone) { await laad(true); gegevens.hidden = true; kies.hidden = false; bfout.hidden = true; const m = document.createElement("div"); m.className = "melding melding-fout"; m.setAttribute("role", "alert"); m.textContent = res.error; kies.prepend(m); setTimeout(() => m.remove(), 8000); }
          else { bfout.textContent = res.error || "Dat lukte niet. Probeer het opnieuw of mail ons op hallo@sitemaker.nl."; bfout.hidden = false; bfout.focus(); }
          return;
        }
        gegevens.hidden = true; $("#b-alt").hidden = true;
        klaar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>
          <h3>Je afspraak staat vast</h3><p><b>${esc((res.wanneer || "").charAt(0).toUpperCase() + (res.wanneer || "").slice(1))}</b><br>${esc((res.hoe || "").charAt(0).toUpperCase() + (res.hoe || "").slice(1))}.</p>
          <p>Je krijgt een bevestiging per mail, met een link om te annuleren als het toch niet uitkomt.</p>
          <div class="b-acties">${res.token ? `<a class="knop knop-rand" href="/api/agenda/ics?t=${encodeURIComponent(res.token)}">Zet in je agenda</a>` : ""}</div>`;
        klaar.hidden = false; klaar.focus();
      } catch {
        bfout.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw."; bfout.hidden = false;
      } finally { knop.disabled = false; knop.textContent = "Afspraak bevestigen"; }
    });
  }

  // Aanvraagformulier
  const form = $("#aanvraag");
  if (!form) return;
  const geopend = Date.now();
  const algemeen = $("#form-fout");
  const velden = { name: "naam", company: "bedrijf", email: "email", phone: "tel" };
  const zetFout = (naam, tekst) => {
    const id = velden[naam]; if (!id) return;
    const input = form.elements[naam], el = $("#e-" + id);
    if (el) el.textContent = tekst || "";
    if (input) input.setAttribute("aria-invalid", tekst ? "true" : "false");
  };
  const controleer = () => {
    const f = form.elements, fouten = {};
    if (f.name.value.trim().length < 2) fouten.name = "Vul je naam in.";
    if (f.company.value.trim().length < 2) fouten.company = "Vul de naam van je bedrijf in.";
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email.value.trim())) fouten.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
    if (f.preference.value === "bellen" && !f.phone.value.trim()) fouten.phone = "Vul je telefoonnummer in, dan bellen we je.";
    return fouten;
  };
  form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") zetFout(e.target.name, ""); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    algemeen.hidden = true;
    Object.keys(velden).forEach((k) => zetFout(k, ""));
    const fouten = controleer();
    if (Object.keys(fouten).length) {
      Object.entries(fouten).forEach(([k, v]) => zetFout(k, v));
      form.elements[Object.keys(fouten)[0]].focus();
      return;
    }
    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true; knop.textContent = "Bezig met versturen…";
    const data = Object.fromEntries(new FormData(form));
    data.t = geopend; data.concept = conceptToken;
    try {
      const r = await fetch("/api/aanvraag", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify(data) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (res.errors) { Object.entries(res.errors).forEach(([k, v]) => zetFout(k, v)); form.elements[Object.keys(res.errors)[0]]?.focus(); }
        else { algemeen.textContent = res.error || "Versturen lukte niet. Probeer het opnieuw of mail ons op hallo@sitemaker.nl."; algemeen.hidden = false; algemeen.focus?.(); }
        return;
      }
      const vakje = $("#formulier-vak");
      vakje.innerHTML = "";
      const div = document.createElement("div");
      div.className = "bedankt"; div.setAttribute("role", "status"); div.tabIndex = -1;
      div.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><h3>Bedankt, we hebben je aanvraag</h3><p>We nemen zo snel mogelijk contact met je op om een moment af te spreken. Je krijgt ook een bevestiging per mail.</p>';
      vakje.appendChild(div); div.focus();
    } catch {
      algemeen.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw.";
      algemeen.hidden = false;
    } finally {
      knop.disabled = false; knop.textContent = "Plan een kennismaking";
    }
  });
})();
