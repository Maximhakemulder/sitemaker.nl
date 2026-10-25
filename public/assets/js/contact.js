// Contactformulier (/contact): controleren, versturen naar /api/contact en een bedankje tonen.
(() => {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const geopend = Date.now();
  const algemeen = document.getElementById("c-fout");
  const velden = ["naam", "email", "telefoon", "bericht"];
  const zetFout = (k, tekst) => {
    const el = document.getElementById("ce-" + k), input = form.elements[k];
    if (el) el.textContent = tekst;
    if (input) input.setAttribute("aria-invalid", tekst ? "true" : "false");
  };
  const controleer = () => {
    const d = Object.fromEntries(new FormData(form)), f = {};
    if ((d.naam || "").trim().length < 2) f.naam = "Vul je naam in.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || "").trim())) f.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
    if (d.telefoon && !/^[+()\d\s-]{8,20}$/.test(d.telefoon.trim())) f.telefoon = "Dit telefoonnummer klopt niet. Laat het leeg als je liever gemaild wordt.";
    if ((d.bericht || "").trim().length < 10) f.bericht = "Schrijf je bericht in een paar woorden.";
    return f;
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    algemeen.hidden = true;
    velden.forEach((k) => zetFout(k, ""));
    const fouten = controleer();
    if (Object.keys(fouten).length) {
      Object.entries(fouten).forEach(([k, v]) => zetFout(k, v));
      form.elements[Object.keys(fouten)[0]].focus();
      return;
    }
    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true; knop.textContent = "Bezig met versturen…";
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), t: geopend }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (res.errors) { Object.entries(res.errors).forEach(([k, v]) => zetFout(k, v)); form.elements[Object.keys(res.errors)[0]]?.focus(); }
        else { algemeen.textContent = res.error || "Versturen lukte niet. Probeer het opnieuw of mail ons direct."; algemeen.hidden = false; algemeen.focus(); }
        return;
      }
      const vak = document.getElementById("contact-vak");
      const div = document.createElement("div");
      div.className = "bedankt"; div.setAttribute("role", "status"); div.tabIndex = -1;
      div.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg><h3>Bedankt, je bericht is verstuurd</h3><p>We lezen het zo snel mogelijk en reageren per mail.</p>';
      vak.replaceChildren(div); div.focus();
    } catch {
      algemeen.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw.";
      algemeen.hidden = false;
    } finally {
      knop.disabled = false; knop.textContent = "Verstuur bericht";
    }
  });
})();
