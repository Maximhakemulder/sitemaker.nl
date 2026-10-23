// Eén API voor de website, het klantenportaal en Sitemaker HQ.
import { json, HttpError, fail, escH } from "../lib/core.mjs";
import { requestCode, verifyCode, currentUser, logout, clearCookie, ipOf, requireCustomer, requireStaff, requireAdmin, isStaff } from "../lib/auth.mjs";
import { portalState, submitChange, changeAttachment, invoicePdf } from "../lib/portal.mjs";
import { submitAppointment } from "../lib/site.mjs";
import { handleWebhook, payInvoiceLink } from "../lib/mollie.mjs";
import { checkUnsub, unsubscribe } from "../lib/b2b.mjs";
import { generateInvoicePdf, mailInvoice } from "../lib/billing.mjs";
import { one } from "../lib/core.mjs";
import * as hq from "../lib/admin.mjs";

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

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const seg = path.split("/");
  const m = req.method;
  try {
    // ------------------------------------------------ openbaar, zonder eigen pagina
    if (path === "mollie/webhook" && m === "POST") {
      const form = await req.formData().catch(() => null);
      const id = form?.get("id");
      try { await handleWebhook(String(id || "")); } catch (e) { console.log("[webhook]", e.message); return new Response("retry", { status: 500 }); }
      return new Response("ok");
    }
    if (path === "b2b/afmelden") {
      const id = Number(url.searchParams.get("l")), t = url.searchParams.get("t");
      if (!id || !checkUnsub(id, t)) return htmlPage("Link werkt niet", "Deze afmeldlink is niet (meer) geldig. Stuur ons een mail met 'afmelden', dan regelen we het.");
      if (m === "POST") { await unsubscribe(id); return htmlPage("Je bent afgemeld", "Je ontvangt geen berichten meer van Sitemaker op dit adres."); }
      return htmlPage("Afmelden", "Wil je geen berichten meer van Sitemaker ontvangen?", `<form method="post"><button type="submit">Ja, meld mij af</button></form>`);
    }

    if (m !== "GET" && !sameOrigin(req)) fail(403, "Verzoek geweigerd.");

    // ------------------------------------------------ website
    if (path === "aanvraag" && m === "POST") return json(await submitAppointment(await body(req), ipOf(req, context)));

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
    if (path === "auth/logout" && m === "POST") { await logout(req); return json({ ok: true }, 200, { "set-cookie": clearCookie() }); }

    const user = await currentUser(req);
    if (path === "auth/me") return json({ user: user ? { email: user.email, name: user.name, role: user.role } : null });

    // ------------------------------------------------ klantenportaal
    if (seg[0] === "portal") {
      requireCustomer(user);
      if (path === "portal/state" && m === "GET") return json(await portalState(user));
      if (path === "portal/changes" && m === "POST") {
        const form = await req.formData().catch(() => fail(400, "Het formulier kon niet worden gelezen. Is het bestand kleiner dan 4 MB?"));
        return json(await submitChange(user, form));
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
        case "POST customers/:id/welcome": return json(await hq.sendWelcome(id, user));
        case "POST customers/:id/payment": return json(await hq.startPayment(id, await body(req), user));
        case "POST customers/:id/cancel": requireAdmin(user); return json(await hq.stopSubscription(id, user));
        case "POST customers/:id/check": return json(await hq.checkSiteNow(id));
        case "GET changes": return json({ changes: await hq.listChanges({ status: url.searchParams.get("status") || "" }) });
        case "PUT changes/:id": return json(await hq.updateChange(id, await body(req), user));
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
        case "GET appointments": return json({ appointments: await hq.listAppointments() });
        case "PUT appointments/:id": return json(await hq.updateAppointment(id, await body(req), user));
        case "GET leads": return json(await hq.listLeads({ status: url.searchParams.get("status") || "" }));
        case "POST leads": return json(await hq.addLead(await body(req), user.id));
        case "POST leads/import": return json(await hq.importLeads((await body(req)).csv, user));
        case "POST leads/action": return json(await hq.leadAction(await body(req), user));
        case "PUT leads/:id": return json(await hq.updateLead(id, await body(req)));
        case "GET leads/:id/preview": return json(await hq.leadPreview(id, url.searchParams.get("kind") || "eerste"));
        case "POST scout": return json(await hq.scoutNow());
        case "GET settings": return json(await hq.getAdminSettings());
        case "PUT settings": requireAdmin(user); return json(await hq.saveAdminSettings(await body(req), user));
        case "POST settings/testmail": return json(await hq.testMail(user));
        case "GET team": return json({ ...(await hq.listTeam()), me: { id: user.id, email: user.email, role: user.role } });
        case "POST team": requireAdmin(user); return json(await hq.saveTeamMember(await body(req), user));
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

export const config = { path: "/api/*" };
