// Sitemaker klantsite: bouwt dist/ uit content.json. Geen afhankelijkheden nodig.
// Netlify draait dit bij elke deploy (build command: node build.mjs, publish: dist).
import fs from "node:fs";
import { render } from "./render.mjs";

const c = JSON.parse(fs.readFileSync("content.json", "utf8"));
const html = render(c);
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", html);
if (fs.existsSync("afbeeldingen")) fs.cpSync("afbeeldingen", "dist/afbeeldingen", { recursive: true });
fs.writeFileSync("dist/robots.txt", "User-agent: *\nAllow: /\n");
console.log("Klaar: dist/index.html");
