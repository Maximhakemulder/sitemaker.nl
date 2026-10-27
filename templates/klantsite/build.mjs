// Sitemaker klantsite: bouwt dist/. Geen afhankelijkheden nodig.
// Netlify draait dit bij elke deploy (build command: node build.mjs, publish: dist).
// - Staat er een ontwerp.html (eigen ontwerp van de Sitemaker-ontwerper)? Dan is dat de site,
//   met ons bewegingsscript (beweging.js), de iconen (sprite.svg) en een vangnet (vangnet.css).
// - Anders: de vaste opmaak uit content.json (render.mjs).
import fs from "node:fs";
import { render } from "./render.mjs";

const lees = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const PAGINAS = ["algemene-voorwaarden.html", "privacy.html"];
const verrijk = (h) => h
  .replace(/<\/head>/i, () => `${lees("vangnet.css") ? `<style>${lees("vangnet.css")}</style>` : ""}</head>`)
  .replace(/<body([^>]*)>/i, (m) => m + lees("sprite.svg"))
  .replace(/<\/body>/i, () => `${fs.existsSync("beweging.js") ? '<script src="/beweging.js" defer></script>' : ""}</body>`);
let html;
if (fs.existsSync("ontwerp.html")) {
  html = verrijk(lees("ontwerp.html"));
} else {
  html = render(JSON.parse(fs.readFileSync("content.json", "utf8")));
}
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", html);
for (const p of PAGINAS) if (fs.existsSync(p)) fs.writeFileSync(`dist/${p}`, verrijk(lees(p)));
if (fs.existsSync("beweging.js")) fs.copyFileSync("beweging.js", "dist/beweging.js");
if (fs.existsSync("afbeeldingen")) fs.cpSync("afbeeldingen", "dist/afbeeldingen", { recursive: true });
fs.writeFileSync("dist/robots.txt", "User-agent: *\nAllow: /\n");
console.log("Klaar: dist/index.html");
