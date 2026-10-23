// Controleert dat prijzen en levertijden overal hetzelfde zijn. Start: npm run check
import fs from "node:fs";
import path from "node:path";
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!["node_modules", "fonts", "brand"].includes(e.name)) walk(p); }
  else if (/\.(html|js|mjs)$/.test(e.name) && !p.includes("logo-pdf")) files.push(p);
});
walk("public"); walk("netlify/lib");
const ALLOWED = new Set(["€299,95", "€69,95", "€0,00"]);
let bad = 0;
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/€\s?\d+(?:[.,]\d+)?/g)) if (!ALLOWED.has(m[0]) && !/(84,64|362,94)/.test(m[0])) { console.log(`${f}: onverwacht bedrag ${m[0]}`); bad++; }
  for (const m of t.matchAll(/(\d+)\s*(?:werkdagen|uur)\b/g)) if (!["48", "2", "15", "1"].includes(m[1])) { console.log(`${f}: onverwachte termijn "${m[0]}"`); bad++; }
  if (/webshop/i.test(t) && /webshop (bouwen|maken) we wel/i.test(t)) { console.log(`${f}: webshop-belofte`); bad++; }
}
console.log(bad ? `${bad} afwijkingen gevonden.` : `Prijzen en termijnen consistent in ${files.length} bestanden.`);
process.exit(bad ? 1 : 0);
