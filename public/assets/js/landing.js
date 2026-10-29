// Landingspagina /start (Meta-ads): vaste startbalk op mobiel, reviewscore bovenin, voorbeelden die vanzelf doorschuiven.
(() => {
  const $ = (s) => document.querySelector(s);
  const meet = (...a) => { try { window.fbq && window.fbq(...a); } catch {} };
  const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Startbalk onderin: zichtbaar zodra het formulier uit beeld is.
  const balk = $("#landing-cta"), kaart = $("#keuzes");
  if (balk && kaart && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => balk.classList.toggle("zichtbaar", !e.isIntersecting), { threshold: 0 }).observe(kaart);
  }

  // Reviewscore bovenin (alleen echte, gepubliceerde reviews).
  const score = $("#lp-score");
  if (score) fetch("/api/reviews").then((r) => r.json()).then((d) => {
    if (!d?.count) return;
    const gem = Number(d.average).toFixed(1).replace(".", ",");
    score.innerHTML = `<span class="lp-sterren" aria-hidden="true">★★★★★</span><b>${gem}</b><span>· ${d.count} ${d.count === 1 ? "review" : "reviews"}</span>`;
    score.setAttribute("aria-label", `Gemiddeld ${gem} uit 5, ${d.count} reviews`);
    score.hidden = false;
  }).catch(() => {});

  // Voorbeelden: doorlopende band die langzaam blijft schuiven (de reeks staat er twee keer in, zodat hij naadloos rondgaat).
  const rail = $("#lp-rail");
  if (rail && !rustig) {
    [...rail.children].forEach((li) => { const k = li.cloneNode(true); k.setAttribute("aria-hidden", "true"); k.querySelector("img")?.setAttribute("alt", ""); rail.appendChild(k); });
    rail.classList.add("loopt");
  }

  // Gratis ontwerp aanvragen. Zonder website vragen we één ding: wat doe je en waar.
  const of = $("#ontwerp-form"), geopend = Date.now();
  if (of) {
    const site = $("#o-site"), watVeld = $("#o-wat-veld");
    const toonWat = () => { watVeld.hidden = site.value.trim().length > 3; };
    site.addEventListener("input", toonWat); toonWat();
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fouten = (errors) => {
      of.querySelectorAll(".fout").forEach((el) => (el.textContent = ""));
      of.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
      for (const [k, v] of Object.entries(errors || {})) { const el = $(`#oe-${k}`), input = of.elements[k]; if (el) el.textContent = v; if (input) input.setAttribute("aria-invalid", "true"); }
      const eerste = Object.keys(errors || {})[0]; if (eerste && of.elements[eerste]) of.elements[eerste].focus();
    };
    of.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fout = $("#o-fout"); fout.hidden = true;
      const d = Object.fromEntries(new FormData(of)), err = {};
      if ((d.naam || "").trim().length < 2) err.naam = "Vul je naam in.";
      if ((d.bedrijf || "").trim().length < 2) err.bedrijf = "Vul de naam van je bedrijf in.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || "").trim())) err.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
      if ((d.site || "").trim().length <= 3 && (d.wat || "").trim().length < 4) err.wat = "Vertel kort wat je doet en waar, bijvoorbeeld: schilder in Breda.";
      if (Object.keys(err).length) return fouten(err);
      const knop = of.querySelector("[type=submit]"), label = knop.textContent; knop.disabled = true; knop.textContent = "Bezig…";
      try {
        const r = await fetch("/api/start/ontwerp", { method: "POST", headers: { "content-type": "application/json", "x-sm": "1" }, body: JSON.stringify({ ...d, t: geopend }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) { if (res.errors) fouten(res.errors); else { fout.textContent = res.error || "Dat lukte niet. Probeer het opnieuw."; fout.hidden = false; fout.focus(); } return; }
        meet("track", "Lead", { content_name: "gratis ontwerp" });
        const vak = $("#vak-start"), div = document.createElement("div");
        div.className = "bedankt"; div.setAttribute("role", "status"); div.tabIndex = -1;
        div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>`
          + (res.klant ? `<h3>Je bent al klant</h3><p>Log in op je portaal om wijzigingen door te geven.</p>`
          : res.klaar ? `<h3>Je ontwerp staat al klaar</h3><p>We hebben het zojuist opnieuw gemaild naar <b>${esc(d.email)}</b>.</p>`
          : `<h3>Gelukt, we gaan aan de slag</h3><p>Binnen 24 uur staat je gratis ontwerp in je mail op <b>${esc(d.email)}</b>. Je krijgt nu al een bevestiging.</p>`);
        vak.replaceChildren(div); div.focus();
      } catch { fout.textContent = "Er is geen verbinding. Controleer je internet en probeer het opnieuw."; fout.hidden = false; }
      finally { knop.disabled = false; knop.textContent = label; }
    });
  }

  // Meta: welke keuze iemand aanklikt (alleen als de pixel na cookie-akkoord geladen is).
  document.querySelectorAll(".optie").forEach((b) => b.addEventListener("click", () => meet("trackCustom", "KeuzeGekozen", { keuze: b.dataset.keuze })));
})();
