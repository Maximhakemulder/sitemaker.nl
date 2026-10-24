#!/usr/bin/env node
// Controleert gepubliceerde concepten op lege vlakken en horizontaal scrollen, op 390/1280/1920/2560.
// Gebruik: node scripts/concept-taak/controle.mjs <url> [<url> ...]
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { zoekGaten, zoekLegeSchermen } from "./gaten.mjs";
let pw; try { pw = await import("playwright"); } catch { pw = createRequire(import.meta.url)(execSync("npm root -g").toString().trim() + "/playwright"); }
const { chromium } = pw.default || pw;
const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
let slecht = 0;
for (const url of process.argv.slice(2)) {
  const regels = [];
  for (const [w, h] of [[390, 844], [1280, 800], [1440, 1260], [1920, 1080], [2560, 1440]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(800);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    const g = await zoekGaten(p);
    await ctx.close();
    // met beweging, scrollend zoals een bezoeker
    const ctx2 = await b.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
    const p2 = await ctx2.newPage();
    await p2.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await p2.waitForTimeout(1200);
    const ls = await zoekLegeSchermen(p2);
    await ctx2.close();
    if (g.length || ls.length || sw > w) slecht++;
    regels.push(`${w}: ${sw > w ? "⚠ horizontaal scrollen " : ""}${g.length ? "⚠ lege vlakken " + g.map(([y, l]) => `${y}/${l}`).join(", ") + " " : ""}${ls.length ? "⚠ lege schermen bij scrollen (y/% leeg): " + ls.map(([y, l]) => `${y}/${l}%`).join(", ") : ""}${!g.length && !ls.length && sw <= w ? "ok" : ""}`);
  }
  console.log(url + "\n  " + regels.join("\n  "));
}
await b.close();
process.exit(slecht ? 1 : 0);
