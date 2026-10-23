// Sitemaker.nl — showcase in de hero, portaal-demo en de foto bij "Voor wie".
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------ showcase: voorbeeldsites schuiven als kaarten door
  const sc = $("#showcase");
  if (sc && !rustig) {
    const kaarten = [...sc.querySelectorAll(".ls")];
    const melding = $("#sc-melding");
    let volgorde = kaarten.slice(), zichtbaar = true;
    new IntersectionObserver(([e]) => { zichtbaar = e.isIntersecting; }).observe(sc);
    const zet = () => volgorde.forEach((k, i) => { k.classList.remove("s0", "s1", "s2", "s3", "weg"); k.classList.add("s" + Math.min(i, 3)); });
    (async () => {
      await wacht(1600);
      for (;;) {
        if (!zichtbaar || document.hidden) { await wacht(700); continue; }
        melding.classList.add("in");
        await wacht(2600);
        melding.classList.remove("in");
        await wacht(400);
        const voor = volgorde.shift();
        voor.classList.remove("s0"); voor.classList.add("weg");
        volgorde.push(voor);
        volgorde.slice(0, -1).forEach((k, i) => { k.classList.remove("s0", "s1", "s2", "s3"); k.classList.add("s" + Math.min(i, 3)); });
        await wacht(900);
        voor.classList.remove("weg"); voor.classList.add("s3");
        await wacht(1400);
      }
    })();
    zet();
  }

  // ------------------------------------------------ portaal-demo
  const pdKnop = $("#pd-knop");
  if (pdKnop) {
    const blokken = [...document.querySelectorAll("#pd-teller span")];
    const over = $("#pd-over"), wijz = $("#pd-wijziging"), stappen = [...document.querySelectorAll("#pd-status li")];
    let gebruikt = 1, bezig = false;
    pdKnop.addEventListener("click", async () => {
      if (bezig) return;
      if (gebruikt >= 4) { gebruikt = 1; blokken.forEach((b, n) => b.classList.toggle("vol", n < 1)); over.textContent = "Nog 3 van 4 over"; wijz.hidden = true; pdKnop.textContent = "Probeer: geef een wijziging door"; return; }
      bezig = true; pdKnop.disabled = true;
      const blok = blokken[gebruikt++];
      blok.classList.add("vol", "nieuw"); setTimeout(() => blok.classList.remove("nieuw"), 300);
      over.textContent = gebruikt < 4 ? `Nog ${4 - gebruikt} van 4 over` : "Alle 4 gebruikt deze maand";
      wijz.hidden = false; stappen.forEach((s) => s.classList.remove("aan", "klaar"));
      stappen[0].classList.add("aan"); await wacht(rustig ? 0 : 900);
      stappen[1].classList.add("aan"); await wacht(rustig ? 0 : 1100);
      stappen.forEach((s) => s.classList.add("klaar"));
      pdKnop.disabled = false; bezig = false;
      pdKnop.textContent = gebruikt >= 4 ? "Opnieuw beginnen" : "Nog een wijziging doorgeven";
    });
  }

  // ------------------------------------------------ foto bij "Voor wie": tonen zodra /assets/img/mkb.jpg bestaat
  const img = $("#voorwie-foto img");
  if (img) {
    const toon = () => { img.hidden = false; $("#voorwie-foto .foto-illustratie")?.remove(); };
    if (img.complete && img.naturalWidth) toon(); else img.addEventListener("load", toon, { once: true });
  }
})();
