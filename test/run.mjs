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
  await call("POST", "hq/medewerkers", { cookie: admin, body: { email: "medewerker@sitemaker.test", role: "medewerker" } });
  const mw = await login("medewerker@sitemaker.test", "hq");
  assert.equal((await call("PUT", "hq/settings", { cookie: mw, body: { notify: { email: "a@b.test" } } })).status, 403);
  assert.equal((await call("POST", "hq/medewerkers", { cookie: mw, body: { email: "x@y.test" } })).status, 403);
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

console.log("Subdomeinen");
await test("links in mails volgen PORTAL_URL en HQ_URL", async () => {
  const { portalUrl, hqUrl } = await import("../netlify/lib/core.mjs");
  assert.equal(portalUrl(), "https://sitemaker.test/portaal/"); assert.equal(hqUrl(), "https://sitemaker.test/hq/");
  process.env.PORTAL_URL = "https://mijn.sitemaker.nl/"; process.env.HQ_URL = "https://hq.sitemaker.nl";
  try {
    assert.equal(portalUrl(), "https://mijn.sitemaker.nl/"); assert.equal(hqUrl(), "https://hq.sitemaker.nl/");
    const voor = captured.length;
    const r = await call("POST", `hq/customers/${c2}/welcome`, { cookie: admin, body: {} });
    assert.equal(r.status, 200);
    const m = captured.slice(voor).find((x) => x.to === "piet@twee.test");
    assert.ok(m.text.includes("https://mijn.sitemaker.nl/") && !m.text.includes("/portaal/"), m.text);
  } finally { delete process.env.PORTAL_URL; delete process.env.HQ_URL; }
});

