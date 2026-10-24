#!/usr/bin/env node
// Maakt screenshots van een concept-ontwerp zoals de bezoeker het ziet: mobiel (390) en desktop (1280), met ons
// bewegingsscript en de iconen. Lettertypen van Bunny Fonts worden lokaal nagebootst met @fontsource (npm).
// Gebruik: node scripts/concept-taak/bekijk.mjs <id>   → $CONCEPT_WERK/<id>/shots/*.png + rapport
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const WERK = process.env.CONCEPT_WERK || "/tmp/concepten";
const id = process.argv[2];
const D = path.join(WERK, String(id));
const KIT = path.join(WERK, "_kit");
const FONTS = path.join(WERK, "_fonts");
if (!id || !fs.existsSync(path.join(D, "index.html"))) { console.error(`Geen ${D}/index.html`); process.exit(2); }
let pw;
try { pw = await import("playwright"); } catch { const req = createRequire(import.meta.url); pw = req(execSync("npm root -g").toString().trim() + "/playwright"); }
const { chromium } = pw.default || pw;

const html = fs.readFileSync(path.join(D, "index.html"), "utf8")
  .replace(/<body([^>]*)>/i, (m) => m + fs.readFileSync(path.join(KIT, "sprite.svg"), "utf8"))
  .replace(/<\/body>/i, `<script>${fs.readFileSync(path.join(KIT, "beweging.js"), "utf8")}</script></body>`);

// lettertypen: @fontsource/<naam> installeren als dat nog niet gebeurd is
const fams = [...html.matchAll(/fonts\.bunny\.net\/css2?\?family=([^"'&]+)/g)].flatMap((m) => decodeURIComponent(m[1]).split("|")).map((f) => f.split(":")[0]);
fs.mkdirSync(FONTS, { recursive: true });
if (!fs.existsSync(path.join(FONTS, "package.json"))) fs.writeFileSync(path.join(FONTS, "package.json"), '{"name":"fonts","private":true}');
for (const f of fams) {
  if (fs.existsSync(path.join(FONTS, "node_modules/@fontsource", f))) continue;
  try { execSync(`npm i --prefix ${FONTS} --silent @fontsource/${f}`, { stdio: "ignore", timeout: 90000 }); } catch { console.log(`(lettertype ${f} niet gevonden op npm; screenshot gebruikt een vervanger)`); }
}
const naamVan = (f) => f.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");

const b = await chromium.launch();
const rapport = [];
fs.rmSync(path.join(D, "shots"), { recursive: true, force: true });
fs.mkdirSync(path.join(D, "shots"), { recursive: true });
for (const [w, hgt] of [[390, 844], [1280, 800]]) {
  for (const beweging of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, reducedMotion: beweging ? "no-preference" : "reduce" });
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(e.message));
    await p.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      if (u.host === "fonts.bunny.net") {
        let css = "";
        for (const fam of (u.searchParams.get("family") || "").split("|")) {
          const [nm, ws] = fam.split(":");
          for (const wt of (ws || "400").split(",").map((x) => x.replace(/i$/, ""))) {
            const f = path.join(FONTS, "node_modules/@fontsource", nm, "files", `${nm}-latin-${wt}-normal.woff2`);
            if (fs.existsSync(f)) css += `@font-face{font-family:"${naamVan(nm)}";font-weight:${wt};src:url(http://fonts.local/${nm}/${wt})}\n`;
          }
        }
        return r.fulfill({ contentType: "text/css", body: css });
      }
      if (u.host === "fonts.local") { const [, nm, wt] = u.pathname.split("/"); return r.fulfill({ contentType: "font/woff2", body: fs.readFileSync(path.join(FONTS, "node_modules/@fontsource", nm, "files", `${nm}-latin-${wt}-normal.woff2`)) }); }
      if (u.host === "concept.local") {
        const f = path.join(D, decodeURIComponent(u.pathname));
        if (fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f) });
        return r.fulfill({ status: 404, body: "" });
      }
      return r.fulfill({ status: 404, body: "" });
    });
    await p.setContent(html.replace(/(["'(])afbeeldingen\//g, "$1http://concept.local/afbeeldingen/"), { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    if (!beweging) {
      const info = await p.evaluate(() => ({
        breedte: document.documentElement.scrollWidth, hoogte: document.documentElement.scrollHeight,
        kapotteBeelden: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")),
        teHoog: [...document.images].filter((i) => i.getBoundingClientRect().height > innerHeight * 1.1 && !i.closest("[data-horizontaal]")).map((i) => i.getAttribute("src")),
      }));
      rapport.push(`${w}px: paginabreedte ${info.breedte}${info.breedte > w ? " ⚠ HORIZONTAAL SCROLLEN" : " ok"}, hoogte ${info.hoogte}px${info.kapotteBeelden.length ? `, ⚠ kapotte beelden: ${info.kapotteBeelden.join(", ")}` : ""}${info.teHoog.length ? `, ⚠ beelden hoger dan het scherm: ${info.teHoog.join(", ")}` : ""}${fouten.length ? `, fouten: ${fouten.join("; ")}` : ""}`);
      // volledige pagina in stukken (leesbaar voor beoordeling)
      const stuk = w < 600 ? 1400 : 1500;
      for (let y = 0, n = 1; y < info.hoogte && n <= 8; y += stuk, n++) {
        await p.screenshot({ path: path.join(D, "shots", `${w}-${n}.png`), clip: { x: 0, y, width: w, height: Math.min(stuk, info.hoogte - y) }, fullPage: true });
      }
    } else {
      // met beweging: eerste scherm na het laden, en halverwege de pagina na scrollen
      await p.screenshot({ path: path.join(D, "shots", `${w}-beweging-start.png`) });
      const H = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < H * 0.45; y += 300) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(D, "shots", `${w}-beweging-midden.png`) });
    }
    await ctx.close();
  }
}
await b.close();
console.log(rapport.join("\n"));
console.log(`Screenshots: ${path.join(D, "shots")} (${fs.readdirSync(path.join(D, "shots")).join(", ")})`);
