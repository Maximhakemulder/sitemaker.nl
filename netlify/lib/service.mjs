// Klantenservice (Emma): klantvragen uit het portaal en uit de inbox, met een antwoord dat Claude klaarzet en Maxim verstuurt.
// Plus: een review schrijven in het portaal (één keer per klant) en opzeggen via het portaal (met behoud-stappen en opzegtermijn).
import { q, one, str, fail, audit, escH, env, publicBase, portalUrl, OFFER } from "./core.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";
import { claude, aiReady } from "./ai.mjs";
import { trigger } from "./team.mjs";

// Antwoord laten klaarzetten in de achtergrond (Claude kan langer duren dan een gewone aanroep).
async function queueDraft(id) {
  if (!aiReady()) return;
  await q("UPDATE tickets SET concept_status = 'wacht' WHERE id = $1", [id]);
  await trigger({ kind: "ticket", id });
}


// ================================================================ klantvragen (tickets)
const publicMsg = (m) => ({ id: m.id, van: m.van, tekst: m.tekst, at: m.created_at });
const publicTicket = (t, msgs = []) => ({ id: t.id, onderwerp: t.onderwerp, status: t.status, bron: t.bron, at: t.created_at, updatedAt: t.updated_at, berichten: msgs.map(publicMsg) });

