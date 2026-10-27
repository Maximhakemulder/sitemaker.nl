#!/usr/bin/env node
// Hulpmiddel voor de geplande Claude-taak die concepten ontwerpt. Zie docs/concept-taak.md.
// Omgeving: SITEMAKER_URL (bijv. https://sitemaker-46to.netlify.app) en SITEMAKER_TAAK_SLEUTEL.
// Werkmap: $CONCEPT_WERK of /tmp/concepten
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Achter een proxy (cloudomgeving): Node gebruikt de proxy alleen met NODE_USE_ENV_PROXY; start dan opnieuw met de juiste instellingen.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const ca = ["/root/.ccr/ca-bundle.crt", "/etc/ssl/certs/ca-certificates.crt"].find((f) => fs.existsSync(f));
  const r = spawnSync(process.execPath, ["--no-warnings", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1", ...(ca && !process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: ca } : {}) } });
  process.exit(r.status ?? 1);
}

const BASE = (process.env.SITEMAKER_URL || "https://sitemaker-46to.netlify.app").replace(/\/+$/, "");
const KEY = process.env.SITEMAKER_TAAK_SLEUTEL || "";
const WERK = process.env.CONCEPT_WERK || "/tmp/concepten";
if (!KEY) { console.error("Zet SITEMAKER_TAAK_SLEUTEL."); process.exit(2); }

async function api(method, p, body, { raw = false } = {}) {
  const r = await fetch(`${BASE}/api/taak/${p}`, { method, headers: { "x-taak-sleutel": KEY, "x-sm": "1", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) { if (!r.ok) throw new Error(`${p}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || `${p}: status ${r.status}`); e.status = r.status; throw e; }
  return d;
}
const dir = (id, ...p) => path.join(WERK, String(id), ...p);
const schrijf = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "instructies") {
    const d = await api("GET", "instructies");
    schrijf(path.join(WERK, "_kit", "content-regels.md"), d.contentRegels);
    schrijf(path.join(WERK, "_kit", "ontwerp-regels.md"), d.ontwerpRegels);
    schrijf(path.join(WERK, "_kit", "beweging.js"), d.beweging);
    schrijf(path.join(WERK, "_kit", "sprite.svg"), d.sprite);
    schrijf(path.join(WERK, "_kit", "vangnet.css"), d.vangnet || "");
    console.log(`Kit in ${path.join(WERK, "_kit")}: content-regels.md, ontwerp-regels.md, beweging.js, sprite.svg`);
  } else if (cmd === "status") {
    console.log(JSON.stringify(await api("GET", "status"), null, 1));
  } else if (cmd === "claim") {
    const d = await api("POST", "claim", { max: Number(args[0] || 5) });
    for (const c of d.concepten) {
      schrijf(dir(c.id, "bron.json"), JSON.stringify(c, null, 1));
      schrijf(dir(c.id, "ontwerp-dna.md"), `# Ontwerp-DNA voor ${c.bedrijf.company} (bindend)\n\nDeze opbouw is gekozen zodat deze site anders wordt dan de vorige. Volg hem; vul hem in met een idee uit hun vak.\n\n${c.ontwerpDNA}\n`);
      for (const a of c.afbeeldingen) schrijf(dir(c.id, "afbeeldingen", a.naam), await api("GET", `concepten/${c.id}/afbeeldingen/${encodeURIComponent(a.naam)}`, null, { raw: true }));
      console.log(`#${c.id} ${c.bedrijf.company} (${c.bedrijf.category || "?"}, ${c.bedrijf.city || "?"}) ${c.bedrijf.website} → ${dir(c.id)} · ${c.afbeeldingen.length} afbeeldingen · DNA: ${Object.entries(c.dna || {}).map(([k, v]) => `${k}=${v}`).join(" ")}${c.instructie ? ` · wens: ${c.instructie}` : ""}`);
    }
    if (!d.concepten.length) console.log("Geen concepten die op een ontwerp wachten.");
  } else if (cmd === "opdracht-claim") {
    // Opdrachten (betaalde klanten) gaan altijd voor. Map: $CONCEPT_WERK/opdracht-<id>/
    const d = await api("POST", "opdrachten/claim", { max: Number(args[0] || 3) });
    for (const o of d.opdrachten) {
      const m = `opdracht-${o.id}`;
      schrijf(dir(m, "opdracht.json"), JSON.stringify(o, null, 1));
      for (const a of o.afbeeldingen) schrijf(dir(m, "afbeeldingen", a.naam), await api("GET", `opdrachten/${o.id}/afbeeldingen/${encodeURIComponent(a.naam)}`, null, { raw: true }));
      const i = o.intake || {};
      const regels = Object.entries(i).filter(([k, v]) => v && k !== "voorIngevuld").map(([k, v]) => `- **${k}**: ${String(v).replace(/\n/g, "\n  ")}`).join("\n");
      schrijf(dir(m, "informatie-klant.md"), `# Informatie van ${o.bedrijf.naam} (bindend)\n\nKlantgegevens: ${[o.bedrijf.contactpersoon, o.bedrijf.email, o.bedrijf.telefoon, o.bedrijf.adres].filter(Boolean).join(" · ")}\n\n${regels}\n${o.feedback ? `\n## Feedback van Maxim op de vorige versie (verwerken!)\n${o.feedback}\n` : ""}`);
      if (o.basis === "concept" && o.concept?.html) {
        schrijf(dir(m, "concept.html"), o.concept.html);
        schrijf(dir(m, "concept-content.json"), JSON.stringify(o.concept.content, null, 1));
        // startpunt: de vorige versie (bij feedback) of het concept
        schrijf(dir(m, "index.html"), o.vorigeVersie?.html || o.concept.html);
        if (o.vorigeVersie?.content) schrijf(dir(m, "content.json"), JSON.stringify(o.vorigeVersie.content, null, 1));
      } else {
        if (o.vorigeVersie?.html) { schrijf(dir(m, "index.html"), o.vorigeVersie.html); schrijf(dir(m, "content.json"), JSON.stringify(o.vorigeVersie.content || {}, null, 1)); }
        schrijf(dir(m, "ontwerp-dna.md"), `# Ontwerp-DNA voor ${o.bedrijf.naam} (bindend)\n\n${o.ontwerpDNA}\n`);
      }
      console.log(`opdracht #${o.id} ${o.bedrijf.naam} · basis: ${o.basis}${o.feedback ? " · MET FEEDBACK" : ""} → ${dir(m)} · ${o.afbeeldingen.length} afbeeldingen`);
    }
    if (!d.opdrachten.length) console.log("Geen opdrachten die wachten.");
  } else if (cmd === "opdracht-opslaan") {
    const [id] = args, m = `opdracht-${id}`;
    const content = JSON.parse(fs.readFileSync(dir(m, "content.json"), "utf8"));
    const html = fs.readFileSync(dir(m, "index.html"), "utf8");
    const d = await api("PUT", `opdrachten/${id}`, { content, html });
    console.log(`Opgeslagen: ${d.url}\nControleer nu: node scripts/concept-taak/controle.mjs ${d.url}`);
  } else if (cmd === "opdracht-afmelden") {
    const [id, reden] = args;
    await api("POST", `opdrachten/${id}/afmelden`, { reden });
    console.log("Afgemeld.");
  } else if (cmd === "stock") {
    const [id, ...termen] = args;
    const d = await api("POST", `concepten/${id}/stock`, { termen });
    for (const k of d.kandidaten) schrijf(dir(id, "kandidaten", k.naam), await api("GET", `concepten/${id}/afbeeldingen/${k.naam}`, null, { raw: true }));
    schrijf(dir(id, "kandidaten", "lijst.json"), JSON.stringify(d.kandidaten, null, 1));
    console.log(d.kandidaten.map((k) => `${k.n}. ${k.naam} [${k.term}] ${k.alt}`).join("\n") || "Geen kandidaten gevonden.");
  } else if (cmd === "kies") {
    const [id, ...n] = args;
    const d = await api("POST", `concepten/${id}/kies`, { nummers: n.map(Number) });
    const bron = JSON.parse(fs.readFileSync(dir(id, "bron.json"), "utf8"));
    for (const t of d.toegevoegd) { schrijf(dir(id, "afbeeldingen", t.naam), await api("GET", `concepten/${id}/afbeeldingen/${t.naam}`, null, { raw: true })); bron.afbeeldingen.push({ naam: t.naam, w: t.w, h: t.h, logo: false, alt: t.alt, sfeerbeeld: true }); }
    schrijf(dir(id, "bron.json"), JSON.stringify(bron, null, 1));
    fs.rmSync(dir(id, "kandidaten"), { recursive: true, force: true });
    console.log(d.toegevoegd.map((t) => `+ ${t.naam} (${t.w}x${t.h}) ${t.alt}`).join("\n") || "Niets toegevoegd.");
  } else if (cmd === "eigen") {
    // node werk.mjs eigen <id> <url> [logo] — logo of foto van hun eigen site/CDN ophalen (bijv. Wix-sites)
    const [id, url, soort] = args;
    const t = await api("POST", `concepten/${id}/eigen-afbeelding`, { url, logo: soort === "logo" });
    schrijf(dir(id, "afbeeldingen", t.naam), await api("GET", `concepten/${id}/afbeeldingen/${t.naam}`, null, { raw: true }));
    const bron = JSON.parse(fs.readFileSync(dir(id, "bron.json"), "utf8"));
    bron.afbeeldingen = (bron.afbeeldingen || []).filter((a) => !(t.logo && a.logo)); bron.afbeeldingen.push({ naam: t.naam, w: t.w, h: t.h, logo: t.logo, alt: "", sfeerbeeld: false });
    schrijf(dir(id, "bron.json"), JSON.stringify(bron, null, 1));
    console.log(`+ ${t.naam} (${t.w}x${t.h})${t.logo ? " logo" : ""}`);
  } else if (cmd === "opslaan") {
    const [id] = args;
    const content = JSON.parse(fs.readFileSync(dir(id, "content.json"), "utf8"));
    const html = fs.readFileSync(dir(id, "index.html"), "utf8");
    const d = await api("PUT", `concepten/${id}`, { content, html });
    console.log(`Opgeslagen: ${d.url} ${d.waarschuwingen?.length ? "Let op: " + d.waarschuwingen.join("; ") : ""}\nControleer nu: node scripts/concept-taak/controle.mjs ${d.url}`);
  } else if (cmd === "afmelden") {
    const [id, reden, vlag] = args;
    await api("POST", `concepten/${id}/afmelden`, { reden, overslaan: vlag === "--overslaan" });
    console.log("Afgemeld.");
  } else {
    console.log("Gebruik: werk.mjs instructies | status | opdracht-claim [n] | opdracht-opslaan <id> | opdracht-afmelden <id> \"reden\" | claim [n] | stock <id> <term>... | kies <id> <n>... | opslaan <id> | afmelden <id> \"reden\" [--overslaan]");
  }
} catch (e) { console.error("FOUT:", e.message); process.exit(1); }
