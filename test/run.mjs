// Integratietest van de hele keten tegen een lokale Postgres. Start: npm test
// Er gaan geen echte mails of betalingen de deur uit (capture-mail en nep-Mollie).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NetlifyDB } from "@netlify/database-dev";

const db = new NetlifyDB();
const cs = await db.start();
await db.applyMigrations("./netlify/database/migrations");
const files = await fs.mkdtemp(path.join(os.tmpdir(), "sm-files-"));
Object.assign(process.env, {
  SM_DB_URL: cs, MAIL_TRANSPORT: "capture", SM_LOCAL_FILES: files, SM_INSECURE_COOKIE: "1", ADMIN_EMAILS: "maxim@sitemaker.test",
  AUTH_SECRET: "test-secret", PUBLIC_BASE_URL: "https://sitemaker.test", MOLLIE_FAKE: "1", MOLLIE_API_KEY: "test_x", B2B_ANY_TIME: "1",
  GITHUB_FAKE: "1", GITHUB_TOKEN: "x", GITHUB_ORG: "sitemaker-sites", NETLIFY_FAKE: "1", NETLIFY_API_TOKEN: "x", NETLIFY_ACCOUNT_SLUG: "team", NETLIFY_GITHUB_INSTALLATION_ID: "1",
  AI_FAKE: "1", SM_INLINE_AI: "1",
});
// Nep-Claude: past openingstijden aan, weigert webshops, verwerkt opmerkingen en kan een foute afbeelding voorstellen.
globalThis.__aiFake = ({ prompt }) => {
  const c = JSON.parse(prompt.slice(prompt.indexOf("Huidige content.json:") + 21));
  if (/webshop/i.test(prompt)) return JSON.stringify({ kan: false, reden: "Een webshop valt buiten het aanbod." });
  if (/rare foto/i.test(prompt)) { c.hero.foto = "afbeeldingen/bestaat-niet.jpg"; return JSON.stringify({ kan: true, samenvatting: "x", content: c }); }
  if (/openingstijden/i.test(prompt)) c.openingstijden[0].tijd = "08:00 - 18:00";
  if (/Opmerking van de beheerder/.test(prompt)) c.hero.titel = "Nieuwe titel na opmerking";
  const foto = prompt.match(/pad "(afbeeldingen\/wijziging-\d+\.\w+)"/);
  if (foto) c.over.foto = foto[1];
  return "Hier is het voorstel:\n```json\n" + JSON.stringify({ kan: true, samenvatting: "Openingstijden aangepast.", content: c }) + "\n```";
};
const { default: api } = await import("../netlify/functions/api.mjs");
const { captured } = await import("../netlify/lib/mail.mjs");
const { handleWebhook, __fake } = await import("../netlify/lib/mollie.mjs");
const { sendBatch } = await import("../netlify/lib/b2b.mjs");
const { q, closeDb } = await import("../netlify/lib/core.mjs");

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log("  ✓", name); } catch (e) { console.log("  ✗", name); throw e; } };

