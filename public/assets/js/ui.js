// Gedeelde hulpjes voor het klantenportaal en HQ. Geen inline scripts of styles (strikte CSP).
(() => {
  const SM = (window.SM = {});

  // ------------------------------------------------ veilige HTML
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  SM.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  SM.raw = (s) => new Raw(s);
  // html`<p>${tekst}</p>`: alles wordt ge-escaped, behalve SM.raw(...) en lijsten daarvan.
  SM.html = (strings, ...vals) => SM.raw(strings.reduce((out, str, i) => {
    let v = vals[i - 1];
    const f = (x) => (x instanceof Raw ? x.s : x === false || x == null ? "" : SM.esc(x));
    v = Array.isArray(v) ? v.map(f).join("") : f(v);
    return out + v + str;
  }));
  SM.render = (el, content) => { el.innerHTML = String(content); };

  // ------------------------------------------------ opmaak
  SM.euro = (c) => "€" + (Number(c || 0) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const d = (v) => (v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v) : null);
  SM.datum = (v) => (v ? d(v).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "–");
  SM.datumLang = (v) => (v ? d(v).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "–");
  SM.tijd = (v) => (v ? d(v).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
  SM.maand = (ym) => new Date(ym + "-15T12:00:00").toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  SM.geleden = (v) => {
    if (!v) return "–";
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return "zojuist";
    if (s < 3600) return `${Math.round(s / 60)} min geleden`;
    if (s < 86400) return `${Math.round(s / 3600)} uur geleden`;
    return `${Math.round(s / 86400)} dagen geleden`;
  };
  SM.over = (v) => {
    const s = (new Date(v).getTime() - Date.now()) / 1000;
    if (s <= 0) return null;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    return `${Math.round(s / 3600)} uur`;
  };
  SM.bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " kB");

  // ------------------------------------------------ API
  SM.api = async (path, { method = "GET", body, form } = {}) => {
    const headers = { "x-sm": "1" };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    let r;
    try { r = await fetch("/api/" + path, { method, headers, body: payload, credentials: "same-origin" }); }
    catch { const e = new Error("Er is geen verbinding. Controleer je internet en probeer het opnieuw."); e.status = 0; throw e; }
    const data = r.headers.get("content-type")?.includes("json") ? await r.json().catch(() => ({})) : {};
    if (!r.ok) {
      const e = new Error(data.error || "Er ging iets mis. Probeer het opnieuw."); e.status = r.status; e.data = data;
      if (r.status === 401 && SM.onLoggedOut) SM.onLoggedOut();
      throw e;
    }
    return data;
  };

  // ------------------------------------------------ meldingen
  SM.toast = (tekst, soort = "ok") => {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast" + (soort === "fout" ? " toast-fout" : "");
    t.textContent = tekst;
    box.appendChild(t);
    setTimeout(() => t.remove(), soort === "fout" ? 7000 : 3800);
  };
  SM.icon = {
    tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    let: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.01"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  // Veldfouten uit een API-fout in een formulier zetten.
  SM.toonFouten = (form, err) => {
    form.querySelectorAll("[aria-invalid=true]").forEach((x) => x.setAttribute("aria-invalid", "false"));
    form.querySelectorAll(".fout").forEach((x) => (x.textContent = ""));
    const algemeen = form.querySelector("[data-fout]");
    const field = err?.data?.field;
    const errors = err?.data?.errors || (field ? { [field]: err.message } : null);
    if (errors) {
      let eerste;
      for (const [k, v] of Object.entries(errors)) {
        const input = form.elements[k];
        const box = form.querySelector(`[data-fout-voor="${k}"]`);
        if (input) { input.setAttribute("aria-invalid", "true"); eerste = eerste || input; }
        if (box) box.textContent = v;
      }
      if (algemeen) { algemeen.hidden = !!eerste; if (!eerste) algemeen.textContent = err.message; }
      eerste?.focus();
    } else if (algemeen) { algemeen.textContent = err.message; algemeen.hidden = false; algemeen.focus?.(); }
    else SM.toast(err.message, "fout");
  };
  SM.wisFouten = (form) => {
    form.querySelectorAll("[aria-invalid=true]").forEach((x) => x.setAttribute("aria-invalid", "false"));
    form.querySelectorAll(".fout").forEach((x) => (x.textContent = ""));
    const a = form.querySelector("[data-fout]"); if (a) a.hidden = true;
  };
  SM.bezig = (knop, aan, tekst) => {
    if (!knop) return;
    if (aan) { knop.dataset.tekst = knop.textContent; knop.disabled = true; knop.textContent = tekst || "Bezig…"; }
    else { knop.disabled = false; if (knop.dataset.tekst) knop.textContent = knop.dataset.tekst; }
  };

  // ------------------------------------------------ dialoogvenster
  SM.dialoog = (titel, inhoud, { breed = false } = {}) => {
    const dlg = document.createElement("dialog");
    dlg.setAttribute("aria-labelledby", "dlg-titel");
    if (breed) dlg.classList.add("breed");
    dlg.innerHTML = String(SM.html`<div class="d-kop"><h2 id="dlg-titel">${titel}</h2><button class="sluit" type="button" aria-label="Sluiten">${SM.raw(SM.icon.x)}</button></div><div class="d-inhoud">${inhoud}</div>`);
    document.body.appendChild(dlg);
    dlg.querySelector(".sluit").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
    return dlg;
  };
  SM.bevestig = (titel, tekst, knopTekst = "Doorgaan") => new Promise((resolve) => {
    const dlg = SM.dialoog(titel, SM.html`<p>${tekst}</p><div class="knoppen"><button class="knop" data-ja>${knopTekst}</button><button class="knop knop-licht" data-nee>Annuleren</button></div>`);
    dlg.querySelector("[data-ja]").addEventListener("click", () => { resolve(true); dlg.close(); });
    dlg.querySelector("[data-nee]").addEventListener("click", () => { resolve(false); dlg.close(); });
    dlg.addEventListener("close", () => resolve(false));
  });

  // ------------------------------------------------ inloggen met code per mail
  SM.inloggen = (root, { portal, titel, tekst, kop }) => new Promise((klaar) => {
    let email = "";
    const merk = SM.html`<div class="inlog-merk"><img class="logo" src="/assets/brand/logo-wit.png" alt="Sitemaker – Maak van je website je beste verkoper"><div><h1>${titel}</h1><p>${tekst}</p></div><img class="blok" src="/assets/brand/mark.png" alt=""></div>`;
    const stap1 = () => {
      SM.render(root, SM.html`<div class="inlog">${merk}<div class="inlog-vak"><form novalidate>
        <h2>${kop}</h2><p class="dempen">Vul je e-mailadres in. Je krijgt een code van 6 cijfers per mail; een wachtwoord heb je niet nodig.</p>
        <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="l-email">E-mailadres</label><input id="l-email" name="email" type="email" autocomplete="email" inputmode="email" required value="${email}"><div class="fout" data-fout-voor="email"></div></div>
        <button class="knop knop-actie" type="submit">Stuur mij een code</button></form></div></div>`);
      const form = root.querySelector("form");
      form.elements.email.focus();
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        email = form.elements.email.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return SM.toonFouten(form, { message: "Vul een geldig e-mailadres in.", data: { field: "email" } });
        const knop = form.querySelector("button"); SM.bezig(knop, true, "Code versturen…");
        try { await SM.api("auth/code", { method: "POST", body: { email, portal } }); stap2(); }
        catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
      });
    };
    const stap2 = () => {
      SM.render(root, SM.html`<div class="inlog">${merk}<div class="inlog-vak"><form novalidate>
        <h2>Vul je code in</h2><p class="dempen">Als <b>${email}</b> bij ons bekend is, staat er nu een mail met een code van 6 cijfers in je inbox. Kijk ook even in je spammap. De code is 10 minuten geldig.</p>
        <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="l-code">Code</label><input id="l-code" class="code-invoer" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required><div class="fout" data-fout-voor="code"></div></div>
        <button class="knop knop-actie" type="submit">Inloggen</button>
        <p class="klein dempen">Geen mail ontvangen? <button type="button" class="knop-tekst knop" data-opnieuw>Ander adres of nieuwe code</button></p></form></div></div>`);
      const form = root.querySelector("form");
      const input = form.elements.code;
      input.focus();
      const verstuur = async () => {
        SM.wisFouten(form);
        const code = input.value.replace(/\D/g, "");
        if (code.length !== 6) return SM.toonFouten(form, { message: "Vul de 6 cijfers uit de mail in.", data: { field: "code" } });
        const knop = form.querySelector("button[type=submit]"); SM.bezig(knop, true, "Inloggen…");
        try { const r = await SM.api("auth/verify", { method: "POST", body: { email, code, portal } }); klaar(r); }
        catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); input.select(); }
      };
      input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); if (input.value.length === 6) verstuur(); });
      form.addEventListener("submit", (e) => { e.preventDefault(); verstuur(); });
      form.querySelector("[data-opnieuw]").addEventListener("click", stap1);
    };
    const sleutel = () => {
      SM.render(root, SM.html`<div class="inlog">${merk}<div class="inlog-vak"><form novalidate>
        <h2>${kop}</h2><p class="dempen">De mail is nog niet ingesteld. Log als beheerder in met de toegangssleutel uit Netlify (ADMIN_LOGIN_KEY).</p>
        <div class="melding melding-fout" data-fout role="alert" hidden tabindex="-1"></div>
        <div class="veld"><label for="k-email">E-mailadres</label><input id="k-email" name="email" type="email" autocomplete="username" required></div>
        <div class="veld"><label for="k-key">Toegangssleutel</label><input id="k-key" name="key" type="password" autocomplete="current-password" required></div>
        <button class="knop knop-actie" type="submit">Inloggen</button></form></div></div>`);
      const form = root.querySelector("form");
      form.elements.email.focus();
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); SM.wisFouten(form);
        const knop = form.querySelector("button"); SM.bezig(knop, true, "Inloggen…");
        try { klaar(await SM.api("auth/key", { method: "POST", body: { email: form.elements.email.value.trim(), key: form.elements.key.value } })); }
        catch (err) { SM.toonFouten(form, err); SM.bezig(knop, false); }
      });
    };
    const geenMail = () => SM.render(root, SM.html`<div class="inlog">${merk}<div class="inlog-vak"><div><h2>${kop}</h2><p class="dempen">Inloggen per mail is nog niet beschikbaar. ${portal === "hq" ? "Zet ADMIN_LOGIN_KEY in Netlify om als beheerder in te loggen met een toegangssleutel." : "Neem contact op met Sitemaker."}</p></div></div></div>`);
    SM.api("auth/options").then((o) => (o.mail ? stap1() : portal === "hq" && o.key ? sleutel() : geenMail())).catch(stap1);
  });

  SM.uitloggen = async (portaal) => { try { await SM.api("auth/logout" + (portaal === true ? "?portal=1" : ""), { method: "POST" }); } catch {} location.reload(); };
})();