export async function newTicket({ customerId = null, email = "", naam = "", onderwerp, tekst, bron = "portaal", messageId = "", userId = null }) {
  const t = await one(`INSERT INTO tickets (customer_id, email, naam, onderwerp, bron, laatste_msg_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [customerId, str(email, 200), str(naam, 120), str(onderwerp, 160) || "Vraag", bron, str(messageId, 300)]);
  await q("INSERT INTO ticket_messages (ticket_id, van, tekst, message_id, user_id) VALUES ($1,'klant',$2,$3,$4)", [t.id, str(tekst, 6000), str(messageId, 300), userId]);
  await queueDraft(t.id).catch((e) => console.log("[service] concept", e.message));
  await notifyStaff(`Klantvraag: ${t.onderwerp}`, [`${naam || email || "Een klant"} stelt een vraag${bron === "mail" ? " per mail" : bron === "opzeggen" ? " tijdens het opzeggen" : bron === "website" ? " via het contactformulier" : " in het portaal"}:`, str(tekst, 600)], `/hq/#service`).catch(() => {});
  return t;
}

// Portaal: klant stelt een vraag.
export async function portalAsk(user, b) {
  const onderwerp = str(b.onderwerp, 160), tekst = str(b.tekst, 6000);
  if (onderwerp.length < 3) fail(400, "Vul een onderwerp in.", { field: "onderwerp" });
  if (tekst.length < 10) fail(400, "Beschrijf je vraag in een paar zinnen.", { field: "tekst" });
  const recent = await one("SELECT COUNT(*)::int AS n FROM tickets WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '1 hour'", [user.customer_id]);
  if (recent.n >= 5) fail(429, "Je hebt net al meerdere vragen gesteld. We reageren zo snel mogelijk.");
  const c = await one("SELECT company, contact_name FROM customers WHERE id = $1", [user.customer_id]);
  const t = await newTicket({ customerId: user.customer_id, email: user.email, naam: `${c.contact_name || c.company}`, onderwerp, tekst, userId: user.id });
  return { ticket: publicTicket(t) };
}
export async function portalTickets(user) {
  const rows = await q("SELECT * FROM tickets WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 20", [user.customer_id]);
  const msgs = rows.length ? await q("SELECT * FROM ticket_messages WHERE ticket_id = ANY($1) ORDER BY created_at", [rows.map((r) => r.id)]) : [];
  return rows.map((t) => publicTicket(t, msgs.filter((m) => m.ticket_id === t.id)));
}
export async function portalReply(user, id, b) {
  const t = await one("SELECT * FROM tickets WHERE id = $1 AND customer_id = $2", [id, user.customer_id]);
  if (!t) fail(404, "Vraag niet gevonden.");
  const tekst = str(b.tekst, 6000);
  if (tekst.length < 2) fail(400, "Schrijf een bericht.", { field: "tekst" });
  await q("INSERT INTO ticket_messages (ticket_id, van, tekst, user_id) VALUES ($1,'klant',$2,$3)", [t.id, tekst, user.id]);
  await q("UPDATE tickets SET status = 'open', updated_at = NOW() WHERE id = $1", [t.id]);
  await queueDraft(t.id).catch(() => {});
  await notifyStaff(`Reactie op klantvraag: ${t.onderwerp}`, [tekst.slice(0, 600)], `/hq/#service`).catch(() => {});
  return { ok: true };
}

// Inbox: een mail van een klant (geen B2B-reactie) wordt een klantvraag. Antwoord in dezelfde draad als het onderwerp gelijk is.
export async function ticketFromMail({ from, naam, subject, body, messageId, inReplyTo }) {
  if (!messageId || (await one("SELECT 1 FROM ticket_messages WHERE message_id = $1", [messageId]))) return null;
  const klant = await one("SELECT u.customer_id, c.company FROM users u JOIN customers c ON c.id = u.customer_id WHERE lower(u.email) = $1 AND u.role = 'klant' LIMIT 1", [from])
    || await one("SELECT id AS customer_id, company FROM customers WHERE lower(email) = $1 LIMIT 1", [from]);
  if (!klant) return null;
  const onderwerp = str(String(subject || "").replace(/^(re|fw|fwd|antw):\s*/gi, ""), 160) || "Mail van klant";
  const open = await one(`SELECT * FROM tickets WHERE customer_id = $1 AND status <> 'gesloten' AND (lower(onderwerp) = lower($2) OR laatste_msg_id = $3) ORDER BY updated_at DESC LIMIT 1`, [klant.customer_id, onderwerp, inReplyTo || "-"]);
  if (open) {
    await q("INSERT INTO ticket_messages (ticket_id, van, tekst, message_id) VALUES ($1,'klant',$2,$3) ON CONFLICT DO NOTHING", [open.id, str(body, 6000), messageId]);
    await q("UPDATE tickets SET status = 'open', laatste_msg_id = $2, updated_at = NOW() WHERE id = $1", [open.id, messageId]);
    await queueDraft(open.id).catch(() => {});
    return open;
  }
  return newTicket({ customerId: klant.customer_id, email: from, naam: naam || klant.company, onderwerp, tekst: body, bron: "mail", messageId });
}

// Claude zet een antwoord klaar (Maxim past het eventueel aan en verstuurt).
export async function draftAnswer(ticketId) {
  if (!aiReady()) return;
  const t = await one("SELECT t.*, c.company, c.site_url, c.site_status, c.billing_status FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.id = $1", [ticketId]);
  if (!t) return;
  await q("UPDATE tickets SET concept_status = 'bezig' WHERE id = $1", [t.id]);
  const msgs = await q("SELECT van, tekst FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at", [t.id]);
  try {
    const tekst = await claude({
      system: `Je bent Emma van de klantenservice van Sitemaker (websites voor het mkb: €299,95 eenmalig + €69,95 per maand, hosting inbegrepen, ${OFFER.changesPerMonth} wijzigingen per maand via het klantenportaal, verwerkt binnen 48 uur; nieuwe site binnen ${OFFER.deliveryText}; geen webshops). Schrijf een kort, vriendelijk en concreet antwoord in de je-vorm, in het Nederlands. Beloof niets wat niet in deze informatie staat (geen kortingen, geen extra diensten, geen termijnen die je niet weet); zeg dan dat je het nagaat. Wijzigingen aan de website laat je de klant doorgeven via het portaal (${portalUrl()}). Garantie: wie binnen 30 dagen na livegang niet tevreden is, krijgt alles terug. Is het (nog) geen klant, bijvoorbeeld een bericht via het contactformulier, nodig dan uit voor een kennismaking (${publicBase()}/#kennismaking). Onderteken met "Groet, Sitemaker". Alleen de mailtekst, geen onderwerp.`,
      prompt: `Klant: ${t.company || t.naam || t.email}${t.site_url ? ` (site: ${t.site_url}, status ${t.site_status})` : ""}\nOnderwerp: ${t.onderwerp}\n\nGesprek:\n${msgs.map((m) => `${m.van === "klant" ? "Klant" : "Sitemaker"}: ${m.tekst}`).join("\n\n")}`,
      maxTokens: 1500, timeoutMs: 60000,
    });
    await q("UPDATE tickets SET concept = $2, concept_status = 'klaar' WHERE id = $1", [t.id, str(tekst, 5000)]);
  } catch (e) {
    await q("UPDATE tickets SET concept_status = 'fout' WHERE id = $1", [t.id]);
  }
}

export async function listTickets({ status = "" } = {}) {
  const where = status === "alle" ? "TRUE" : status === "gesloten" ? "t.status = 'gesloten'" : "t.status <> 'gesloten'";
  const rows = await q(`SELECT t.*, c.company FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id WHERE ${where} ORDER BY (t.status = 'open') DESC, t.updated_at DESC LIMIT 200`);
  const msgs = rows.length ? await q("SELECT * FROM ticket_messages WHERE ticket_id = ANY($1) ORDER BY created_at", [rows.map((r) => r.id)]) : [];
  return rows.map((t) => ({ ...publicTicket(t, msgs.filter((m) => m.ticket_id === t.id)), company: t.company, email: t.email, naam: t.naam, customerId: t.customer_id, concept: t.concept, conceptStatus: t.concept_status }));
}
export async function answerTicket(id, b, user) {
  const t = await one("SELECT * FROM tickets WHERE id = $1", [id]);
  if (!t) fail(404, "Vraag niet gevonden.");
  const tekst = str(b.tekst, 6000);
  if (tekst.length < 5) fail(400, "Schrijf een antwoord.", { field: "tekst" });
  await q("INSERT INTO ticket_messages (ticket_id, van, tekst, user_id) VALUES ($1,'sitemaker',$2,$3)", [t.id, tekst, user.id]);
  await q("UPDATE tickets SET status = $2, concept = '', concept_status = '', updated_at = NOW() WHERE id = $1", [t.id, b.sluiten ? "gesloten" : "beantwoord"]);
  const to = t.email;
  let mailed = null;
  if (to) {
    mailed = await sendMail({
      to, kind: "klantenservice", ref: `ticket:${t.id}`, subject: `Re: ${t.onderwerp}`,
      inReplyTo: t.laatste_msg_id || undefined, references: t.laatste_msg_id || undefined,
      text: `${tekst}\n\n--\nJe vraag en ons antwoord staan ook in je klantenportaal: ${portalUrl()}#account`,
      html: brandHtml({ title: t.onderwerp, intro: tekst.split(/\n{2,}/).map((p) => escH(p).replace(/\n/g, "<br>")), button: { label: "Naar je portaal", href: `${portalUrl()}#account` } }),
    });
  }
  await audit(user.id, t.customer_id, "service.beantwoord", { id: t.id });
  return { ok: true, mailed };
}
export async function closeTicket(id, user) {
  await q("UPDATE tickets SET status = 'gesloten', updated_at = NOW() WHERE id = $1", [id]);
  await audit(user.id, null, "service.gesloten", { id });
  return { ok: true };
}
export async function redraft(id) { await queueDraft(id); return { ok: true }; }
// tick: antwoorden die bleven hangen (achtergrondfunctie niet gestart) opnieuw klaarzetten.
export async function retryDrafts() {
  const rows = await q("SELECT id FROM tickets WHERE status = 'open' AND concept_status IN ('wacht','bezig') AND updated_at < NOW() - INTERVAL '20 minutes' LIMIT 2");
  for (const r of rows) { await q("UPDATE tickets SET updated_at = NOW() WHERE id = $1", [r.id]); await queueDraft(r.id); }
  return { retried: rows.length };
}

// ================================================================ review schrijven (één keer)
export async function portalReviewState(customerId) {
  const c = await one("SELECT site_status, delivered_at, company, contact_name FROM customers WHERE id = $1", [customerId]);
  const r = await one("SELECT rating, title, body, published, created_at FROM reviews WHERE customer_id = $1 AND source = 'portaal' LIMIT 1", [customerId]);
  return { kan: c.site_status === "live" && !r, gedaan: r ? { rating: r.rating, title: r.title, body: r.body, gepubliceerd: r.published, at: r.created_at } : null, naam: c.contact_name || "", bedrijf: c.company };
}
export async function portalReview(user, b) {
  const st = await portalReviewState(user.customer_id);
  if (st.gedaan) fail(409, "Je hebt al een review geschreven. Dank je wel!");
  if (!st.kan) fail(400, "Je kunt een review schrijven zodra je website online staat.");
  const rating = Math.round(Number(b.rating));
  if (!(rating >= 1 && rating <= 5)) fail(400, "Kies 1 tot 5 sterren.", { field: "rating" });
  const body = str(b.tekst, 1500), title = str(b.titel, 120), name = str(b.naam, 80);
  if (body.length < 20) fail(400, "Schrijf in een paar zinnen hoe je het vond (minimaal 20 tekens).", { field: "tekst" });
  if (name.length < 2) fail(400, "Vul de naam in die bij je review mag staan.", { field: "naam" });
  if (b.toestemming !== true) fail(400, "Geef toestemming om je review op onze website te tonen, of laat het weten via een vraag.", { field: "toestemming" });
  await q(`INSERT INTO reviews (customer_id, name, company, rating, title, body, source, published) VALUES ($1,$2,$3,$4,$5,$6,'portaal',FALSE)`,
    [user.customer_id, name, st.bedrijf, rating, title, body]);
  await audit(user.id, user.customer_id, "review.geschreven", { rating });
  await notifyStaff(`Nieuwe review (${rating} sterren): ${st.bedrijf}`, [`${name} van ${st.bedrijf}: "${body.slice(0, 300)}"`, "Publiceer hem in HQ › Reviews."], `/hq/#reviews`).catch(() => {});
  return portalReviewState(user.customer_id);
}

// ================================================================ opzeggen (met behoud-stappen)
export const REDENEN = {
  te_duur: "Het is te duur",
  geen_resultaat: "De website levert te weinig op",
  zelf_doen: "Ik ga het zelf doen of een ander bureau",
  stoppen: "Ik stop met mijn bedrijf",
  ontevreden: "Ik ben niet tevreden over de service",
  anders: "Een andere reden",
};
// Einde: laatste dag van de maand na de maand waarin wordt opgezegd (zie voorwaarden art. 8).
export function opzegEinde(d = new Date()) {
  const ams = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" }));
  const last = new Date(Date.UTC(ams.getFullYear(), ams.getMonth() + 2, 0));
  return last.toISOString().slice(0, 10);
}
export async function opzegState(customerId) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  const dom = await one("SELECT naam, keuze FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [customerId]).catch(() => null);
  return {
    status: c.opzeg_status, einde: c.opzeg_status === "aangevraagd" ? c.opzeg_einde : opzegEinde(), aangevraagdOp: c.opzeg_at,
    kan: ["actief", "handmatig", "betaling_mislukt", "wacht_op_betaling"].includes(c.billing_status) || c.site_status === "live",
    bedrijf: c.company, domein: dom, redenen: REDENEN,
  };
}
export async function portalCancel(user, b) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
  if (c.opzeg_status === "aangevraagd") fail(409, "Je hebt al opgezegd.");
  if (!REDENEN[b.reden]) fail(400, "Kies de reden waarom je opzegt.", { field: "reden" });
  if (b.akkoord !== true) fail(400, "Vink aan dat je begrijpt wat er gebeurt na de einddatum.", { field: "akkoord" });
  if (String(b.bevestig || "").trim().toLowerCase() !== c.company.trim().toLowerCase()) fail(400, `Typ precies je bedrijfsnaam (${c.company}) om te bevestigen.`, { field: "bevestig" });
  const einde = opzegEinde();
  await q("UPDATE customers SET opzeg_status = 'aangevraagd', opzeg_at = NOW(), opzeg_einde = $2, opzeg_reden = $3, opzeg_toelichting = $4, updated_at = NOW() WHERE id = $1",
    [c.id, einde, b.reden, str(b.toelichting, 2000)]);
  await audit(user.id, c.id, "opzegging.aangevraagd", { reden: b.reden, einde });
  const eindeTxt = new Date(einde + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  await Promise.allSettled([
    notifyStaff(`Opzegging: ${c.company} (per ${eindeTxt})`, [`${c.company} heeft opgezegd.`, `Reden: ${REDENEN[b.reden]}${b.toelichting ? ` — ${str(b.toelichting, 400)}` : ""}`, "Bel ze eventueel nog; je kunt de opzegging in HQ intrekken als ze blijven."], `/hq/#klant/${c.id}`),
    sendMail({
      to: user.email, kind: "opzegging", ref: `customer:${c.id}`, subject: "Bevestiging van je opzegging",
      text: `Beste ${c.contact_name || c.company},\n\nWe hebben je opzegging ontvangen. Je abonnement loopt door tot en met ${eindeTxt}. Tot die datum blijft je website online en kun je wijzigingen doorgeven. Daarna stoppen de afschrijvingen en gaat je website offline.\n\nJe kunt binnen 30 dagen na de einddatum je eigen teksten en foto's opvragen. Bedacht? Je kunt de opzegging tot de einddatum intrekken in je portaal: ${portalUrl()}#account\n\nMet vriendelijke groet,\nSitemaker`,
      html: brandHtml({ title: "Je opzegging is ontvangen", intro: [`Beste ${escH(c.contact_name || c.company)},`, `Je abonnement loopt door tot en met <b>${eindeTxt}</b>. Tot die datum blijft je website online en kun je wijzigingen doorgeven. Daarna stoppen de afschrijvingen en gaat je website offline.`, "Binnen 30 dagen na de einddatum kun je je eigen teksten en foto's opvragen."], button: { label: "Toch blijven? Intrekken in je portaal", href: `${portalUrl()}#account` } }),
    }),
  ]);
  return opzegState(c.id);
}
export async function withdrawCancel(customerId, user) {
  const r = await one("UPDATE customers SET opzeg_status = 'ingetrokken', updated_at = NOW() WHERE id = $1 AND opzeg_status = 'aangevraagd' AND opzeg_einde >= CURRENT_DATE RETURNING company", [customerId]);
  if (!r) fail(400, "Er is geen lopende opzegging om in te trekken.");
  await audit(user.id, customerId, "opzegging.ingetrokken", {});
  await notifyStaff(`Opzegging ingetrokken: ${r.company}`, [`${r.company} blijft klant.`], `/hq/#klant/${customerId}`).catch(() => {});
  return opzegState(customerId);
}
// Bij opzeggen eerst een gesprek: maakt een klantvraag "bel me terug".
export async function cancelCallback(user, b) {
  const c = await one("SELECT company, contact_name, phone FROM customers WHERE id = $1", [user.customer_id]);
  await newTicket({ customerId: user.customer_id, email: user.email, naam: c.contact_name || c.company, onderwerp: "Overweegt op te zeggen: graag terugbellen", bron: "opzeggen",
    tekst: `Reden: ${REDENEN[b.reden] || "onbekend"}.${b.toelichting ? ` ${str(b.toelichting, 1000)}` : ""} Telefoon: ${c.phone || "(niet ingevuld)"}.`, userId: user.id });
  return { ok: true };
}

// tick: opzeggingen op hun einddatum afronden.
export async function runCancellations() {
  const due = await q("SELECT * FROM customers WHERE opzeg_status = 'aangevraagd' AND opzeg_einde < CURRENT_DATE LIMIT 5");
  for (const c of due) {
    let mollie = "";
    if (c.mollie_subscription_id && c.billing_status !== "opgezegd") {
      try { const { cancelSubscription } = await import("./betalen.mjs"); const r = await cancelSubscription(c.id, null); mollie = r.gestopt === false ? "Stop de incasso nog in Pay.nl (lukte niet automatisch)." : "Incasso bij Pay.nl gestopt."; }
      catch (e) { mollie = `Incasso stoppen lukte niet: ${e.message}. Doe dit in Pay.nl.`; }
    }
    await q("UPDATE customers SET opzeg_status = 'afgerond', site_status = 'opgezegd', billing_status = CASE WHEN billing_status IN ('actief','handmatig','betaling_mislukt') THEN 'opgezegd' ELSE billing_status END, updated_at = NOW() WHERE id = $1", [c.id]);
    const dom = await one("SELECT naam, keuze FROM domains WHERE customer_id = $1 AND status <> 'opgezegd' ORDER BY id DESC LIMIT 1", [c.id]).catch(() => null);
    await audit(null, c.id, "opzegging.afgerond", {});
    await notifyStaff(`Opzegging afgerond: ${c.company}`, [`Het abonnement van ${c.company} is vandaag beëindigd. ${mollie}`, "Te doen: zet de site offline in Netlify.", dom && dom.keuze !== "eigen" ? `Het domein ${dom.naam} beheer jij: stuur de klant de verhuiscode.` : ""].filter(Boolean), `/hq/#klant/${c.id}`).catch(() => {});
  }
  return { done: due.length };
}
