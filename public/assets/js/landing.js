// Landingspagina /start (Meta-ads): vaste startbalk op mobiel, reviewscore bovenin, voorbeelden die vanzelf doorschuiven.
(() => {
  const $ = (s) => document.querySelector(s);
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

  // Voorbeelden schuiven vanzelf door tot iemand zelf veegt.
  const rail = $("#lp-rail");
  if (rail && !rustig) {
    let zelf = false, zichtbaar = false;
    ["pointerdown", "touchstart", "wheel", "keydown"].forEach((t) => rail.addEventListener(t, () => (zelf = true), { passive: true }));
    new IntersectionObserver(([e]) => (zichtbaar = e.isIntersecting), { threshold: 0.4 }).observe(rail);
    setInterval(() => {
      if (zelf || !zichtbaar || document.hidden) return;
      const stap = rail.querySelector("li")?.getBoundingClientRect().width + 14 || 200;
      const eind = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
      rail.scrollTo({ left: eind ? 0 : rail.scrollLeft + stap, behavior: "smooth" });
    }, 2600);
  }

  // Meta: welke keuze iemand aanklikt (alleen als de pixel na cookie-akkoord geladen is).
  const meet = (...a) => { try { window.fbq && window.fbq(...a); } catch {} };
  document.querySelectorAll(".optie").forEach((b) => b.addEventListener("click", () => meet("trackCustom", "KeuzeGekozen", { keuze: b.dataset.keuze })));
})();