console.log("Agenda (kennismaking boeken)");
{
  const { q: dbq } = await import("../netlify/lib/core.mjs");
  const heleWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [["00:00", "23:30"]]]));
  const reset = () => dbq("UPDATE appointments SET ip_hash = 'oud', email = email || '.oud' WHERE source = 'agenda' OR ip_hash <> 'oud'");
  let slotA, slotB, tok;
  await test("HQ stelt beschikbaarheid in; de website toont vrije momenten", async () => {
    await reset();
    const r = await call("PUT", "hq/agenda/instellingen", { cookie: admin, body: { actief: true, duur: 15, interval: 30, minUren: 1, dagenVooruit: 7, maxPerDag: 0, soort: "telefoon", week: heleWeek } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const s = await call("GET", "agenda/slots");
    assert.equal(s.status, 200); assert.equal(s.data.actief, true); assert.ok(s.data.days.length >= 6);
    const alle = s.data.days.flatMap((d) => d.times);
    assert.ok(alle.every((t) => Date.parse(t.start) > Date.now() + 3600000 - 60000), "niets binnen de minimale aanlooptijd");
    slotA = s.data.days[1].times[3].start; slotB = s.data.days[1].times[4].start;
    assert.equal(Date.parse(slotB) - Date.parse(slotA), 30 * 60000);
    assert.equal((await call("PUT", "hq/agenda/instellingen", { cookie: k2, body: {} })).status, 403);
  });
  await test("boeken: bevestiging met agenda-uitnodiging, dubbel boeken kan niet", async () => {
    const voor = captured.length;
    const fout = await call("POST", "agenda/boek", { body: { start: slotA, name: "A", company: "", email: "x", phone: "" } });
    assert.equal(fout.status, 400); assert.ok(fout.data.errors.phone && fout.data.errors.email);
    const r = await call("POST", "agenda/boek", { body: { start: slotA, name: "Eva de Boer", company: "Kapsalon Eva", email: "eva@kapsalon.test", phone: "06 1234 5678", message: "Heb nog geen site" } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); tok = r.data.token;
    const m = captured.slice(voor).find((x) => x.to === "eva@kapsalon.test");
    assert.ok(m && /Je kennismaking met Sitemaker/.test(m.subject));
    assert.ok(m.attachments?.[0]?.content.includes("BEGIN:VEVENT") && m.attachments[0].content.includes("DTSTART:"));
    assert.ok(m.text.includes("/api/agenda/annuleren?t=" + tok));
    const dubbel = await call("POST", "agenda/boek", { body: { start: slotA, name: "Piet", company: "Piet BV", email: "piet@bv.test", phone: "0612345678" } });
    assert.equal(dubbel.status, 409); assert.equal(dubbel.data.slotGone, true);
    const nep = await call("POST", "agenda/boek", { body: { start: new Date(Date.parse(slotA) + 7 * 60000).toISOString(), name: "Piet", company: "Piet BV", email: "piet@bv.test", phone: "0612345678" } });
    assert.equal(nep.status, 409, "alleen echte momenten");
    const s = await call("GET", "agenda/slots");
    assert.ok(!s.data.days.flatMap((d) => d.times).some((t) => t.start === slotA), "geboekt moment is weg");
    const lijst = (await call("GET", "hq/appointments", { cookie: admin })).data.appointments;
    assert.equal(lijst[0].company, "Kapsalon Eva"); assert.equal(lijst[0].startsAt && Date.parse(lijst[0].startsAt), Date.parse(slotA));
  });
  await test("klant annuleert via de link; moment komt weer vrij", async () => {
    const ics = await call("GET", "agenda/ics?t=" + tok);
    assert.equal(ics.status, 200); assert.ok(String(ics.data).includes("Kennismaking Sitemaker"));
    const pagina = await call("GET", "agenda/annuleren?t=" + tok);
    assert.ok(String(pagina.data).includes("Ja, annuleer"));
    const r = await call("POST", "agenda/annuleren?t=" + tok, { csrf: false, form: new URLSearchParams({}), headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.ok(String(r.data).includes("geannuleerd"));
    const s = await call("GET", "agenda/slots");
    assert.ok(s.data.days.flatMap((d) => d.times).some((t) => t.start === slotA));
    assert.equal((await call("GET", "agenda/annuleren?t=onzin-onzin-onzin-onzin")).status, 200);
  });
  await test("HQ zet een slot dicht en weer open, en neemt een dag vrij", async () => {
    assert.equal((await call("POST", "hq/agenda/slot", { cookie: admin, body: { start: slotB, dicht: true } })).status, 200);
    let s = (await call("GET", "agenda/slots")).data;
    assert.ok(!s.days.flatMap((d) => d.times).some((t) => t.start === slotB));
    assert.equal((await call("POST", "hq/agenda/slot", { cookie: admin, body: { start: slotB, dicht: false } })).status, 200);
    s = (await call("GET", "agenda/slots")).data;
    assert.ok(s.days.flatMap((d) => d.times).some((t) => t.start === slotB));
    const dag = s.days[2].date;
    const vrij = await call("POST", "hq/agenda/uitzondering", { cookie: admin, body: { kind: "dicht", van: dag, tot: dag, note: "Vrij" } });
    assert.equal(vrij.status, 200, JSON.stringify(vrij.data));
    s = (await call("GET", "agenda/slots")).data;
    assert.ok(!s.days.some((d) => d.date === dag), "vrije dag niet boekbaar");
    const hq = (await call("GET", "hq/agenda", { cookie: admin })).data;
    assert.ok(hq.exceptions.some((e) => e.note === "Vrij")); assert.ok(hq.days.find((d) => d.date === dag).dicht);
    assert.match(hq.feedUrl, /feed\.ics\?k=[0-9a-f]{32}$/);
    // ene slot op die vrije dag toch openzetten
    const los = hq.days.find((d) => d.date === dag).slots[5].start;
    await call("POST", "hq/agenda/slot", { cookie: admin, body: { start: los, dicht: false } });
    s = (await call("GET", "agenda/slots")).data;
    assert.deepEqual(s.days.find((d) => d.date === dag)?.times.map((t) => t.start), [los]);
    await call("DELETE", `hq/agenda/uitzondering/${vrij.data.id}`, { cookie: admin });
  });
  await test("agenda-abonnement alleen met de juiste sleutel; HQ annuleert met mail", async () => {
    const r = await call("POST", "agenda/boek", { body: { start: slotB, name: "Tom", company: "Schilder Tom", email: "tom@schilder.test", phone: "0612345678" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const url = (await call("GET", "hq/agenda", { cookie: admin })).data.feedUrl;
    const f = await call("GET", url.slice(url.indexOf("agenda/")));
    assert.equal(f.status, 200); assert.ok(String(f.data).includes("Schilder Tom") && String(f.data).includes("0612345678"));
    assert.equal((await call("GET", "agenda/feed.ics?k=" + "0".repeat(32))).status, 404);
    const id = (await call("GET", "hq/appointments", { cookie: admin })).data.appointments.find((a) => a.company === "Schilder Tom").id;
    const voor = captured.length;
    assert.equal((await call("POST", `hq/appointments/${id}/annuleren`, { cookie: admin, body: {} })).status, 200);
    assert.ok(captured.slice(voor).some((x) => x.to === "tom@schilder.test" && /gaat niet door/.test(x.subject)));
  });
  await test("online boeken uit: geen momenten en boeken geweigerd", async () => {
    await call("PUT", "hq/agenda/instellingen", { cookie: admin, body: { actief: false, week: heleWeek } });
    const s = (await call("GET", "agenda/slots")).data;
    assert.equal(s.actief, false); assert.equal(s.days.length, 0);
    assert.equal((await call("POST", "agenda/boek", { body: { start: slotB, name: "Tom", company: "Schilder Tom", email: "tom2@schilder.test", phone: "0612345678" } })).status, 400);
    await call("PUT", "hq/agenda/instellingen", { cookie: admin, body: { actief: true } });
  });
}

console.log("Concept-websites voor leads");
{
  const { q: dbq } = await import("../netlify/lib/core.mjs");
  const pngVan = (w, h, n) => { const b = Buffer.alloc(64 + n); Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[40 + n % 20] = n; return b; };
  const SITE = `<!doctype html><html><head><title>Bakkerij Zon</title><link rel="stylesheet" href="/stijl.css"><meta property="og:image" content="/img/winkel.png"></head><body>
    <img src="/img/logo-zon.png" alt="Bakkerij Zon logo"><h1>Welkom bij Bakkerij Zon</h1><p>Ambachtelijke bakker in Utrecht sinds jaar en dag. Wij bakken elke dag vers brood, taarten en koekjes met biologisch meel.</p>
    <p>Bestel uw taart voor verjaardag of bruiloft. Ook glutenvrij brood op bestelling.</p><img src="/img/brood.png" alt="Vers brood"><img src="/img/icon-klein.png">
    <a href="/over-ons">Over ons</a><p>Bel ons: 030 123 45 67 of mail info@bakkerij-zon.test</p><p>Openingstijden: maandag t/m zaterdag 07:00 - 18:00</p><footer>© 2016 Bakkerij Zon</footer></body></html>`;
  const OVER = `<html><body><h1>Over ons</h1><p>Bakkerij Zon is een familiebedrijf. Bakker Jan staat elke nacht om vier uur in de bakkerij om alles vers te bakken voor de buurt.</p></body></html>`;
  const echteFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    const u = String(url);
    if (!u.startsWith("https://bakkerij-zon.test") && !u.startsWith("https://webwinkel.test")) return echteFetch(url, opt);
    const r = (body, type) => new Response(body, { status: 200, headers: { "content-type": type } });
    const pad = new URL(u).pathname;
    if (u.startsWith("https://webwinkel.test")) return r(`<html><body><h1>Webwinkel</h1><p>${"Bestel online schoenen en tassen, gratis verzending, in winkelmand. ".repeat(10)}</p></body></html>`, "text/html");
    if (pad === "/" ) return r(SITE, "text/html; charset=utf-8");
    if (pad === "/over-ons") return r(OVER, "text/html");
    if (pad === "/stijl.css") return r("body{color:#333} .knop{background:#c8102e} h1{color:#c8102e} a{color:#f5a623}", "text/css");
    if (pad === "/img/winkel.png") return r(pngVan(1600, 1000, 1), "image/png");
    if (pad === "/img/brood.png") return r(pngVan(1200, 900, 2), "image/png");
    if (pad === "/img/logo-zon.png") return r(pngVan(300, 100, 3), "image/png");
    if (pad === "/img/icon-klein.png") return r(pngVan(64, 64, 4), "image/png");
    return new Response("nee", { status: 404 });
  };
  const vorigeAi = globalThis.__aiFake;
  globalThis.__aiFake = (x) => {
    if (!/Huisstijlkleuren/.test(x.prompt)) return vorigeAi(x);
    if (/webwinkel/i.test(x.prompt)) return JSON.stringify({ kan: false, reden: "Dit is een webshop." });
    const fotos = [...x.prompt.matchAll(/afbeeldingen\/(foto-\d+\.png)/g)].map((m) => "afbeeldingen/" + m[1]);
    return "```json\n" + JSON.stringify({ kan: true, content: {
      thema: "natuur", kleuren: { primair: "#c8102e", accent: "nietgeldig" },
      bedrijf: { naam: "Bakkerij Zon", telefoon: "030 123 45 67", email: "info@bakkerij-zon.test", whatsapp: "06 99999999", adres: "Verzonnen straat 1", plaats: "Utrecht" },
      seo: { titel: "Bakkerij Zon | Ambachtelijke bakker in Utrecht", omschrijving: "Elke dag vers brood en taart." },
      hero: { titel: "Elke dag vers, met liefde gebakken", tekst: "Brood, taart en koekjes van biologisch meel.", knop: { tekst: "Bestel een taart" }, foto: fotos[0] || "" },
      diensten: { titel: "Uit onze bakkerij", items: [{ titel: "Vers brood", tekst: "Elke ochtend vers.", prijs: "€ 99" }, { titel: "Taarten", tekst: "Voor verjaardag en bruiloft." }, { titel: "Glutenvrij", tekst: "Op bestelling." }] },
      over: { titel: "Over ons", tekst: "Een familiebedrijf. Bakker Jan bakt elke nacht vers voor de buurt.", foto: fotos[1] || "afbeeldingen/bestaat-niet.jpg" },
      fotos: [], openingstijden: [{ dag: "Maandag t/m zaterdag", tijd: "07:00 - 18:00" }, { dag: "Zondag", tijd: "10:00 - 14:00" }],
      contact: { titel: "Bestel of kom langs", tekst: "Bel of mail ons." } } }) + "\n```";
  };
  let lead, token;
  await test("concept: agent bekijkt de site, Claude maakt een eerlijk concept", async () => {
    const r = await call("POST", "hq/leads", { cookie: admin, body: { company: "Bakkerij Zon", email: "info@bakkerij-zon.test", website: "https://bakkerij-zon.test/", city: "Utrecht", category: "bakker" } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); lead = r.data.lead.id;
    const g = await call("POST", `hq/leads/${lead}/concept`, { cookie: admin, body: {} });
    assert.equal(g.status, 200, JSON.stringify(g.data));
    const l = (await call("GET", "hq/leads?status=nieuw", { cookie: admin })).data.leads.find((x) => x.id === lead);
    assert.equal(l.concept.status, "klaar", JSON.stringify(l.concept));
    assert.equal(l.concept.fotos, 2, "twee echte foto's, icoon te klein");
    assert.ok(l.concept.punten.some((p) => /2016/.test(p)) && l.concept.punten.some((p) => /mobiel/.test(p)));
    token = l.concept.url.split("/voorbeeld/")[1];
    const { one: dbone } = await import("../netlify/lib/core.mjs");
    const c = (await dbone("SELECT content FROM concepts WHERE lead_id = $1", [lead])).content;
    assert.equal(c.bedrijf.telefoon, "030 123 45 67"); assert.equal(c.bedrijf.email, "info@bakkerij-zon.test");
    assert.equal(c.bedrijf.whatsapp, "", "verzonnen WhatsApp eruit"); assert.equal(c.bedrijf.adres, "", "verzonnen adres eruit");
    assert.equal(c.diensten.items[0].prijs, "", "verzonnen prijs eruit"); assert.equal(c.openingstijden.length, 0, "verzonnen zondag = alle tijden eruit");
    assert.equal(c.kleuren.primair, "#c8102e"); assert.equal(c.kleuren.accent, "");
    assert.match(c.bedrijf.logo, /^afbeeldingen\/logo\.png$/); assert.ok(!JSON.stringify(c).includes("bestaat-niet"));
  });
  await test("concept-pagina: noindex, eigen foto's, balk en knop naar de kennismaking", async () => {
    const p = await call("GET", "voorbeeld/" + token);
    assert.equal(p.status, 200); const h = String(p.data);
    assert.ok(h.includes("noindex") && h.includes("Zo kan de nieuwe website van Bakkerij Zon eruitzien") && h.includes(`/api/voorbeeld/${token}/afbeeldingen/foto-1.png`));
    assert.ok(h.includes(`?concept=${token}&bedrijf=Bakkerij%20Zon#kennismaking`) && h.includes("/gezien"));
    assert.ok(!String((await call("GET", "voorbeeld/" + token + "?hq=1")).data).includes("/gezien"), "HQ telt niet mee");
    const img = await call("GET", `voorbeeld/${token}/afbeeldingen/foto-1.png`, { raw: true });
    assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/png");
    assert.notEqual((await call("GET", `voorbeeld/${token}/afbeeldingen/../../x`, { raw: true })).headers.get("content-type"), "image/png");
    assert.equal((await call("GET", `voorbeeld/${token}/afbeeldingen/bestaat-niet.png`, { raw: true })).status, 404);
    assert.ok(String((await call("GET", "voorbeeld/onbekend12345")).data).includes("niet (meer) beschikbaar"));
  });
  await test("mail bevat de conceptlink; bekeken geeft een seintje", async () => {
    const pv = (await call("GET", `hq/leads/${lead}/preview?kind=eerste`, { cookie: admin })).data;
    assert.ok(pv.body.includes(`/voorbeeld/${token}`) && pv.body.indexOf("eerste opzet") < pv.body.indexOf("Ik ben"), pv.body);
    const voor = captured.length;
    assert.equal((await call("POST", `voorbeeld/${token}/gezien`, { body: {} })).status, 200);
    await call("POST", `voorbeeld/${token}/gezien`, { body: {} });
    const { q: q2 } = await import("../netlify/lib/core.mjs");
    assert.equal((await q2("SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'concept.bekeken'"))[0].n, 1, "één seintje");
    const lijst = (await call("GET", "hq/leads?status=bekeken", { cookie: admin })).data;
    assert.equal(lijst.counts.bekeken, 1); assert.equal(lijst.leads[0].concept.views, 2);
    assert.equal((await call("PUT", `hq/leads/${lead}/concept`, { cookie: admin, body: { thema: "zacht" } })).status, 200);
    assert.ok(String((await call("GET", "voorbeeld/" + token + "?hq=1")).data).includes("#22C3B5"));
  });
  await test("afspraak vanuit het concept koppelt de lead; website aanmaken start vanuit het concept", async () => {
    await dbq("UPDATE appointments SET ip_hash = 'oud'");
    const s = (await call("GET", "agenda/slots")).data;
    const start = s.days[3].times[0].start;
    const r = await call("POST", "agenda/boek", { body: { start, name: "Jan Zon", company: "Bakkerij Zon", email: "jan.prive@zon.test", phone: "0612345678", concept: token } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const appt = (await call("GET", "hq/appointments", { cookie: admin })).data.appointments.find((a) => a.email === "jan.prive@zon.test");
    const l = (await call("GET", "hq/leads?status=afspraak", { cookie: admin })).data.leads.find((x) => x.id === lead);
    assert.ok(l, "lead staat op afspraak");
    const k = await call("POST", "hq/customers", { cookie: admin, body: { company: "Bakkerij Zon", email: "jan.prive@zon.test", appointmentId: appt.id } });
    assert.equal(k.status, 200, JSON.stringify(k.data));
    const site = await call("POST", `hq/customers/${k.data.customer.id}/site`, { cookie: admin, body: {} });
    assert.equal(site.status, 200, JSON.stringify(site.data)); assert.equal(site.data.bron, "concept");
    const repo = __ghFake.repos[site.data.repo];
    const files = repo.commits[repo.refs.main].files;
    const content = JSON.parse(files["content.json"]);
    assert.equal(content.hero.titel, "Elke dag vers, met liefde gebakken"); assert.equal(content.thema, "zacht");
    assert.ok(files["afbeeldingen/foto-1.png"] && files["afbeeldingen/logo.png"] && files["render.mjs"] && !files["afbeeldingen/hero.jpg"]);
  });
  await test("webshops slaat de agent over; afmelden haalt het concept weg", async () => {
    const r = await call("POST", "hq/leads", { cookie: admin, body: { company: "Webwinkel", email: "info@webwinkel.test", website: "https://webwinkel.test/" } });
    await call("POST", `hq/leads/${r.data.lead.id}/concept`, { cookie: admin, body: {} });
    const l = (await call("GET", "hq/leads?status=nieuw", { cookie: admin })).data.leads.find((x) => x.id === r.data.lead.id);
    assert.equal(l.concept.status, "overgeslagen"); assert.match(l.concept.reden, /webshop/i);
    assert.equal((await call("POST", "hq/leads/action", { cookie: admin, body: { action: "afmelden", ids: [lead] } })).status, 200);
    assert.ok(String((await call("GET", "voorbeeld/" + token)).data).includes("niet (meer) beschikbaar"));
  });
  await test("tick zet nieuwe leads met een website automatisch in de wachtrij (binnen de daglimiet)", async () => {
    const { runConcepts } = await import("../netlify/lib/concepts.mjs");
    await call("POST", "hq/leads", { cookie: admin, body: { company: "Slagerij Twee", email: "info@slagerij-twee.test", website: "https://slagerij-twee.test/" } });
    const r = await runConcepts({ max: 2 });
    assert.ok(r.started >= 1, JSON.stringify(r));
  });
  globalThis.fetch = echteFetch; globalThis.__aiFake = vorigeAi;
}

console.log("Bedrijf (afdelingen, briefings, vragen)");
{
  const vorigeAi2 = globalThis.__aiFake;
  globalThis.__aiFake = ({ system, prompt }) => /Vraag van Maxim/.test(prompt) ? "Deze maand: zie de cijfers. Voor jou: niets." : /directiebriefing/.test(prompt) ? "Het bedrijf draait.\nVandaag voor jou:\n- Concepten beoordelen" : /ochtendbriefing/.test(prompt) ? "Alles loopt.\nVoor jou: niets." : vorigeAi2({ system, prompt });
  await test("HQ toont per afdeling cijfers, teamstatus en logboek uit echte gegevens", async () => {
    const r = await call("GET", "hq/team", { cookie: admin });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    for (const k of ["b2b", "projecten", "klantenservice", "incidenten", "finance", "marketing", "directie"]) assert.ok(r.data.depts[k], k);
    assert.ok(r.data.depts.b2b.people.conceptmaker.text && r.data.depts.finance.metrics.some((m) => /MRR/.test(m.label)));
    assert.ok(r.data.feed.some((f) => f.wie === "Sam"), "logboek bevat echte concepten");
    assert.ok(r.data.feed.some((f) => f.wie === "Ruben"), "logboek bevat afspraken");
    assert.equal((await call("GET", "hq/team", { cookie: k2 })).status, 403);
  });
  await test("briefings van managers en directeur; vraag aan een manager", async () => {
    assert.equal((await call("POST", "hq/team/briefings", { cookie: admin })).status, 200);
    const r = (await call("GET", "hq/team", { cookie: admin })).data;
    assert.match(r.depts.directie.briefing.text, /Vandaag voor jou/); assert.equal(r.depts.b2b.briefing.ai, true);
    const v = await call("POST", "hq/team/vraag", { cookie: admin, body: { dept: "finance", vraag: "Hoeveel hebben we deze maand verdiend?" } });
    assert.equal(v.status, 200, JSON.stringify(v.data));
    const lijst = (await call("GET", "hq/team/vragen?dept=finance", { cookie: admin })).data.vragen;
    assert.equal(lijst[0].status, "klaar"); assert.match(lijst[0].antwoord, /Voor jou/);
    assert.equal((await call("POST", "hq/team/vraag", { cookie: admin, body: { dept: "finance", vraag: "" } })).status, 400);
  });
  await test("hartslag: wie net echt werk deed staat op 'bezig'", async () => {
    const { pulse } = await import("../netlify/lib/team.mjs");
    await pulse("research", { done: 0 });
    let r = (await call("GET", "hq/team", { cookie: admin })).data;
    const voor = r.busy.researcher;
    await pulse("research", { done: 2 });
    r = (await call("GET", "hq/team", { cookie: admin })).data;
    assert.equal(r.busy.researcher, true); assert.equal(voor, false);
  });
  globalThis.__aiFake = vorigeAi2;
}

console.log("Domeinen, klantvragen, reviews, opzeggen en kosten");
{
  process.env.DOMAIN_FAKE = "1";
  const ka = await login("jan@een.test", "portaal"), kb = await login("piet@twee.test", "portaal");
  await test("klant kiest domein zelf houden: instructies, controle en actief", async () => {
    let st = (await call("GET", "portal/state", { cookie: kb })).data;
    assert.equal(st.domeinGekozen, false);
    assert.equal((await call("POST", "portal/domein", { cookie: kb, body: { keuze: "eigen", naam: "https://www.TweeBedrijf.nl/" } })).status, 200);
    let a = (await call("GET", "portal/account", { cookie: kb })).data;
    assert.equal(a.domein.domein.naam, "tweebedrijf.nl"); assert.equal(a.domein.domein.keuze, "eigen");
    const c = await call("POST", "portal/domein/check", { cookie: kb });
    assert.equal(c.status, 200, JSON.stringify(c.data)); assert.ok(c.data.domein.dnsOk);
    st = (await call("GET", "portal/state", { cookie: kb })).data; assert.equal(st.domeinGekozen, true);
    const lijst = (await call("GET", "hq/domeinen", { cookie: admin })).data.domeinen;
    assert.ok(lijst.some((d) => d.naam === "tweebedrijf.nl"));
    assert.equal((await call("GET", "hq/domeinen", { cookie: kb })).status, 403);
  });
  await test("nieuw domein: bezet wordt geweigerd, ander klant kan hetzelfde domein niet claimen", async () => {
    assert.equal((await call("POST", "portal/domein", { cookie: ka, body: { keuze: "nieuw", naam: "bezet-bedrijf.nl" } })).status, 409);
    assert.equal((await call("POST", "portal/domein", { cookie: ka, body: { keuze: "eigen", naam: "tweebedrijf.nl" } })).status, 409);
    const r = await call("POST", "portal/domein", { cookie: ka, body: { keuze: "verhuizen", naam: "eenbedrijf.nl", provider: "TransIP", verhuiscode: "ABC123" } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.domein.status, "verhuizen");
    const d = (await call("GET", "hq/domeinen", { cookie: admin })).data.domeinen.find((x) => x.naam === "eenbedrijf.nl");
    assert.equal(d.verhuiscode, "ABC123");
    assert.equal((await call("PUT", "hq/domeinen/" + d.id, { cookie: admin, body: { status: "aangevraagd", verlooptOp: "2027-10-01" } })).status, 200);
  });
  await test("klantvraag via portaal: Emma zet antwoord klaar, Maxim verstuurt, klant ziet het", async () => {
    const vorige = globalThis.__aiFake;
    globalThis.__aiFake = ({ system, prompt }) => /Emma van de klantenservice/.test(system) ? "Hoi Jan, dat kan via het portaal.\n\nGroet, Sitemaker" : vorige({ system, prompt });
    assert.equal((await call("POST", "portal/vragen", { cookie: ka, body: { onderwerp: "", tekst: "x" } })).status, 400);
    const r = await call("POST", "portal/vragen", { cookie: ka, body: { onderwerp: "Logo vervangen?", tekst: "Kan ik mijn logo ook zelf vervangen?" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    let t = (await call("GET", "hq/service", { cookie: admin })).data.tickets[0];
    assert.equal(t.conceptStatus, "klaar"); assert.match(t.concept, /Groet, Sitemaker/);
    const n0 = captured.length;
    assert.equal((await call("POST", `hq/service/${t.id}/antwoord`, { cookie: admin, body: { tekst: t.concept } })).status, 200);
    assert.ok(captured.slice(n0).some((m) => m.to === "jan@een.test" && /Re: Logo vervangen/.test(m.subject)));
    const eigen = (await call("GET", "portal/account", { cookie: ka })).data.vragen;
    assert.equal(eigen[0].status, "beantwoord"); assert.equal(eigen[0].berichten.length, 2);
    assert.equal((await call("GET", "portal/account", { cookie: kb })).data.vragen.length, 0, "andere klant ziet het niet");
    assert.equal((await call("POST", `portal/vragen/${t.id}`, { cookie: kb, body: { tekst: "hack" } })).status, 404);
    globalThis.__aiFake = vorige;
  });
  await test("mail van een klant wordt een klantvraag (en niet dubbel)", async () => {
    const { ticketFromMail } = await import("../netlify/lib/service.mjs");
    const t = await ticketFromMail({ from: "piet@twee.test", subject: "Factuur vraag", body: "Klopt mijn factuur?", messageId: "<m1@twee.test>" });
    assert.ok(t);
    assert.equal(await ticketFromMail({ from: "piet@twee.test", subject: "Factuur vraag", body: "Klopt mijn factuur?", messageId: "<m1@twee.test>" }), null);
    await ticketFromMail({ from: "piet@twee.test", subject: "Re: Factuur vraag", body: "Nog een aanvulling", messageId: "<m2@twee.test>" });
    assert.equal((await q("SELECT COUNT(*)::int AS n FROM ticket_messages WHERE ticket_id = $1", [t.id]))[0].n, 2);
    assert.equal(await ticketFromMail({ from: "onbekend@x.test", subject: "Hoi", body: "spam", messageId: "<m3@x.test>" }), null);
  });
  await test("review: alleen met live site, één keer, eerst verborgen", async () => {
    assert.equal((await call("GET", "portal/account", { cookie: kb })).data.review.kan, false);
    assert.equal((await call("POST", "portal/review", { cookie: kb, body: { rating: 5, tekst: "Heel goed gedaan allemaal!", naam: "Piet", toestemming: true } })).status, 400);
    assert.equal((await call("POST", "portal/review", { cookie: ka, body: { rating: 5, tekst: "Heel goed gedaan allemaal!", naam: "Jan", toestemming: false } })).status, 400);
    const r = await call("POST", "portal/review", { cookie: ka, body: { rating: 5, titel: "Snel", tekst: "Heel goed gedaan allemaal, binnen twee dagen online.", naam: "Jan", toestemming: true } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.gedaan.gepubliceerd, false);
    assert.equal((await call("POST", "portal/review", { cookie: ka, body: { rating: 4, tekst: "Nog een keer proberen dan maar", naam: "Jan", toestemming: true } })).status, 409);
    const pub = (await call("GET", "reviews")).data;
    assert.ok(!JSON.stringify(pub).includes("binnen twee dagen online"), "niet automatisch op de website");
    assert.ok((await call("GET", "hq/reviews", { cookie: admin })).data.reviews.some((x) => x.uitPortaal));
  });
  await test("opzeggen: reden + bedrijfsnaam verplicht, einddatum, intrekken, afronden", async () => {
    const { opzegEinde, runCancellations } = await import("../netlify/lib/service.mjs");
    assert.equal(opzegEinde(new Date("2027-03-10T10:00:00Z")), "2027-04-30");
    assert.equal(opzegEinde(new Date("2027-12-31T23:30:00Z")), "2028-02-29", "in Amsterdam is het dan al 1 januari");
    assert.equal((await call("POST", "portal/opzeggen", { cookie: ka, body: { reden: "te_duur", akkoord: true, bevestig: "verkeerd" } })).status, 400);
    assert.equal((await call("POST", "portal/opzeggen", { cookie: ka, body: { reden: "", akkoord: true, bevestig: "Testklant Een" } })).status, 400);
    assert.equal((await call("POST", "portal/opzeggen", { cookie: ka, body: { reden: "te_duur", akkoord: false, bevestig: "Testklant Een" } })).status, 400);
    assert.equal((await call("POST", "portal/opzeggen/bel-me", { cookie: ka, body: { reden: "te_duur" } })).status, 200);
    assert.ok((await q("SELECT 1 FROM tickets WHERE bron = 'opzeggen'")).length);
    const r = await call("POST", "portal/opzeggen", { cookie: ka, body: { reden: "te_duur", toelichting: "Even geen budget", akkoord: true, bevestig: "testklant een " } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, "aangevraagd");
    assert.ok(captured.some((m) => m.to === "jan@een.test" && /opzegging/i.test(m.subject)));
    assert.equal((await call("GET", "portal/state", { cookie: ka })).data.opzegging, r.data.einde);
    assert.equal((await call("POST", "portal/opzeggen/intrekken", { cookie: ka })).status, 200);
    assert.equal((await call("POST", "portal/opzeggen", { cookie: ka, body: { reden: "anders", akkoord: true, bevestig: "Testklant Een" } })).status, 200);
    await q("UPDATE customers SET opzeg_einde = CURRENT_DATE - 1 WHERE id = $1", [c1]);
    assert.equal((await runCancellations()).done, 1);
    const [c] = await q("SELECT opzeg_status, site_status FROM customers WHERE id = $1", [c1]);
    assert.equal(c.opzeg_status, "afgerond"); assert.equal(c.site_status, "opgezegd");
    assert.equal((await call("POST", `hq/customers/${c1}/opzegging/intrekken`, { cookie: admin })).status, 400);
  });
  await test("kosten invullen, winst per maand en export voor de boekhouder", async () => {
    assert.equal((await call("POST", "hq/kosten", { cookie: admin, body: { omschrijving: "Netlify", bedrag: "", datum: "2026-01-01" } })).status, 400);
    const vandaag = new Date().toISOString().slice(0, 10);
    assert.equal((await call("POST", "hq/kosten", { cookie: admin, body: { omschrijving: "Netlify Pro", leverancier: "Netlify", categorie: "hosting", soort: "maandelijks", bedrag: "19,00", btw: "0", datum: "2026-01-01" } })).status, 200);
    assert.equal((await call("POST", "hq/kosten", { cookie: admin, body: { omschrijving: "Domein", categorie: "domeinen", soort: "jaarlijks", bedrag: "12,00", btw: "2,52", datum: "2026-01-15" } })).status, 200);
    assert.equal((await call("POST", "hq/kosten", { cookie: admin, body: { omschrijving: "Laptop", categorie: "overig", soort: "eenmalig", bedrag: "1.000,00", btw: "210,00", datum: vandaag } })).status, 200);
    const d = (await call("GET", "hq/kosten", { cookie: admin })).data;
    assert.equal(d.kosten.length, 3); assert.equal(d.vasteKostenPerMaand, 1900 + 100);
    assert.equal(d.huidig.kosten, 1900 + 100000 + (new Date().getUTCMonth() === 0 ? 1200 : 0));
    assert.equal(d.maanden.length, 12);
    const csv = await call("GET", `hq/kosten/export?jaar=${new Date().getFullYear()}&kwartaal=${Math.floor(new Date().getMonth() / 3) + 1}`, { cookie: admin, raw: true });
    assert.equal(csv.status, 200); const txt = await csv.text();
    assert.match(txt, /Inkoop;.*Netlify Pro \(maandelijks\);Hosting;19,00/); assert.match(txt, /Laptop;Overig;1000,00;210,00;1210,00/);
    assert.equal((await call("GET", "hq/kosten/export?jaar=x", { cookie: admin })).status, 400);
    const team = (await call("GET", "hq/team", { cookie: admin })).data;
    assert.ok(team.depts.finance.metrics.some((m) => /vaste kosten/.test(m.label) && /20,00/.test(m.value)));
    assert.ok(team.depts.klantenservice.metrics.some((m) => /klantvragen/.test(m.label)));
    assert.ok((await call("GET", "hq/medewerkers", { cookie: admin })).data.me);
  });
  delete process.env.DOMAIN_FAKE;
}

console.log(`\n${passed} tests geslaagd.`);
await closeDb();
await db.stop().catch(() => {});
process.exit(0);
