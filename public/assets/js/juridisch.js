// Bedrijfsgegevens in de voorwaarden en privacyverklaring, en de cookiebanner.
// De banner verschijnt alleen als er tracking is ingesteld (Meta Pixel-ID in HQ); zonder tracking zijn er alleen noodzakelijke cookies.
(() => {
  const KEY = "sm_cookies";
  const lees = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const zet = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
  let info = null;

  function vul(d) {
    const naam = d.rechtsvorm || d.naam || "Sitemaker";
    const volledig = [naam + (d.rechtsvorm && d.naam && d.rechtsvorm !== d.naam ? ` (handelsnaam ${d.naam})` : ""), d.adres, d.kvk ? `KvK ${d.kvk}` : "", d.btw ? `btw ${d.btw}` : ""].filter(Boolean).join(", ");
    const waarden = {
      volledig, email: d.email || "info@sitemaker.nl", conceptdagen: String(d.conceptDagen || 60),
      btwzin: d.pricesIncludeVat === false ? "De genoemde bedragen zijn exclusief btw." : d.pricesIncludeVat === true ? "De genoemde bedragen zijn inclusief btw." : "Op je factuur staat hoe de btw is verwerkt.",
    };
    document.querySelectorAll("[data-bedrijf]").forEach((el) => {
      const k = el.dataset.bedrijf; if (!(k in waarden)) return;
      if (k === "email") { const a = document.createElement("a"); a.href = "mailto:" + waarden.email; a.textContent = waarden.email; el.replaceChildren(a); }
      else el.textContent = waarden[k];
    });
  }

  function laadPixel(id) {
    if (window.fbq || !/^\d{5,20}$/.test(id)) return;
    const n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
    window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(s);
    window.fbq("init", id); window.fbq("track", "PageView");
  }

  function banner(force) {
    if (!info?.metaPixelId) {
      if (!force) return;
      document.querySelector(".cookiebanner")?.remove();
      const m = document.createElement("div"); m.className = "cookiebanner"; m.setAttribute("role", "status");
      m.innerHTML = '<p><b>Cookies</b> Deze website gebruikt alleen noodzakelijke cookies. Er is niets om in te stellen.</p><div class="cb-knoppen"><button type="button" class="knop knop-rand">Sluiten</button></div>';
      m.querySelector("button").onclick = () => m.remove(); document.body.appendChild(m); return;
    }
    const keuze = lees();
    if (keuze === "ja") laadPixel(info.metaPixelId);
    if (keuze && !force) return;
    document.querySelector(".cookiebanner")?.remove();
    const b = document.createElement("div");
    b.className = "cookiebanner"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Cookies");
    b.innerHTML = '<p><b>Cookies</b> We gebruiken noodzakelijke cookies om de site te laten werken. Met je toestemming gebruiken we ook cookies van Meta om onze advertenties te meten. <a href="/privacy.html">Meer lezen</a></p><div class="cb-knoppen"><button type="button" class="knop knop-actie" data-cb="ja">Akkoord</button><button type="button" class="knop knop-rand" data-cb="nee">Alleen noodzakelijk</button></div>';
    b.addEventListener("click", (e) => {
      const k = e.target.closest("[data-cb]"); if (!k) return;
      zet(k.dataset.cb); b.remove();
      if (k.dataset.cb === "ja") laadPixel(info.metaPixelId);
      else if (window.fbq) location.reload();
    });
    document.body.appendChild(b);
    b.querySelector("[data-cb=ja]").focus({ preventScroll: true });
  }

  document.addEventListener("click", (e) => { if (e.target.closest("[data-cookies]")) { e.preventDefault(); banner(true); } });
  fetch("/api/bedrijf").then((r) => (r.ok ? r.json() : null)).then((d) => { if (!d) return; info = d; vul(d); banner(false); }).catch(() => {});
})();
