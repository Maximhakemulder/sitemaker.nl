// Eén API voor de website, het klantenportaal en Sitemaker HQ.
import crypto from "node:crypto";
import * as domains from "../lib/domains.mjs";
import * as team from "../lib/team.mjs";
import * as concepts from "../lib/concepts.mjs";
import * as taak from "../lib/concepttaak.mjs";
import * as opdrachten from "../lib/opdrachten.mjs";
import * as agenda from "../lib/agenda.mjs";
import * as service from "../lib/service.mjs";
import * as kosten from "../lib/kosten.mjs";
import * as credits from "../lib/credits.mjs";
import { meetVerzoek } from "../lib/credits.mjs";
import { b2bDashboard } from "../lib/b2bstats.mjs";
import * as websites from "../lib/websites.mjs";
import { json, HttpError, fail, escH, publicBase } from "../lib/core.mjs";
import { mailReady } from "../lib/mail.mjs";
import { switchSite, requestCode, verifyCode, loginWithKey, keyLoginOpen, openMode, viewAsCustomer, openPortalAs, currentUser, logout, clearCookie, ipOf, requireCustomer, requireStaff, requireAdmin, isStaff } from "../lib/auth.mjs";
import { portalState, submitChange, changeAttachment, invoicePdf } from "../lib/portal.mjs";
import { saveDetails, startPayment as startPortalPayment, saveIntake, addIntakeFile, deleteIntakeFile, intakeFile } from "../lib/start.mjs";
import { submitAppointment, submitContact } from "../lib/site.mjs";
import { handleExchange, payInvoiceLink } from "../lib/betalen.mjs";
import { checkUnsub, unsubscribe, checkTrack, recordTrack } from "../lib/b2b.mjs";
import { generateInvoicePdf, mailInvoice } from "../lib/billing.mjs";
import { one, q, getSettings } from "../lib/core.mjs";
import * as hq from "../lib/admin.mjs";
import { publishedReviews, listReviews, saveReview, deleteReview } from "../lib/reviews.mjs";

const body = async (req) => { try { return await req.json(); } catch { return {}; } };

