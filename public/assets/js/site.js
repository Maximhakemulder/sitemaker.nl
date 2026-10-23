// Sitemaker.nl — menu, aanvraagformulier en de vaste knop op mobiel.
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

  // Vaste knop onderin verbergen zodra het formulier in beeld is
  const cta = $("#mobiel-cta"), vak = $("#kennismaking");
  if (cta && vak && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => cta.classList.toggle("weg", e.isIntersecting), { threshold: 0.1 }).observe(vak);
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
    data.t = geopend;
    try {
      const r = await fetch("/api/aanvraag", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify(data) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (res.errors) { Object.entries(res.errors).forEach(([k, v]) => zetFout(k, v)); form.elements[Object.keys(res.errors)[0]]?.focus(); }
        else { algemeen.textContent = res.error || "Versturen lukte niet. Probeer het opnieuw of mail ons op info@sitemaker.nl."; algemeen.hidden = false; algemeen.focus?.(); }
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
