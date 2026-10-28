// Landingspagina voor advertenties (/start): vaste knop onderin op mobiel en meetpunten voor Meta (alleen na cookie-akkoord geladen).
(() => {
  const cta = document.getElementById("landing-cta"), hero = document.querySelector(".hero"), keuzes = document.getElementById("keuzes");
  if (cta && "IntersectionObserver" in window) {
    if (hero) new IntersectionObserver(([e]) => cta.classList.toggle("zichtbaar", !e.isIntersecting), { threshold: 0 }).observe(hero);
    if (keuzes) new IntersectionObserver(([e]) => cta.classList.toggle("weg", e.isIntersecting), { threshold: 0.05 }).observe(keuzes);
  }
  const meet = (...a) => { try { window.fbq && window.fbq(...a); } catch {} };
  document.querySelectorAll(".optie").forEach((b) => b.addEventListener("click", () => meet("trackCustom", "KeuzeGekozen", { keuze: b.dataset.keuze })));
})();