async function call(method, p, { body, cookie, form, headers = {}, raw = false, csrf = true } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (csrf && method !== "GET") h["x-sm"] = "1";
  let b;
  if (form) b = form; else if (body !== undefined) { b = JSON.stringify(body); h["content-type"] = "application/json"; }
  const res = await api(new Request("https://sitemaker.test/api/" + p, { method, headers: h, body: b }), { ip: "10.0.0.1" });
  if (raw) return res;
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  return { status: res.status, data, cookie: res.headers.get("set-cookie") };
}
const lastCode = (to) => { const m = [...captured].reverse().find((x) => x.to === to && /inlogcode/i.test(x.subject)); return m && m.subject.match(/(\d{6})/)[1]; };
async function login(email, portal) {
  const r = await call("POST", "auth/code", { body: { email, portal } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const v = await call("POST", "auth/verify", { body: { email, code: lastCode(email), portal } });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.cookie.split(";")[0];
}
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

console.log("Website");
await test("aanvraagformulier valideert velden", async () => {
  const r = await call("POST", "aanvraag", { body: { name: "", company: "", email: "geen-mail" } });
  assert.equal(r.status, 400); assert.ok(r.data.errors.name && r.data.errors.company && r.data.errors.email);
});
await test("aanvraag komt binnen in HQ en stuurt bevestiging", async () => {
  const r = await call("POST", "aanvraag", { body: { name: "Sanne de Vries", company: "Kapsalon Test", email: "sanne@kapsalon.test", preference: "ochtend", t: Date.now() - 10000 } });
  assert.equal(r.status, 200);
  const [a] = await q("SELECT * FROM appointments"); assert.equal(a.company, "Kapsalon Test");
  assert.ok(captured.some((m) => m.to === "sanne@kapsalon.test" && /ontvangen/.test(m.subject)));
});
await test("honeypot: bots worden stil genegeerd", async () => {
  await call("POST", "aanvraag", { body: { name: "Bot", company: "Bot", email: "bot@bot.test", website_url: "x" } });
  assert.equal((await q("SELECT COUNT(*)::int n FROM appointments"))[0].n, 1);
});
await test("zonder x-sm-header wordt een POST geweigerd (CSRF)", async () => {
  const r = await call("POST", "aanvraag", { body: { name: "X" }, csrf: false }); assert.equal(r.status, 403);
});

console.log("Inloggen");
let admin;
await test("onbekend adres krijgt geen mail maar hetzelfde antwoord", async () => {
  const before = captured.length;
  const r = await call("POST", "auth/code", { body: { email: "onbekend@x.test", portal: "portaal" } });
  assert.equal(r.status, 200); assert.equal(captured.length, before);
});
await test("beheerder uit ADMIN_EMAILS logt in op HQ", async () => { admin = await login("maxim@sitemaker.test", "hq"); });
await test("foute code telt pogingen af", async () => {
  await call("POST", "auth/code", { body: { email: "maxim@sitemaker.test", portal: "hq" } });
  const r = await call("POST", "auth/verify", { body: { email: "maxim@sitemaker.test", code: "000000", portal: "hq" } });
  assert.equal(r.status, 400); assert.match(r.data.error, /Nog 4 pogingen/);
});

console.log("HQ: instellingen en klanten");
await test("instellingen opslaan (bedrijf + btw)", async () => {
  const r = await call("PUT", "hq/settings", { cookie: admin, body: {
    company: { name: "Sitemaker", legalName: "Gosmart B.V.", address: "Teststraat 1", postcode: "1234 AB", city: "Teststad", kvk: "12345678", vat: "NL001234567B01", iban: "NL00TEST0123456789", email: "info@sitemaker.test" },
    billing: { pricesIncludeVat: false, vatRate: 21 }, b2b: { senderName: "Maxim" } } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.settings.billing.pricesIncludeVat, false);
});
let c1, c2;
await test("klant aanmaken met welkomstmail", async () => {
  const r = await call("POST", "hq/customers", { cookie: admin, body: { company: "Testklant Een", contactName: "Jan", email: "jan@een.test", siteUrl: "een.test", siteStatus: "live", sendWelcome: true, appointmentId: 1 } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); c1 = r.data.customer.id; assert.equal(r.data.welcome.ok, true);
  assert.equal((await q("SELECT status FROM appointments WHERE id = 1"))[0].status, "klant");
  const r2 = await call("POST", "hq/customers", { cookie: admin, body: { company: "Testklant Twee", email: "piet@twee.test" } });
  c2 = r2.data.customer.id;
});
await test("dubbel e-mailadres wordt geweigerd", async () => {
  const r = await call("POST", "hq/customers", { cookie: admin, body: { company: "X", email: "jan@een.test" } }); assert.equal(r.status, 409);
});

console.log("Klantenportaal");
let k1, k2;
await test("klant logt in, ziet eigen dashboard", async () => {
  k1 = await login("jan@een.test", "portaal"); k2 = await login("piet@twee.test", "portaal");
  const r = await call("GET", "portal/state", { cookie: k1 });
  assert.equal(r.status, 200); assert.equal(r.data.customer.company, "Testklant Een"); assert.equal(r.data.usage.left, 4);
});
await test("klant kan niet in HQ (ook niet met code)", async () => {
  assert.equal((await call("GET", "hq/overview", { cookie: k1 })).status, 403);
  const before = captured.length;
  await call("POST", "auth/code", { body: { email: "jan@een.test", portal: "hq" } });
  assert.equal(captured.length, before, "klant mag geen HQ-code krijgen");
  assert.equal((await call("GET", "portal/state")).status, 401);
});
let change1;
await test("wijziging met bijlage indienen", async () => {
  const f = new FormData(); f.set("description", "Graag de openingstijden aanpassen naar 9-17 uur."); f.set("page", "Contact");
  f.set("file", new Blob([png], { type: "image/png" }), "foto.png");
  const r = await call("POST", "portal/changes", { cookie: k1, form: f });
  assert.equal(r.status, 200, JSON.stringify(r.data)); change1 = r.data.change.id;
  assert.equal(r.data.usage.left, 3); assert.equal(r.data.change.attachment.name, "foto.png");
});
await test("te korte omschrijving en vals bestand worden geweigerd", async () => {
  const f = new FormData(); f.set("description", "kort");
  assert.equal((await call("POST", "portal/changes", { cookie: k1, form: f })).status, 400);
  const g = new FormData(); g.set("description", "Een geldige omschrijving van de wijziging."); g.set("file", new Blob([Buffer.from("niet echt")], { type: "image/png" }), "x.png");
  assert.equal((await call("POST", "portal/changes", { cookie: k1, form: g })).status, 400);
});
await test("andere klant kan bijlage niet openen; eigenaar en HQ wel", async () => {
  assert.equal((await call("GET", `portal/changes/${change1}/bijlage`, { cookie: k2 })).status, 404);
  const own = await call("GET", `portal/changes/${change1}/bijlage`, { cookie: k1, raw: true });
  assert.equal(own.status, 200); assert.match(own.headers.get("content-disposition"), /attachment/);
  assert.equal((await call("GET", `hq/changes/${change1}/bijlage`, { cookie: admin, raw: true })).status, 200);
});
await test("gelijktijdig indienen: er tellen nooit meer dan 4 mee", async () => {
  // Let op: de lokale PGlite draait alles in één sessie, dus gelijktijdige transacties lopen hier door elkaar.
  // Op Netlify (echte Postgres) wachten ze netjes op elkaar. De unieke plek 1-4 houdt de grens in beide gevallen.
  const mk = (i) => { const f = new FormData(); f.set("description", `Wijziging nummer ${i} met genoeg tekst.`); return call("POST", "portal/changes", { cookie: k1, form: f }); };
  await Promise.all([1, 2, 3, 4, 5].map(mk));
  const [{ n }] = await q("SELECT COUNT(*)::int n FROM change_requests WHERE customer_id = $1 AND counts", [c1]);
  assert.ok(n <= 4, `er tellen ${n} wijzigingen mee`);
});
await test("na 4 wijzigingen is het formulier dicht tot volgende maand", async () => {
  const mk = (i) => { const f = new FormData(); f.set("description", `Volgende wijziging ${i} met genoeg tekst.`); return call("POST", "portal/changes", { cookie: k1, form: f }); };
  let st = await call("GET", "portal/state", { cookie: k1 });
  for (let i = 0; i < st.data.usage.left; i++) assert.equal((await mk(i)).status, 200);
  const r = await mk(99); assert.equal(r.status, 409); assert.match(r.data.error, /al 4 wijzigingen/);
  st = await call("GET", "portal/state", { cookie: k1 });
  assert.equal(st.data.usage.used, 4); assert.equal(st.data.usage.left, 0);
});
await test("HQ zet wijziging op verwerkt en klant krijgt mail; 'telt niet mee' geeft ruimte terug", async () => {
  const r = await call("PUT", `hq/changes/${change1}`, { cookie: admin, body: { status: "verwerkt", staffNote: "Staat online." } });
  assert.equal(r.status, 200); assert.equal(r.data.mailed.ok, true);
  assert.ok(captured.some((m) => m.to === "jan@een.test" && /verwerkt/.test(m.subject)));
  const [last] = await q("SELECT id FROM change_requests WHERE customer_id = $1 ORDER BY id DESC LIMIT 1", [c1]);
  await call("PUT", `hq/changes/${last.id}`, { cookie: admin, body: { status: "afgewezen", counts: false, staffNote: "Dubbel." } });
  assert.equal((await call("GET", "portal/state", { cookie: k1 })).data.usage.left, 1);
});

console.log("Facturen");
let inv1;
await test("handmatige factuur met gegenereerde PDF", async () => {
  const f = new FormData(); f.set("customerId", String(c1)); f.set("amount", "84,64"); f.set("vatRate", "21"); f.set("description", "Abonnement oktober"); f.set("generate", "1");
  const r = await call("POST", "hq/invoices", { cookie: admin, form: f });
  assert.equal(r.status, 200, JSON.stringify(r.data)); inv1 = r.data.invoice; assert.equal(inv1.hasPdf, true); assert.match(inv1.number, /^SM-\d{4}-0001$/);
  assert.equal(inv1.vatCents, 1469);
});
await test("klant downloadt eigen factuur; andere klant niet", async () => {
  const own = await call("GET", `portal/invoices/${inv1.id}/pdf`, { cookie: k1, raw: true });
  assert.equal(own.status, 200); const buf = Buffer.from(await own.arrayBuffer()); assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  await fs.writeFile("/tmp/claude-0/-home-claude/db01b036-9512-58e2-8afe-9adb6fd5a95a/scratchpad/factuur-test.pdf", buf).catch(() => {});
  assert.equal((await call("GET", `portal/invoices/${inv1.id}/pdf`, { cookie: k2 })).status, 404);
  assert.equal((await call("GET", "portal/state", { cookie: k2 })).data.invoices.length, 0);
});

console.log("Automatische betalingen (nep-Mollie)");
await test("eerste betaling → abonnement → factuur met PDF", async () => {
  const r = await call("POST", `hq/customers/${c2}/payment`, { cookie: admin, body: { sendMail: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.amountCents, 36294); // 299,95 + 21%
  const p = __fake.payments[r.data.paymentId]; p.status = "paid"; p.paidAt = new Date().toISOString(); p.mandateId = "mdt_test";
  const w = await call("POST", "mollie/webhook", { form: new URLSearchParams({ id: p.id }), csrf: false, headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(w.status, 200);
  const [c] = await q("SELECT * FROM customers WHERE id = $1", [c2]);
  assert.equal(c.billing_status, "actief"); assert.ok(c.mollie_subscription_id);
  const st = await call("GET", "portal/state", { cookie: k2 });
  assert.equal(st.data.invoices.length, 1); assert.equal(st.data.invoices[0].status, "betaald"); assert.equal(st.data.invoices[0].hasPdf, true);
  await handleWebhook(p.id); // dubbele webhook: geen tweede factuur
  assert.equal((await call("GET", "portal/state", { cookie: k2 })).data.invoices.length, 1);
});
await test("maandtermijn betaald → nieuwe factuur; mislukt → status en melding", async () => {
  const [c] = await q("SELECT * FROM customers WHERE id = $1", [c2]);
  const ok = { id: "tr_subok", status: "paid", paidAt: new Date().toISOString(), amount: { value: "84.64" }, customerId: c.mollie_customer_id, subscriptionId: c.mollie_subscription_id, description: "x" };
  __fake.payments[ok.id] = ok; await handleWebhook(ok.id);
  const bad = { id: "tr_subbad", status: "failed", amount: { value: "84.64" }, customerId: c.mollie_customer_id, subscriptionId: c.mollie_subscription_id, description: "x" };
  __fake.payments[bad.id] = bad; await handleWebhook(bad.id);
  assert.equal((await q("SELECT billing_status FROM customers WHERE id = $1", [c2]))[0].billing_status, "betaling_mislukt");
  assert.equal((await q("SELECT COUNT(*)::int n FROM invoices WHERE customer_id = $1", [c2]))[0].n, 2);
});

console.log("B2B");
await test("leads toevoegen, CSV importeren, goedkeuren en versturen met afmeldlink", async () => {
  await call("POST", "hq/leads", { cookie: admin, body: { company: "Hovenier Groen", email: "info@groen.test", city: "Breda", category: "hovenier" } });
  const imp = await call("POST", "hq/leads/import", { cookie: admin, body: { csv: "bedrijf;email;plaats\nSchilder Blauw;info@blauw.test;Utrecht\nDubbel;info@groen.test;Breda\n" } });
  assert.equal(imp.data.added, 1); assert.equal(imp.data.duplicates, 1);
  const list = await call("GET", "hq/leads", { cookie: admin });
  const ids = list.data.leads.filter((l) => l.status === "nieuw").map((l) => l.id);
  const prev = await call("GET", `hq/leads/${ids[0]}/preview?kind=eerste`, { cookie: admin });
  assert.match(prev.data.body, /€299,95 eenmalig/); assert.match(prev.data.body, /KvK 12345678/); assert.match(prev.data.body, /afmelden\?l=/);
  await call("POST", "hq/leads/action", { cookie: admin, body: { action: "goedkeuren", ids } });
  const res = await sendBatch({ max: 5, budgetMs: 20000 });
  assert.equal(res.sent, 2);
  const m = captured.find((x) => x.to === "info@groen.test");
  assert.ok(m.headers["List-Unsubscribe"]); const link = m.headers["List-Unsubscribe"].slice(1, -1);
  const u = new URL(link);
  const page = await call("GET", "b2b/afmelden" + u.search, { csrf: false }); assert.match(page.data, /meld mij af/);
  await call("POST", "b2b/afmelden" + u.search, { csrf: false });
  assert.equal((await q("SELECT COUNT(*)::int n FROM suppressions WHERE email = 'info@groen.test'"))[0].n, 1);
  const again = await call("POST", "hq/leads", { cookie: admin, body: { company: "Opnieuw", email: "info@groen.test" } });
  assert.equal(again.status, 400);
});
await test("aanvraag van een bestaande lead zet de lead op 'afspraak'", async () => {
  await call("POST", "aanvraag", { body: { name: "Kees", company: "Schilder Blauw", email: "info@blauw.test", t: Date.now() - 5000 } });
  assert.equal((await q("SELECT status FROM leads WHERE email = 'info@blauw.test'"))[0].status, "afspraak");
});

console.log("Overzicht en rollen");
await test("HQ-overzicht telt alles op", async () => {
  const r = await call("GET", "hq/overview", { cookie: admin });
  assert.equal(r.status, 200); assert.equal(r.data.counts.klanten, 2); assert.equal(r.data.counts.betaling_mislukt, 1); assert.ok(r.data.counts.open_wijzigingen >= 2);
});
await test("medewerker mag geen instellingen of team wijzigen", async () => {
  await call("POST", "hq/team", { cookie: admin, body: { email: "medewerker@sitemaker.test", role: "medewerker" } });
  const mw = await login("medewerker@sitemaker.test", "hq");
  assert.equal((await call("PUT", "hq/settings", { cookie: mw, body: { notify: { email: "a@b.test" } } })).status, 403);
  assert.equal((await call("POST", "hq/team", { cookie: mw, body: { email: "x@y.test" } })).status, 403);
  assert.equal((await call("GET", "hq/customers", { cookie: mw })).status, 200);
});
await test("uitloggen beëindigt de sessie", async () => {
  await call("POST", "auth/logout", { cookie: k1 });
  assert.equal((await call("GET", "portal/state", { cookie: k1 })).status, 401);
});

console.log("Inloggen zonder mail");
await test("sleutel-login werkt alleen zolang mail niet is ingesteld, en alleen voor beheerders", async () => {
  process.env.ADMIN_LOGIN_KEY = "een-lange-test-sleutel-123";
  assert.equal((await call("POST", "auth/key", { body: { email: "maxim@sitemaker.test", key: "een-lange-test-sleutel-123" } })).status, 403); // mail staat aan (capture)
  delete process.env.MAIL_TRANSPORT;
  assert.equal((await call("GET", "auth/options")).data.key, true);
  assert.equal((await call("POST", "auth/key", { body: { email: "maxim@sitemaker.test", key: "fout" } })).status, 400);
  assert.equal((await call("POST", "auth/key", { body: { email: "jan@een.test", key: "een-lange-test-sleutel-123" } })).status, 400);
  const ok = await call("POST", "auth/key", { body: { email: "maxim@sitemaker.test", key: "een-lange-test-sleutel-123" } });
  assert.equal(ok.status, 200);
  assert.equal((await call("GET", "hq/overview", { cookie: ok.cookie.split(";")[0] })).status, 200);
  process.env.MAIL_TRANSPORT = "capture";
});
await test("open modus: HQ zonder inloggen, alleen zonder mail; bekijk-als-klant werkt los van HQ-sessie", async () => {
  process.env.OPEN_MODE = "1";
  assert.equal((await call("GET", "hq/overview")).status, 401);
  delete process.env.MAIL_TRANSPORT;
  const ov = await call("GET", "hq/overview"); assert.equal(ov.status, 200);
  assert.equal((await call("GET", "portal/state")).status, 401, "portaal blijft dicht");
  const ok = await call("GET", "auth/open-klanten"); assert.ok(ok.data.klanten.length >= 1);
  const oa = await call("POST", "auth/open-als", { body: { customerId: c2 } });
  assert.equal((await call("GET", "portal/state", { cookie: oa.cookie.split(";")[0] })).data.customer.company, "Testklant Twee");
  const als = await call("POST", `hq/customers/${c1}/als-klant`);
  const c = als.cookie.split(";")[0]; assert.match(c, /^sm_als=/);
  const st = await call("GET", "portal/state", { cookie: c });
  assert.equal(st.data.customer.company, "Testklant Een"); assert.equal(st.data.user.viaHq, true);
  assert.equal((await call("GET", "hq/overview", { cookie: c })).status, 200, "HQ blijft werken naast bekijk-als-klant");
  delete process.env.OPEN_MODE; process.env.MAIL_TRANSPORT = "capture";
  assert.equal((await call("GET", "auth/open-klanten")).status, 403);
  assert.equal((await call("POST", "auth/open-als", { body: { customerId: c2 } })).status, 403);
  assert.equal((await call("GET", "hq/overview", { cookie: c })).status, 401);
});

console.log("Reviews");
await test("reviews: alleen gepubliceerde op de site, geverifieerd alleen met klant", async () => {
  assert.equal((await call("GET", "reviews")).data.count, 0);
  const a = await call("POST", "hq/reviews", { cookie: admin, body: { name: "Jan", body: "Heel tevreden over de nieuwe website.", rating: 5, customerId: c1, published: true } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  await call("POST", "hq/reviews", { cookie: admin, body: { name: "Verborgen", body: "Deze staat nog niet online.", rating: 4 } });
  const pub = await call("GET", "reviews");
  assert.equal(pub.data.count, 1); assert.equal(pub.data.reviews[0].verified, true);
  assert.equal((await call("POST", "hq/reviews", { cookie: k2 || admin, body: { name: "x", body: "kort", rating: 9 } })).status, k2 ? 403 : 400);
});

console.log("Klantsites en automatische verwerking");
const { __ghFake } = await import("../netlify/lib/github.mjs");
await test("site aanmaken: repo met sjabloon en Netlify-project", async () => {
  const r = await call("POST", `hq/customers/${c2}/site`, { cookie: admin, body: { thema: "stoer" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.repo, "sitemaker-sites/site-testklant-twee");
  const repo = __ghFake.repos["sitemaker-sites/site-testklant-twee"];
  const files = repo.commits[repo.refs.main].files;
  assert.ok(files["build.mjs"] && files["netlify.toml"] && files["afbeeldingen/hero.jpg"]);
  const content = JSON.parse(files["content.json"]);
  assert.equal(content.bedrijf.naam, "Testklant Twee"); assert.equal(content.thema, "stoer");
  assert.equal((await call("POST", `hq/customers/${c2}/site`, { cookie: admin, body: {} })).status, 409);
});
let wijz;
await test("wijziging met foto wordt automatisch een voorstel met voorbeeldlink", async () => {
  const f = new FormData(); f.set("description", "Graag de openingstijden aanpassen naar 8 tot 18 uur en deze foto bij Over ons."); f.set("file", new Blob([png], { type: "image/png" }), "team.png");
  const r = await call("POST", "portal/changes", { cookie: k2, form: f });
  assert.equal(r.status, 200, JSON.stringify(r.data)); wijz = r.data.change.id;
  const lijst = await call("GET", "hq/changes?status=open", { cookie: admin });
  const w = lijst.data.changes.find((x) => x.id === wijz);
  assert.equal(w.ai.status, "voorstel", JSON.stringify(w.ai));
  assert.ok(w.ai.diff.some((d) => d.veld === "openingstijden[0].tijd" && d.nieuw === "08:00 - 18:00"));
  assert.ok(w.ai.diff.some((d) => d.veld === "over.foto" && /wijziging-\d+\.png/.test(d.nieuw)));
  assert.match(w.ai.previewUrl, /^https:\/\/deploy-preview-1--/);
  assert.equal(w.status, "in_behandeling");
  const st = await call("GET", "portal/state", { cookie: k2 });
  assert.equal(st.data.changes[0].ai, undefined, "klant ziet geen interne AI-gegevens");
});
await test("opnieuw met opmerking geeft een nieuw voorstel", async () => {
  const r = await call("POST", `hq/changes/${wijz}/opnieuw`, { cookie: admin, body: { feedback: "Maak de kop ook nieuw." } });
  assert.equal(r.status, 200);
  const w = (await call("GET", "hq/changes?status=open", { cookie: admin })).data.changes.find((x) => x.id === wijz);
  assert.equal(w.ai.status, "voorstel"); assert.ok(w.ai.diff.some((d) => d.veld === "hero.titel")); assert.equal(w.ai.attempts, 2);
});
await test("goedkeuren zet het live, markeert verwerkt en mailt de klant", async () => {
  const voor = captured.length;
  const r = await call("POST", `hq/changes/${wijz}/goedkeuren`, { cookie: admin, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const repo = __ghFake.repos["sitemaker-sites/site-testklant-twee"];
  const live = JSON.parse(repo.commits[repo.refs.main].files["content.json"]);
  assert.equal(live.openingstijden[0].tijd, "08:00 - 18:00"); assert.equal(live.hero.titel, "Nieuwe titel na opmerking");
  assert.ok(repo.commits[repo.refs.main].files[`afbeeldingen/wijziging-${wijz}.png`]);
  const st = await call("GET", "portal/state", { cookie: k2 });
  assert.equal(st.data.changes.find((x) => x.id === wijz).status, "verwerkt");
  assert.ok(captured.slice(voor).some((m) => m.to === "piet@twee.test" && /verwerkt/.test(m.subject)));
  assert.equal((await call("POST", `hq/changes/${wijz}/goedkeuren`, { cookie: admin, body: {} })).status, 400);
});
await test("onmogelijk verzoek en ongeldig voorstel gaan naar 'handmatig'", async () => {
  const mk = async (t) => { const f = new FormData(); f.set("description", t); return (await call("POST", "portal/changes", { cookie: k2, form: f })).data.change.id; };
  const a = await mk("Kunnen jullie er een webshop van maken?");
  const b = await mk("Zet er een rare foto in de header.");
  const ch = (await call("GET", "hq/changes?status=open", { cookie: admin })).data.changes;
  assert.equal(ch.find((x) => x.id === a).ai.status, "handmatig"); assert.match(ch.find((x) => x.id === a).ai.reason, /webshop/);
  assert.equal(ch.find((x) => x.id === b).ai.status, "handmatig"); assert.match(ch.find((x) => x.id === b).ai.reason, /Onbekende afbeelding/);
});

console.log("Start in het portaal");
await test("nieuwe klant met startflow: gegevens → akkoord en betalen → melding → informatie", async () => {
  const r = await call("POST", "hq/customers", { cookie: admin, body: { company: "Bakkerij Zon", email: "zon@bakkerij.test", onboarding: true, sendWelcome: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cid = r.data.customer.id;
  assert.ok(captured.some((m) => m.to === "zon@bakkerij.test" && /start je website/i.test(m.subject)));
  const kz = await login("zon@bakkerij.test", "portaal");
  let st = (await call("GET", "portal/state", { cookie: kz })).data;
  assert.equal(st.start.stage, "gegevens");
  // betalen kan nog niet
  assert.equal((await call("POST", "portal/start/betalen", { cookie: kz, body: { akkoord: true } })).status, 400);
  const fout = await call("PUT", "portal/start/gegevens", { cookie: kz, body: { company: "Bakkerij Zon", contactName: "Zon", phone: "0612345678", street: "Dorpsstraat 1", postcode: "1234ab", city: "Ergens", kvk: "123" } });
  assert.equal(fout.status, 400); assert.equal(fout.data.field, "kvk");
  assert.equal((await call("PUT", "portal/start/gegevens", { cookie: kz, body: { company: "Bakkerij Zon B.V.", contactName: "Sanne Zon", phone: "0612345678", street: "Dorpsstraat 1", postcode: "1234ab", city: "Ergens", kvk: "12345678" } })).status, 200);
  st = (await call("GET", "portal/state", { cookie: kz })).data;
  assert.equal(st.start.stage, "betalen"); assert.equal(st.start.details.postcode, "1234 AB"); assert.equal(st.customer.company, "Bakkerij Zon B.V.");
  assert.equal((await call("POST", "portal/start/betalen", { cookie: kz, body: {} })).status, 400, "zonder akkoord");
  const pay = await call("POST", "portal/start/betalen", { cookie: kz, body: { akkoord: true } });
  assert.equal(pay.status, 200, JSON.stringify(pay.data)); assert.ok(pay.data.checkoutUrl);
  // informatie kan pas na betaling
  assert.equal((await call("PUT", "portal/start/informatie", { cookie: kz, body: { omschrijving: "x" } })).status, 400);
  // Mollie meldt: betaald
  const { one } = await import("../netlify/lib/core.mjs");
  const pid = (await one("SELECT mollie_payment_id FROM payments WHERE customer_id = $1 AND kind = 'eerste' ORDER BY id DESC LIMIT 1", [cid])).mollie_payment_id;
  __fake.payments[pid].status = "paid"; __fake.payments[pid].mandateId = "mdt_1"; __fake.payments[pid].paidAt = new Date().toISOString();
  const voor = captured.length;
  assert.equal((await call("POST", "mollie/webhook", { form: new URLSearchParams({ id: pid }), csrf: false, headers: { "content-type": "application/x-www-form-urlencoded" } })).status, 200);
  assert.ok(captured.slice(voor).some((m) => m.to === "zon@bakkerij.test" && /lever nu je informatie aan/i.test(m.subject)));
  let ov = (await call("GET", "hq/overview", { cookie: admin })).data;
  const sk = ov.starters.find((x) => x.id === cid);
  assert.equal(sk.stage, "informatie"); assert.equal(ov.counts.te_bouwen, 1);
  // bestanden: logo erbij, ander klant kan hem niet zien
  const fd = new FormData(); fd.set("kind", "logo"); fd.set("file", new Blob([png], { type: "image/png" }), "logo.png");
  const up = await call("POST", "portal/start/bestanden", { cookie: kz, form: fd });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal((await call("GET", `portal/start/bestanden/${up.data.file.id}`, { cookie: k2 })).status, 404);
  assert.equal((await call("GET", `portal/start/bestanden/${up.data.file.id}`, { cookie: kz })).status, 200);
  // concept opslaan, dan versturen met ontbrekend veld, dan goed
  assert.equal((await call("PUT", "portal/start/informatie", { cookie: kz, body: { omschrijving: "Bakkerij", verstuur: false } })).status, 200);
  const mis = await call("PUT", "portal/start/informatie", { cookie: kz, body: { omschrijving: "Bakkerij", verstuur: true } });
  assert.equal(mis.status, 400); assert.equal(mis.data.field, "omschrijving");
  const ok = await call("PUT", "portal/start/informatie", { cookie: kz, body: { omschrijving: "Ambachtelijke bakkerij in het dorp, al 30 jaar.", diensten: "Brood\nTaart", sitePhone: "0612345678", stijl: "natuur", verstuur: true } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  st = (await call("GET", "portal/state", { cookie: kz })).data;
  assert.equal(st.start.stage, "bouwen"); assert.ok(st.start.dueAt);
  const hq = (await call("GET", `hq/customers/${cid}`, { cookie: admin })).data;
  assert.equal(hq.start.stage, "bouwen"); assert.equal(hq.start.files.length, 1); assert.equal(hq.start.intake.stijl, "natuur"); assert.ok(hq.start.termsAt);
  assert.equal((await call("GET", `hq/customers/${cid}/bestanden/${up.data.file.id}`, { cookie: admin })).status, 200);
  // na versturen kan er niets meer bij
  assert.equal((await call("POST", "portal/start/bestanden", { cookie: kz, form: fd })).status, 400);
});
await test("bestaande klanten zien geen startflow", async () => {
  const st = (await call("GET", "portal/state", { cookie: k2 })).data;
  assert.equal(st.start, null);
  assert.equal((await call("PUT", "portal/start/gegevens", { cookie: k2, body: {} })).status, 400);
});

console.log(`\n${passed} tests geslaagd.`);
await closeDb();
await db.stop().catch(() => {});
process.exit(0);
