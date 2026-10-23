// Sitemaker.nl — de "laat zien wat we kunnen"-onderdelen: bouwanimatie in de hero,
// de demo "Zie je eigen website" en de portaal-demo. Alles is voorbeeld; geen echte klanten.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

  const ICONEN = {
    kapper: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    installateur: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/>',
    fysio: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    hovenier: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.2-6.1"/>',
    advies: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    schilder: '<rect x="3" y="3" width="15" height="6" rx="1"/><path d="M18 6h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONEN[k]}</svg>`;

  const BRANCHES = {
    kapper: { kort: "Jouw haar, onze aandacht", label: "Kapsalon", voorbeeld: "Kapsalon Lina", kop: (n) => `Jouw haar, onze aandacht bij ${n}`, sub: "Knippen, kleuren en stylen in een ontspannen salon. Plan je afspraak online, wanneer het jou uitkomt.", cta: "Afspraak maken", diensten: [["Knippen", "Dames, heren en kinderen"], ["Kleuren", "Van subtiel tot opvallend"], ["Styling", "Voor elke gelegenheid"]], stijl: "warm" },
    installateur: { kort: "Storing? Wij staan klaar", label: "Installateur", voorbeeld: "Installatiebedrijf De Vries", kop: (n) => `Storing of onderhoud? ${n} staat voor je klaar`, sub: "Cv-ketels, warmtepompen en loodgieterswerk in de regio. Vraag direct een offerte aan.", cta: "Offerte aanvragen", diensten: [["Cv-onderhoud", "Jaarlijks of bij storing"], ["Warmtepompen", "Advies en installatie"], ["Loodgieterswerk", "Lekkages en leidingen"]], stijl: "fris" },
    fysio: { kort: "Weer pijnvrij bewegen", label: "Fysiotherapie", voorbeeld: "Fysio Centrum Oost", kop: (n) => `Weer pijnvrij bewegen met ${n}`, sub: "Fysiotherapie en sportrevalidatie bij jou in de buurt. Plan je eerste afspraak online.", cta: "Afspraak plannen", diensten: [["Fysiotherapie", "Klachten aan rug, nek en gewrichten"], ["Sportrevalidatie", "Sterker terug na een blessure"], ["Dry needling", "Gerichte behandeling van spieren"]], stijl: "fris" },
    hovenier: { kort: "Een tuin om van te genieten", label: "Hovenier", voorbeeld: "Hoveniersbedrijf Groen", kop: (n) => `Een tuin om van te genieten, door ${n}`, sub: "Ontwerp, aanleg en onderhoud van tuinen. Vraag vrijblijvend advies aan.", cta: "Advies aanvragen", diensten: [["Tuinontwerp", "Een plan dat bij je past"], ["Aanleg", "Bestrating, beplanting en meer"], ["Onderhoud", "Het hele jaar verzorgd"]], stijl: "natuur" },
    advies: { kort: "Helder advies voor ondernemers", label: "Adviesbureau", voorbeeld: "Bureau Jansen", kop: (n) => `${n}: helder advies voor ondernemers`, sub: "Administratie, belastingen en financieel advies. Zodat jij kunt doen waar je goed in bent.", cta: "Kennismaken", diensten: [["Boekhouding", "Overzicht zonder gedoe"], ["Belastingaangifte", "Op tijd en correct"], ["Advies", "Bij elke belangrijke keuze"]], stijl: "krachtig" },
    schilder: { kort: "Strak schilderwerk, op tijd klaar", label: "Schilder", voorbeeld: "Schildersbedrijf Bakker", kop: (n) => `Strak schilderwerk door ${n}`, sub: "Binnen- en buitenschilderwerk, vakkundig en op tijd. Vraag een offerte aan.", cta: "Offerte aanvragen", diensten: [["Binnen", "Muren, plafonds en kozijnen"], ["Buiten", "Gevels en houtwerk"], ["Behangen", "Strak en naadloos"]], stijl: "warm" },
  };
  const STIJLEN = {
    fris: { label: "Fris", p: "#0A4F66", a: "#0CC0DF", bg: "#F2FBFE" },
    warm: { label: "Warm", p: "#6B2A12", a: "#F4A261", bg: "#FFF7F0" },
    krachtig: { label: "Krachtig", p: "#1C0747", a: "#FF5757", bg: "#F6F5FB" },
    natuur: { label: "Natuur", p: "#1F4D33", a: "#95C98A", bg: "#F3F8F1" },
  };
  const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 28) || "jouwbedrijf";
  const zetKleuren = (el, st) => { el.style.setProperty("--p", st.p); el.style.setProperty("--a", st.a); el.style.setProperty("--bg", st.bg); };

  // ------------------------------------------------ hero: website opbouwen met designcursor
  const bouw = $(".bouw"), site = $("#bouw-site");
  if (bouw && site) {
    const cursor = document.createElement("div");
    cursor.className = "cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7Z" fill="#FF5757" stroke="#1C0747" stroke-width="1.5" stroke-linejoin="round"/></svg><span>Sitemaker</span>';
    const sel = document.createElement("div");
    sel.className = "selectie";
    sel.innerHTML = "<i></i><i></i><i></i><i></i><b></b>";
    bouw.append(sel, cursor);
    const melding = $("#bouw-melding");
    const delen = [...site.children];
    const namen = ["Navigatie", "Hero met knop", "Diensten"];
    const volgorde = ["kapper", "installateur", "hovenier", "fysio", "schilder", "advies"];
    let i = 0;
    const rel = (el) => { const a = el.getBoundingClientRect(), b = bouw.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };
    const vul = (k) => {
      const b = BRANCHES[k], st = STIJLEN[b.stijl];
      zetKleuren(site, st);
      $("#bouw-naam").textContent = b.voorbeeld;
      $("#bouw-url").textContent = slug(b.voorbeeld);
      $("#bouw-kop").textContent = b.kort;
      $("#bouw-knop").textContent = b.cta;
      $("#bouw-cta").textContent = b.cta;
      $("#bouw-beeld").innerHTML = svg(k);
    };
    const ronde = async () => {
      const k = volgorde[i++ % volgorde.length];
      melding.classList.remove("in");
      site.classList.add("bezig");
      delen.forEach((d) => d.classList.remove("in"));
      await wacht(450);
      vul(k);
      for (let n = 0; n < delen.length; n++) {
        const d = delen[n];
        d.classList.add("in");
        await wacht(80);
        const r = rel(d);
        sel.style.cssText = `left:${r.x - 4}px;top:${r.y - 4}px;width:${r.w + 8}px;height:${r.h + 8}px`;
        sel.querySelector("b").textContent = namen[n];
        sel.classList.add("in");
        cursor.style.transform = `translate(${r.x + r.w * 0.72}px, ${r.y + r.h * 0.6}px)`;
        await wacht(900);
      }
      sel.classList.remove("in");
      const cta = rel($("#bouw-cta"));
      cursor.style.transform = `translate(${cta.x + cta.w / 2}px, ${cta.y + cta.h / 2}px)`;
      await wacht(700);
      melding.classList.add("in");
      await wacht(3200);
    };
    if (rustig) { vul("kapper"); }
    else {
      let actief = true;
      new IntersectionObserver(([e]) => { actief = e.isIntersecting; }).observe(bouw);
      (async () => { cursor.style.transform = "translate(70%, 80%)"; for (;;) { if (actief && !document.hidden) await ronde(); else await wacht(600); } })();
    }
  }

  // ------------------------------------------------ demo: zie je eigen website
  const demo = $("#demo-form");
  if (demo) {
    const st = { branche: "kapper", stijl: "warm", apparaat: "desktop" };
    const vs = $("#d-site"), app = $("#d-apparaat"), naamIn = $("#d-naam");
    const chip = (attr, k, label, extra = "") => `<button type="button" data-${attr}="${k}" aria-pressed="false">${extra}${label}</button>`;
    $("#d-branches").innerHTML = Object.entries(BRANCHES).map(([k, b]) => chip("branche", k, b.label)).join("");
    $("#d-stijlen").innerHTML = Object.entries(STIJLEN).map(([k, s]) => chip("stijl", k, s.label, `<span class="staal" style="background:${s.a};box-shadow:inset 0 0 0 4px ${s.p}"></span>`)).join("");
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const teken = (anim) => {
      const b = BRANCHES[st.branche], s = STIJLEN[st.stijl];
      const naam = naamIn.value.trim() || b.voorbeeld;
      zetKleuren(vs, s);
      $("#d-naamkop").textContent = naam;
      $("#d-url").textContent = slug(naam);
      $("#d-kop").textContent = b.kop(naam);
      $("#d-sub").textContent = b.sub;
      $("#d-knop").textContent = b.cta; $("#d-cta").textContent = b.cta; $("#d-cta2").textContent = b.cta;
      $("#d-icoon").innerHTML = svg(st.branche); $("#d-beeld").innerHTML = svg(st.branche);
      $("#d-diensten").innerHTML = b.diensten.map(([t, o]) => `<div class="vs-dienst"><i></i><b>${esc(t)}</b><span>${esc(o)}</span></div>`).join("");
      demo.querySelectorAll("[data-branche]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.branche === st.branche)));
      demo.querySelectorAll("[data-stijl]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.stijl === st.stijl)));
      demo.querySelectorAll("[data-apparaat]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.apparaat === st.apparaat)));
      app.className = "apparaat " + st.apparaat;
      if (anim && !rustig) { vs.classList.remove("wissel"); void vs.offsetWidth; vs.classList.add("wissel"); }
    };
    demo.addEventListener("submit", (e) => e.preventDefault());
    demo.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.branche) { st.branche = b.dataset.branche; st.stijl = BRANCHES[st.branche].stijl; teken(true); }
      if (b.dataset.stijl) { st.stijl = b.dataset.stijl; teken(true); }
      if (b.dataset.apparaat) { st.apparaat = b.dataset.apparaat; teken(false); }
    });
    naamIn.addEventListener("input", () => teken(false));
    $("#demo-cta").addEventListener("click", () => {
      const f = $("#aanvraag"); if (!f) return;
      const naam = naamIn.value.trim();
      if (naam && !f.elements.company.value) f.elements.company.value = naam;
      if (!f.elements.message.value) f.elements.message.value = `Ik heb interesse in een website voor mijn ${BRANCHES[st.branche].label.toLowerCase()} (stijl: ${STIJLEN[st.stijl].label.toLowerCase()}).`;
    });
    teken(false);
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
})();