// Verzoeken die iets wijzigen moeten van onze eigen pagina's komen.
function sameOrigin(req) {
  if (req.headers.get("x-sm") !== "1") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

function htmlPage(title, text, form = "") {
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escH(title)}</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#E7F4FF;color:#1C0747;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{background:#fff;border-radius:16px;padding:28px;max-width:440px}h1{font-size:22px;margin:0 0 12px}p{line-height:1.5}button{background:#FF5757;color:#1C0747;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:15px;cursor:pointer}</style></head>
<body><main><h1>${escH(title)}</h1><p>${escH(text)}</p>${form}</main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

// Rekentijd meten voor de credit-bewaker (zie credits.mjs).
export default async (req, context) => {
  const t0 = Date.now();
  try { return await verwerk(req, context); }
  finally { const w = meetVerzoek(Date.now() - t0); if (w) { if (context?.waitUntil) context.waitUntil(w); else await w; } }
};

async function verwerk(req, context) {
  const url = new URL(req.url);
  // /voorbeeld/<token> (concept-websites) komt rechtstreeks binnen (config.path), net als /api/voorbeeld/<token>.
  const vb = url.pathname.match(/\/voorbeeld\/(.+)$/);
  const path = (vb ? "voorbeeld/" + vb[1] : url.pathname.replace(/^\/api\/?/, "")).replace(/\/$/, "");
  const seg = path.split("/");
  const m = req.method;
  try {
    // ------------------------------------------------ openbaar, zonder eigen pagina
    // Pay.nl exchange (GET-query, POST-formulier of JSON). We halen de status altijd zelf op; antwoord "TRUE|…".
    if (path === "paynl/exchange" && (m === "POST" || m === "GET")) {
      const velden = Object.fromEntries(url.searchParams);
      if (m === "POST") {
        const ct = req.headers.get("content-type") || "";
        const raw = await req.text().catch(() => "");
        if (/json/.test(ct) || /^\s*\{/.test(raw)) { try { Object.assign(velden, JSON.parse(raw)); } catch {} }
        else Object.assign(velden, Object.fromEntries(new URLSearchParams(raw)));
      }
      try { const r = await handleExchange(velden); return new Response(`TRUE| ${r.status || r.reason || (r.ignored ? "genegeerd" : "ok")}`, { headers: { "content-type": "text/plain" } }); }
      catch (e) { console.log("[paynl exchange]", e.message); return new Response(`FALSE| ${e.message}`.slice(0, 200), { status: 500, headers: { "content-type": "text/plain" } }); }
    }
    // ------------------------------------------------ online kennismaking boeken (openbaar)
    if (path === "agenda/annuleren") {
      const appt = await agenda.apptByToken(url.searchParams.get("t"));
      if (!appt) return htmlPage("Link werkt niet", "Deze link is niet (meer) geldig. Mail ons gerust als je je afspraak wilt verzetten.");
      const wanneer = appt.starts_at ? agenda.momentLabel(new Date(appt.starts_at).getTime(), (await agenda.agendaConfig()).duur) : "";
      if (appt.status === "geannuleerd") return htmlPage("Afspraak geannuleerd", `Je kennismaking van ${wanneer} is geannuleerd. Je kunt altijd een nieuw moment kiezen op onze website.`);
      if (m === "POST") {
        try { await agenda.cancel(appt, "klant"); } catch (e) { return htmlPage("Annuleren lukte niet", e.message); }
        return htmlPage("Afspraak geannuleerd", `Je kennismaking van ${wanneer} is geannuleerd. Wil je een ander moment? Kies er een op onze website.`);
      }
      return htmlPage("Afspraak annuleren?", `Je kennismaking staat op ${wanneer}. Wil je deze afspraak annuleren?`, `<form method="post"><button type="submit">Ja, annuleer mijn afspraak</button></form>`);
    }
    if (path === "agenda/ics" && m === "GET") {
      const ics = await agenda.apptIcs(url.searchParams.get("t"));
      if (!ics) return new Response("Niet gevonden", { status: 404 });
      return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="kennismaking-sitemaker.ics"', "cache-control": "no-store" } });
    }
    if (path === "agenda/feed.ics" && m === "GET") {
      const ics = await agenda.feed(url.searchParams.get("k"));
      if (!ics) return new Response("Niet gevonden", { status: 404 });
      return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    }
    // ------------------------------------------------ concept-websites (sitemaker.nl/voorbeeld/<token>)
    if (seg[0] === "voorbeeld" && m === "GET") {
      if ((seg[2] === "afbeeldingen" || /^a[0-9a-z]{1,12}$/.test(seg[2] || "")) && seg[3] && seg.length === 4) return await concepts.conceptImage(seg[1], seg[3]);
      if (seg.length === 2) return await concepts.conceptPage(seg[1], { hq: url.searchParams.get("hq") === "1" });
    }
    if (path === "bedrijf" && m === "GET") {
      const s = await getSettings(), co = s.company;
      const adres = [co.address, [co.postcode, co.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return json({ naam: co.name || "Sitemaker", rechtsvorm: co.legalName || "", kvk: co.kvk || "", btw: co.vat || "", adres, email: co.email || "", telefoon: co.phone || "",
        pricesIncludeVat: s.billing.pricesIncludeVat, conceptDagen: s.b2b.concepten?.geldigDagen || 30, metaPixelId: s.tracking?.metaPixelId || "" }, 200, { "cache-control": "public, max-age=300" });
    }
    if (path === "agenda/slots" && m === "GET") return json(await agenda.publicSlots(url.searchParams.get("soort") || undefined), 200, { "cache-control": "no-store" });
    // Meten B2B-mail: onzichtbaar plaatje (open) en doorstuurlink (klik). Ondertekend, dus geen open redirect.
    if (path === "t/o" && m === "GET") {
      const p = Object.fromEntries(url.searchParams);
      if (checkTrack(p)) await recordTrack({ ...p, u: undefined, ua: req.headers.get("user-agent") || "" }).catch(() => {});
      return new Response(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"), { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
    }
    if (path === "t/k" && m === "GET") {
      const p = Object.fromEntries(url.searchParams);
      if (!checkTrack(p)) return new Response(null, { status: 302, headers: { location: publicBase(req) + "/" } });
      await recordTrack({ ...p, ua: req.headers.get("user-agent") || "" }).catch(() => {});
      return new Response(null, { status: 302, headers: { location: Buffer.from(p.u, "base64url").toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    }
    if (path === "b2b/afmelden") {
      if (url.searchParams.get("test") === "1") {
        if (m === "POST") return htmlPage("Je bent afgemeld", "Je ontvangt geen berichten meer van Sitemaker op dit adres. (Dit was een test: er is niemand afgemeld.)");
        return htmlPage("Afmelden", "Wil je geen berichten meer van Sitemaker ontvangen?", `<form method="post"><button type="submit">Ja, meld mij af</button></form>`);
      }
      const id = Number(url.searchParams.get("l")), t = url.searchParams.get("t");
      if (!id || !checkUnsub(id, t)) return htmlPage("Link werkt niet", "Deze afmeldlink is niet (meer) geldig. Stuur ons een mail met 'afmelden', dan regelen we het.");
      if (m === "POST") { await unsubscribe(id); return htmlPage("Je bent afgemeld", "Je ontvangt geen berichten meer van Sitemaker op dit adres."); }
      return htmlPage("Afmelden", "Wil je geen berichten meer van Sitemaker ontvangen?", `<form method="post"><button type="submit">Ja, meld mij af</button></form>`);
    }

    if (path === "reviews" && m === "GET") return json(await publishedReviews(), 200, { "cache-control": "public, max-age=300" });

    // ------------------------------------------------ voorbeeld van de echte website (opdracht), via geheime link
    if (seg[0] === "opdracht" && seg[1] && m === "GET") {
      if (seg[2] === "afbeeldingen" && seg[3]) return await opdrachten.afbeelding(0, decodeURIComponent(seg[3]), { token: seg[1] });
      if (seg.length === 2) return await opdrachten.voorbeeld(seg[1], { nonce: crypto.randomBytes(12).toString("base64") });
    }

    // ------------------------------------------------ geplande Claude-taak die concepten ontwerpt (sleutel in x-taak-sleutel)
    if (seg[0] === "taak") {
      taak.checkTaak(req);
      const tid = Number(seg[2]) || 0;
      if (path === "taak/instructies" && m === "GET") return json(taak.instructies());
      if (path === "taak/status" && m === "GET") return json(await taak.status());
      if (path === "taak/claim" && m === "POST") return json(await taak.claim((await body(req)).max));
      if (path === "taak/opdrachten/claim" && m === "POST") return json(await opdrachten.claimOpdrachten((await body(req)).max));
      if (seg[1] === "opdrachten" && tid && seg[3] === "afbeeldingen" && seg[4] && m === "GET") return await opdrachten.afbeelding(tid, decodeURIComponent(seg[4]));
      if (seg[1] === "opdrachten" && tid && !seg[3] && m === "PUT") return json(await opdrachten.opslaan(tid, await body(req)));
      if (seg[1] === "opdrachten" && tid && seg[3] === "afmelden" && m === "POST") return json(await opdrachten.afmelden(tid, await body(req)));
      if (seg[1] === "concepten" && tid && seg[3] === "afbeeldingen" && seg[4] && m === "GET") return await taak.afbeelding(tid, seg[4]);
      if (seg[1] === "concepten" && tid && seg[3] === "stock" && m === "POST") return json(await taak.stockZoeken(tid, (await body(req)).termen));
      if (seg[1] === "concepten" && tid && seg[3] === "kies" && m === "POST") return json(await taak.stockKiezen(tid, (await body(req)).nummers));
      if (seg[1] === "concepten" && tid && seg[3] === "heropen" && m === "POST") return json(await taak.heropen(tid));
      if (seg[1] === "concepten" && tid && seg[3] === "eigen-afbeelding" && m === "POST") return json(await taak.eigenAfbeelding(tid, await body(req)));
      if (seg[1] === "concepten" && tid && !seg[3] && m === "PUT") return json(await taak.opslaan(tid, await body(req)));
      if (seg[1] === "concepten" && tid && seg[3] === "afmelden" && m === "POST") return json(await taak.afmelden(tid, await body(req)));
      fail(404, "Onbekend.");
    }

    // Formulieren op klantsites (komen van hun eigen domein, dus zonder x-sm-header).
    if (seg[0] === "formulier" && seg[1] && seg[2] && m === "POST") { const { ontvang } = await import("../lib/formulieren.mjs"); return await ontvang(req, seg[1], seg[2], ipOf(req, context)); }

    if (m !== "GET" && !sameOrigin(req)) fail(403, "Verzoek geweigerd.");

    // ------------------------------------------------ website
    if (seg[0] === "voorbeeld" && seg[2] === "gezien" && m === "POST") return json(await concepts.markViewed(seg[1]));
    if (path === "agenda/boek" && m === "POST") return json(await agenda.book(await body(req), ipOf(req, context)));
    if (path === "aanvraag" && m === "POST") return json(await submitAppointment(await body(req), ipOf(req, context)));
    if (path === "contact" && m === "POST") return json(await submitContact(await body(req), ipOf(req, context)));
    if (path === "start/aanmelden" && m === "POST") { const { zelfStarten } = await import("../lib/site.mjs"); return json(await zelfStarten(await body(req), ipOf(req, context))); }

    // ------------------------------------------------ inloggen
    if (path === "auth/code" && m === "POST") {
      const b = await body(req);
      await requestCode(b.email, ipOf(req, context), b.portal === "hq" ? "hq" : "portaal");
      // Altijd hetzelfde antwoord, zodat niet te achterhalen is welke adressen bestaan.
      return json({ ok: true });
    }
    if (path === "auth/verify" && m === "POST") {
      const b = await body(req);
      const { user, cookie } = await verifyCode(b.email, b.code, b.portal === "hq" ? "hq" : "portaal");
      return json({ ok: true, role: user.role }, 200, { "set-cookie": cookie });
    }
    if (path === "auth/key" && m === "POST") {
      const b = await body(req);
      const { user, cookie } = await loginWithKey(b.email, b.key, ipOf(req, context));
      return json({ ok: true, role: user.role }, 200, { "set-cookie": cookie });
    }
    if (path === "auth/logout" && m === "POST") { const scope = url.searchParams.get("portal") === "1" ? "portaal" : "hq"; return json({ ok: true }, 200, { "set-cookie": await logout(req, scope) }); }

    const user = await currentUser(req, seg[0] === "portal" || url.searchParams.get("portal") === "1" ? "portaal" : "hq");
    if (path === "auth/options") return json({ mail: mailReady(), key: keyLoginOpen(), open: openMode() });
    if (path === "auth/open-klanten" && m === "GET") {
      if (!openMode()) fail(403, "Het portaal staat niet open.");
      return json({ klanten: await q("SELECT c.id, c.company FROM customers c WHERE EXISTS (SELECT 1 FROM users u WHERE u.customer_id = c.id AND u.active) ORDER BY c.company") });
    }
    if (path === "auth/open-als" && m === "POST") {
      const r = await openPortalAs(Number((await body(req)).customerId));
      return json({ ok: true }, 200, { "set-cookie": r.cookie });
    }
    if (path === "auth/me") return json({ user: user ? { email: user.email, name: user.name, role: user.role, open: !!user.open, viaHq: !!user.viaHq } : null, open: openMode() });

    // ------------------------------------------------ klantenportaal
    if (seg[0] === "portal") {
      requireCustomer(user);
      if (path === "portal/state" && m === "GET") return json(await portalState(user));
      if (path === "portal/changes" && m === "POST") {
        const form = await req.formData().catch(() => fail(400, "Het formulier kon niet worden gelezen. Is het bestand kleiner dan 4 MB?"));
        return json(await submitChange(user, form));
      }
      if (path === "portal/domein" && m === "GET") return json(await domains.portalDomain(user.customer_id));
      if (path === "portal/domein" && m === "POST") return json(await domains.chooseDomain(user, await body(req)));
      if (path === "portal/domein/check" && m === "POST") return json(await domains.portalRecheck(user));
      if (path === "portal/domein/beschikbaar" && m === "GET") return json(await domains.beschikbaar(url.searchParams.get("naam")));
      if (path === "portal/website" && m === "POST") return json(await switchSite(user, Number((await body(req)).id)));
      if (path === "portal/website/nieuw" && m === "POST") return json(await websites.requestExtra(user, await body(req)));
      if (path === "portal/account" && m === "GET") return json({ domein: await domains.portalDomain(user.customer_id), review: await service.portalReviewState(user.customer_id), vragen: await service.portalTickets(user), opzeggen: await service.opzegState(user.customer_id) });
      if (path === "portal/vragen" && m === "POST") return json(await service.portalAsk(user, await body(req)));
      if (seg[1] === "vragen" && /^\d+$/.test(seg[2] || "") && m === "POST") return json(await service.portalReply(user, Number(seg[2]), await body(req)));
      if (path === "portal/review" && m === "POST") return json(await service.portalReview(user, await body(req)));
      if (path === "portal/opzeggen" && m === "POST") return json(await service.portalCancel(user, await body(req)));
      if (path === "portal/opzeggen/bel-me" && m === "POST") return json(await service.cancelCallback(user, await body(req)));
      if (path === "portal/opzeggen/intrekken" && m === "POST") return json(await service.withdrawCancel(user.customer_id, user));
      if (path === "portal/start/gegevens" && m === "PUT") return json(await saveDetails(user, await body(req)));
      if (path === "portal/start/betalen" && m === "POST") return json(await startPortalPayment(user, await body(req), ipOf(req, context)));
      if (path === "portal/start/informatie" && m === "PUT") return json(await saveIntake(user, await body(req)));
      if (path === "portal/start/bestanden" && m === "POST") {
        const form = await req.formData().catch(() => fail(400, "Het bestand kon niet worden gelezen. Is het kleiner dan 4 MB?"));
        return json(await addIntakeFile(user, form));
      }
      if (seg[1] === "start" && seg[2] === "bestanden" && /^\d+$/.test(seg[3] || "")) {
        if (m === "DELETE") return json(await deleteIntakeFile(user, Number(seg[3])));
        if (m === "GET") return await intakeFile(user, Number(seg[3]));
      }
      if (seg[1] === "changes" && seg[3] === "bijlage" && m === "GET") return await changeAttachment(user, Number(seg[2]));
      if (seg[1] === "invoices" && seg[3] === "pdf" && m === "GET") return await invoicePdf(user, Number(seg[2]), { inline: url.searchParams.get("inline") === "1" });
      if (seg[1] === "invoices" && seg[3] === "pay" && m === "POST") {
        const inv = await one("SELECT customer_id FROM invoices WHERE id = $1", [Number(seg[2])]);
        if (!inv || inv.customer_id !== user.customer_id) fail(404, "Factuur niet gevonden.");
        return json(await payInvoiceLink(Number(seg[2]), user.id));
      }
      fail(404, "Niet gevonden.");
    }

    // ------------------------------------------------ Sitemaker HQ
    if (seg[0] === "hq") {
      requireStaff(user);
      const id = Number(seg[2]);
      const r = seg.slice(1).map((x) => (/^\d+$/.test(x) ? ":id" : x)).join("/");
      const route = `${m} ${r}`;
      switch (route) {
        case "GET overview": return json(await hq.overview());
        case "GET customers": return json({ customers: await hq.listCustomers() });
        case "POST customers": return json(await hq.createCustomer(await body(req), user));
        case "GET customers/:id": return json(await hq.getCustomer(id));
        case "PUT customers/:id": return json(await hq.updateCustomer(id, await body(req), user));
        case "POST customers/:id/users": return json(await hq.addPortalUser(id, await body(req), user));
        case "PUT customers/:id/users/:id": return json(await hq.setPortalUser(id, Number(seg[4]), await body(req), user));
        case "DELETE customers/:id/users/:id": requireAdmin(user); return json(await hq.deletePortalUser(id, Number(seg[4]), user));
        case "POST customers/:id/als-klant": { const r = await viewAsCustomer(user, id); return json({ url: "/portaal/" }, 200, { "set-cookie": r.cookie }); }
        case "POST customers/:id/welcome": return json(await hq.sendWelcome(id, user));
        case "POST customers/:id/payment": return json(await hq.startPayment(id, await body(req), user));
        case "POST customers/:id/cancel": requireAdmin(user); return json(await hq.stopSubscription(id, user));
        case "POST customers/:id/incasso": requireAdmin(user); return json(await hq.incassoStarten(id, await body(req), user));
        case "POST customers/:id/check": return json(await hq.checkSiteNow(id));
        case "GET changes": return json({ changes: await hq.listChanges({ status: url.searchParams.get("status") || "" }) });
        case "PUT changes/:id": return json(await hq.updateChange(id, await body(req), user));
        case "POST changes/:id/goedkeuren": return json(await hq.approveChange(id, user, { notify: (await body(req)).notify !== false }));
        case "POST changes/:id/opnieuw": return json(await hq.redoChange(id, (await body(req)).feedback || "", user));
        case "POST changes/:id/handmatig": return json(await hq.manualChange(id, user));
        case "POST changes/:id/verwerk": return json(await hq.queueChange(id));
        case "POST changes/goedkeuren": { const ids = ((await body(req)).ids || []).map(Number).slice(0, 100); const res = []; for (const i of ids) { try { await hq.approveChange(i, user); res.push({ id: i, ok: true }); } catch (e) { res.push({ id: i, ok: false, error: e.message }); } } return json({ results: res }); }
        case "GET sites/info": return json(hq.sitesInfo());
        case "POST customers/:id/site": return json(await hq.provisionSite(id, await body(req), user));
        case "PUT customers/:id/site": return json(await hq.linkSite(id, await body(req), user));
        case "GET customers/:id/bestanden/:id": return await intakeFile(user, Number(seg[4]), true);
        case "PUT customers/:id/start": return json(await hq.setOnboarding(id, await body(req), user));
        case "GET changes/:id/bijlage": return await changeAttachment(user, id, true);
        case "GET invoices": return json({ invoices: await hq.listInvoices() });
        case "POST invoices": return json(await hq.createInvoiceFromForm(await req.formData(), user));
        case "PUT invoices/:id": return json(await hq.updateInvoice(id, await body(req), user));
        case "POST invoices/:id/pdf": return json(await hq.uploadInvoicePdf(id, await req.formData(), user));
        case "POST invoices/:id/generate": return json(await generateInvoicePdf(id));
        case "POST invoices/:id/send": return json(await mailInvoice(id));
        case "POST invoices/:id/paylink": return json(await hq.invoicePayLink(id, user));
        case "GET invoices/:id/pdf": return await invoicePdf(user, id, { staff: true, inline: url.searchParams.get("inline") === "1" });
        case "GET payments": return json(await hq.listPayments());
        case "GET sites": return json({ sites: await hq.listSites() });
        case "GET agenda": return json({ ...(await agenda.grid({ days: 21 })), exceptions: await agenda.listExceptions(), feedUrl: agenda.feedUrl() });
        case "PUT agenda/instellingen": return json(await agenda.saveAgendaConfig(await body(req), user));
        case "POST agenda/slot": return json(await agenda.setSlot(await body(req), user));
        case "POST agenda/uitzondering": return json(await agenda.addException(await body(req), user));
        case "DELETE agenda/uitzondering/:id": return json(await agenda.deleteException(Number(seg[3]), user));
        case "POST appointments/:id/annuleren": { const a = await one("SELECT * FROM appointments WHERE id = $1", [id]); if (!a) fail(404, "Afspraak niet gevonden."); return json(await agenda.cancel(a, "sitemaker", user)); }
        case "GET team": return json(await team.teamState());
        case "GET domeinen": return json({ domeinen: await domains.listDomains() });
        case "PUT domeinen/:id": return json(await domains.updateDomain(id, await body(req), user));
        case "POST domeinen/:id/check": return json(await domains.controleer(id, { user }));
        case "POST team/briefings": return json(await team.refreshBriefings());
        case "POST team/vraag": return json(await team.askQuestion(user, await body(req)));
        case "GET team/vragen": return json({ vragen: await team.listQuestions(url.searchParams.get("dept") || "") });
        case "GET concepten": return json(await concepts.listConcepts({ filter: url.searchParams.get("filter") || "" }));
        case "GET opdrachten": return json(await opdrachten.lijst());
        case "POST koppelingen/test": if (user.role !== "admin") fail(403, "Alleen voor beheerders."); { const { koppelTest } = await import("../lib/sites.mjs"); return json(await koppelTest(user)); }
        case "POST opdrachten/:id/live": return json(await opdrachten.liveZetten(id, user));
        case "POST opdrachten/:id/opnieuw": return json(await opdrachten.opnieuw(id, (await body(req)).feedback, user));
        case "POST customers/:id/opdracht": return json(await opdrachten.maakOpdracht(id, { user }).then((o) => ({ ok: !!o })));
        case "GET concepten/taak": if (user.role !== "admin") fail(403, "Alleen voor beheerders."); return json({ sleutel: taak.taakSleutel(), ...(await taak.status()) });
        case "PUT concepten/:id/ontwerp": if (user.role !== "admin") fail(403, "Alleen voor beheerders."); return json(await concepts.setConceptHtml(id, (await body(req)).html, user));
        case "POST leads/:id/concept": return json(await hq.queueConcept(id, { instructie: (await body(req)).instructie || "", direct: true }));
        case "PUT leads/:id/concept": return json(await hq.setConceptTheme(id, (await body(req)).thema, user));
        case "DELETE leads/:id/concept": return json(await hq.deleteConcept(id));
        case "POST leads/:id/afwijzen": return json(await hq.rejectConcept(id, user));
        case "GET appointments": return json({ appointments: await hq.listAppointments() });
        case "PUT appointments/:id": return json(await hq.updateAppointment(id, await body(req), user));
        case "POST customers/:id/extra-website": return json(await websites.staffExtra(id, await body(req), user));
        case "GET b2b": return json(await b2bDashboard());
        case "GET leads": return json(await hq.listLeads({ status: url.searchParams.get("status") || "" }));
        case "POST leads": return json(await hq.addLead(await body(req), user.id));
        case "POST leads/import": return json(await hq.importLeads((await body(req)).csv, user));
        case "POST leads/action": return json(await hq.leadAction(await body(req), user));
        case "PUT leads/:id": return json(await hq.updateLead(id, await body(req)));
        case "GET leads/:id/preview": return json(await hq.leadPreview(id, url.searchParams.get("kind") || "eerste"));
        case "POST leads/:id/testmail": { const { sendTestMail } = await import("../lib/b2b.mjs"); const b = await body(req); return json(await sendTestMail(id, b.kind, user.email)); }
        case "POST scout": return json(await hq.scoutNow());
        case "GET settings": return json(await hq.getAdminSettings());
        case "PUT settings": requireAdmin(user); return json(await hq.saveAdminSettings(await body(req), user));
        case "POST settings/testmail": return json(await hq.testMail(user));
        case "GET medewerkers": return json({ ...(await hq.listTeam()), me: { id: user.id, email: user.email, role: user.role } });
        case "POST medewerkers": requireAdmin(user); return json(await hq.saveTeamMember(await body(req), user));
        case "DELETE medewerkers/:id": requireAdmin(user); return json(await hq.deleteTeamMember(id, user));
        case "GET reviews": return json({ reviews: await listReviews() });
        case "POST reviews": return json(await saveReview(null, await body(req), user));
        case "PUT reviews/:id": return json(await saveReview(id, await body(req), user));
        case "DELETE reviews/:id": return json(await deleteReview(id, user));
        case "GET service": return json({ tickets: await service.listTickets({ status: url.searchParams.get("status") || "" }) });
        case "POST service/:id/antwoord": return json(await service.answerTicket(id, await body(req), user));
        case "POST service/:id/sluiten": return json(await service.closeTicket(id, user));
        case "POST service/:id/concept": return json(await service.redraft(id));
        case "POST customers/:id/opzegging/intrekken": return json(await service.withdrawCancel(id, user));
        case "GET kosten": return json({ kosten: await kosten.listCosts(), ...(await kosten.overzicht()) });
        case "GET credits": return json(await credits.overzicht());
        case "POST credits": requireAdmin(user); return json(await credits.opslaan(await body(req), user));
        case "POST kosten": requireAdmin(user); return json(await kosten.saveCost(null, await body(req), user));
        case "PUT kosten/:id": requireAdmin(user); return json(await kosten.saveCost(id, await body(req), user));
        case "DELETE kosten/:id": requireAdmin(user); return json(await kosten.deleteCost(id, user));
        case "GET kosten/export": return await kosten.exportCsv({ jaar: url.searchParams.get("jaar"), kwartaal: url.searchParams.get("kwartaal") });
        case "GET maillog": return json({ mails: await hq.mailLog() });
        default: fail(404, "Niet gevonden.");
      }
    }
    fail(404, "Niet gevonden.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error("[api]", m, path, e);
    return json({ error: "Er ging iets mis aan onze kant. Probeer het zo opnieuw." }, 500);
  }
};

export const config = { path: ["/api/*", "/voorbeeld/*"] };
