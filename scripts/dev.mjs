// Lokaal draaien zonder Netlify: node scripts/dev.mjs [--port 8888]
// Start een lokale Postgres (PGlite), past de migraties toe, serveert public/ en /api.
// Mails worden niet verstuurd maar in de console getoond (MAIL_TRANSPORT=capture).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { NetlifyDB } from "@netlify/database-dev";

const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 8888;
const root = path.resolve("public");
const db = new NetlifyDB({ directory: process.env.SM_DEV_DB || ".netlify/dev-db" });
const cs = await db.start();
await db.applyMigrations("./netlify/database/migrations");
Object.assign(process.env, {
  SM_DB_URL: cs, MAIL_TRANSPORT: "capture", SM_LOCAL_FILES: path.resolve(".netlify/dev-files"),
  MOLLIE_FAKE_CHECKOUT: `http://localhost:${port}/__dev/betaal`, SM_INSECURE_COOKIE: "1", ADMIN_EMAILS: process.env.ADMIN_EMAILS || "admin@sitemaker.test",
  AUTH_SECRET: "lokaal", PUBLIC_BASE_URL: `http://localhost:${port}`, MOLLIE_FAKE: "1", MOLLIE_API_KEY: process.env.MOLLIE_API_KEY || "test_lokaal",
});
const { default: api } = await import("../netlify/functions/api.mjs");
const { captured } = await import("../netlify/lib/mail.mjs");
let seen = 0;
setInterval(() => { while (seen < captured.length) { const m = captured[seen++]; console.log(`\n[mail] aan ${m.to}: ${m.subject}`); const code = String(m.text || "").match(/\b\d{6}\b/); if (code && /code/i.test(m.subject)) console.log(`[mail] code: ${code[0]}`); } }, 500);

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  // Nep-betaalpagina (alleen lokaal): zet de nep-Mollie-betaling op betaald en stuurt terug naar het portaal.
  if (url.pathname === "/__dev/betaal") {
    const { __fake, handleWebhook } = await import("../netlify/lib/mollie.mjs");
    const p = __fake.payments[url.searchParams.get("id")];
    if (p) { Object.assign(p, { status: "paid", paidAt: new Date().toISOString(), mandateId: "mdt_lokaal", method: "ideal" }); await handleWebhook(p.id); }
    res.writeHead(302, { location: p?.redirectUrl || "/portaal/" }); return res.end();
  }
  if (url.pathname.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await api(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks), duplex: "half" }), { ip: "127.0.0.1" });
    const headers = Object.fromEntries(r.headers); res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { if ((await fs.stat(p)).isDirectory()) p = path.join(p, "index.html"); } catch {}
  try { const data = await fs.readFile(p); res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(data); }
  catch { if (url.pathname === "/portaal" || url.pathname === "/hq") { res.writeHead(301, { location: url.pathname + "/" }); return res.end(); }
    try { res.writeHead(404, { "content-type": "text/html" }); res.end(await fs.readFile(path.join(root, "404.html"))); } catch { res.end("404"); } }
}).listen(port, () => console.log(`Sitemaker lokaal: http://localhost:${port}  (HQ: /hq, portaal: /portaal, beheerder: ${process.env.ADMIN_EMAILS})`));
