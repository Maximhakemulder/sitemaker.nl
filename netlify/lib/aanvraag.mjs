// Gratis ontwerp aanvragen via de landingspagina (sitemaker.nl/start, Meta-ads). Besluit Maxim 29-10-2026:
// binnen 24 uur een eerste ontwerpvoorstel in de mail, net als bij de koude leads, maar dan op hun eigen verzoek.
// Met website: die scannen we zoals bij koude leads. Zonder website: de ontwerper werkt vanuit hun korte omschrijving.
import crypto from "node:crypto";
import { q, one, str, cleanEmail, EMAIL_RE, sha256, env, fail, getSettings, domainOf, normUrl, publicBase, OFFER } from "./core.mjs";
import { notifyStaff, sendMail } from "./mail.mjs";

const voornaam = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const datumNl = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

export async function ontwerpAanvragen(b, ip) {
  if (str(b.website_url)) return { ok: true }; // honeypot
  if (b.t && Date.now() - Number(b.t) < 2000) return { ok: true };
  const errors = {};
  const naam = str(b.naam, 120), bedrijf = str(b.bedrijf, 160), email = cleanEmail(b.email), telefoon = str(b.telefoon, 30);
  const siteIn = str(b.site, 200), wat = str(b.wat, 300);
  const site = siteIn ? normUrl(siteIn) : "", domein = site ? domainOf(site) : "";
  if (naam.length < 2) errors.naam = "Vul je naam in.";
  if (bedrijf.length < 2) errors.bedrijf = "Vul de naam van je bedrijf in.";
  if (!EMAIL_RE.test(email)) errors.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
  if (telefoon && !/^[+()\d\s-]{8,20}$/.test(telefoon)) errors.telefoon = "Dit telefoonnummer klopt niet.";
  if (siteIn && (!domein || !domein.includes("."))) errors.site = "Dit webadres klopt niet. Bijvoorbeeld: jouwbedrijf.nl";
  if (!site && wat.length < 4) errors.wat = "Vertel kort wat je doet en waar, bijvoorbeeld: schilder in Breda.";
  if (Object.keys(errors).length) fail(400, "Controleer de gemarkeerde velden.", { errors });

  const ipHash = sha256(`${env("AUTH_SECRET", "x")}:${ip}`).slice(0, 32);
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'aanvraag.ontwerp' AND detail->>'ip' = $1 AND created_at > NOW() - INTERVAL '1 hour'", [ipHash]);
  if (n >= 3) fail(429, "Je hebt net al een ontwerp aangevraagd. Je krijgt het binnen 24 uur in je mail.");

  // Bestaat dit bedrijf al (koude lead, eerdere aanvraag)? Dan die gebruiken.
  let lead = await one("SELECT * FROM leads WHERE lower(email) = $1 OR ($2 <> '' AND domain = $2) ORDER BY id LIMIT 1", [email, domein]);
  if (lead?.status === "klant") return { ok: true, klant: true };
  // Zelf aangevraagd = toestemming: een eerdere afmelding vervalt.
  await q("DELETE FROM suppressions WHERE email = $1", [email]);
  const c = lead && await one("SELECT * FROM concepts WHERE lead_id = $1", [lead.id]);
  if (c?.status === "klaar" && (!c.expires_at || new Date(c.expires_at) > new Date(Date.now() + 2 * 86400000))) {
    await q("UPDATE leads SET status = 'aanvraag', contact_name = $2, phone = COALESCE(NULLIF($3, ''), phone), aanvraag_at = NOW(), aanvraag_tekst = $4, updated_at = NOW() WHERE id = $1", [lead.id, naam, telefoon, wat]);
    await stuurOntwerpMail(lead.id);
    await log(ipHash, lead.id, bedrijf, true);
    return { ok: true, klaar: true };
  }
  if (lead) {
    if (c) { const { deleteConcept } = await import("./concepts.mjs"); await deleteConcept(lead.id); }
    lead = await one(`UPDATE leads SET status = 'aanvraag', company = $2, email = $3, contact_name = $4, phone = COALESCE(NULLIF($5, ''), phone),
      website = CASE WHEN $6 <> '' THEN $6 ELSE website END, domain = CASE WHEN $7 <> '' THEN $7 ELSE domain END, source = 'landing',
      aanvraag_at = NOW(), aanvraag_tekst = $8, error = '', reject_reason = '', unsub_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [lead.id, bedrijf, email, naam, telefoon, site, domein, wat]);
  } else {
    lead = await one(`INSERT INTO leads (company, email, website, domain, phone, source, status, contact_name, aanvraag_at, aanvraag_tekst)
      VALUES ($1,$2,$3,$4,$5,'landing','aanvraag',$6,NOW(),$7) RETURNING *`, [bedrijf, email, site, domein, telefoon, naam, wat]);
  }
  const instructie = `Gratis ontwerpaanvraag via sitemaker.nl/start (warme lead: ${naam} vroeg zelf om een ontwerp, binnen 24 uur). Bedrijf: ${bedrijf}.${wat ? ` Over het bedrijf (eigen woorden): ${wat}.` : ""}`;
  const token = crypto.randomBytes(16).toString("hex");
  if (site) {
    const nieuw = await one("INSERT INTO concepts (lead_id, token, status, instructie) VALUES ($1,$2,'wachtrij',$3) RETURNING id", [lead.id, token, instructie]);
    const { startConcept } = await import("./concepts.mjs");
    await startConcept(nieuw.id).catch(() => {}); // anders pakt tick hem op
  } else {
    // Geen website: niets te scannen. De ontwerper werkt vanuit hun omschrijving en kiest sfeerbeelden.
    const tekst = [`Bedrijf: ${bedrijf}`, `Wat ze doen (eigen woorden): ${wat}`, `Contactpersoon: ${naam}`, `E-mail: ${email}`, telefoon ? `Telefoon: ${telefoon}` : ""].filter(Boolean).join("\n");
    await q("INSERT INTO concepts (lead_id, token, status, instructie, bron, analysis) VALUES ($1,$2,'ontwerp',$3,$4,'{}'::jsonb)",
      [lead.id, token, instructie, JSON.stringify({ url: "", tekst, geenWebsite: true })]);
  }
  await log(ipHash, lead.id, bedrijf, false);
  // Bevestiging aan de aanvrager.
  const s = await getSettings();
  const body = `Hi ${voornaam(naam)}!\n\nBedankt voor je aanvraag. We gaan aan de slag met een gratis ontwerp voor de nieuwe website van ${bedrijf}. Binnen 24 uur staat het in je mail.\n\nHeb je in de tussentijd een vraag of iets wat we moeten weten? Reageer gewoon op deze mail.\n\nMet vriendelijke groet,`;
  const { textToHtml } = await import("./b2b.mjs");
  await sendMail({ to: email, subject: `We maken je gratis ontwerp voor ${bedrijf}`, text: body, html: textToHtml(body), kind: "aanvraag-ontvangen", ref: `lead:${lead.id}`,
    fromName: `${s.b2b.senderName || ""} | Sitemaker`.replace(/^ \| /, "") }).catch(() => {});
  await notifyStaff(`Nieuwe ontwerpaanvraag: ${bedrijf}`, [`${naam} van ${bedrijf} vroeg via sitemaker.nl/start een gratis ontwerp aan.`, site ? `Website: ${site}` : `Geen website. Omschrijving: ${wat}`, `E-mail: ${email}${telefoon ? ` · Telefoon: ${telefoon}` : ""}`, "De ontwerper maakt het ontwerp; de mail gaat automatisch zodra het klaar is."], "/hq/#ontwerpaanvragen").catch(() => {});
  return { ok: true };
}

async function log(ip, leadId, bedrijf, opnieuw) {
  await q("INSERT INTO audit_log (action, detail) VALUES ('aanvraag.ontwerp', $1::jsonb)", [JSON.stringify({ ip, lead: leadId, bedrijf, opnieuw })]).catch(() => {});
}

// Ontwerp klaar (of al klaar bij een herhaalde aanvraag): mail met de link, automatisch (besluit Maxim).
export async function stuurOntwerpMail(leadId) {
  const lead = await one("SELECT l.*, c.token, c.expires_at FROM leads l JOIN concepts c ON c.lead_id = l.id WHERE l.id = $1 AND c.status = 'klaar'", [leadId]);
  if (!lead || lead.status !== "aanvraag" || !lead.email) return { skipped: true };
  const s = await getSettings();
  const dagen = Number(s.b2b.concepten?.geldigDagen || 7);
  const exp = await one("UPDATE concepts SET expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW() + ($2 || ' days')::interval), updated_at = NOW() WHERE lead_id = $1 RETURNING expires_at", [leadId, String(dagen)]);
  const { conceptUrl } = await import("./concepts.mjs");
  const { textToHtml, unsubUrl } = await import("./b2b.mjs");
  const body = `Hi ${voornaam(lead.contact_name)}!\n\nJe gratis ontwerp voor de nieuwe website van ${lead.company} staat klaar:\n${conceptUrl(lead.token)}\n\nBekijk het rustig. Het is privé, alleen via deze link te zien, en staat tot ${datumNl(exp.expires_at)} voor je klaar.\n\nBevalt het? Klik in het ontwerp op "Ik heb interesse". Dan maken we hem samen helemaal af, met jouw wensen, en staat je website binnen ${OFFER.deliveryText} online.\n\nAlles inbegrepen: €299,95 eenmalig en €69,95 per maand voor hosting, onderhoud en ${OFFER.changesPerMonth} wijzigingen per maand. Maandelijks opzegbaar, en de eerste 30 dagen na livegang niet tevreden? Dan krijg je je geld terug.\n\nVragen? Reageer gewoon op deze mail.\n\nMet vriendelijke groet,\n\n--\nGeen berichten meer van ons? Hier afmelden: ${unsubUrl(lead.id)}`;
  const subject = `Je gratis ontwerp voor ${lead.company} staat klaar`;
  const res = await sendMail({ to: lead.email, subject, text: body, html: textToHtml(body), kind: "aanvraag-ontwerp", ref: `lead:${lead.id}`,
    fromName: `${s.b2b.senderName || ""} | Sitemaker`.replace(/^ \| /, ""),
    headers: { "List-Unsubscribe": `<${unsubUrl(lead.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  if (res.ok) await q("UPDATE leads SET status = 'verstuurd', sent_at = NOW(), sent_subject = $2, message_id = $3, error = '', updated_at = NOW() WHERE id = $1", [lead.id, subject, res.messageId]);
  else await q("UPDATE leads SET error = $2, updated_at = NOW() WHERE id = $1", [lead.id, `Ontwerpmail niet verstuurd: ${res.error || "onbekend"}`]);
  return { ok: !!res.ok };
}

// Mail die niet lukte (bijv. tijdelijke SMTP-fout): tick probeert het opnieuw.
export async function herstuurOntwerpen() {
  const rows = await q("SELECT l.id FROM leads l JOIN concepts c ON c.lead_id = l.id WHERE l.status = 'aanvraag' AND c.status = 'klaar' ORDER BY l.aanvraag_at LIMIT 3");
  let sent = 0;
  for (const r of rows) if ((await stuurOntwerpMail(r.id)).ok) sent++;
  return { sent };
}

// HQ › Ontwerpaanvragen
export async function lijst() {
  const rows = await q(`SELECT l.id, l.company, l.contact_name, l.email, l.phone, l.website, l.status AS lead_status, l.aanvraag_at, l.aanvraag_tekst, l.sent_at, l.error, l.customer_id,
      c.status AS concept_status, c.token, c.first_view_at, c.reden
    FROM leads l LEFT JOIN concepts c ON c.lead_id = l.id WHERE l.aanvraag_at IS NOT NULL ORDER BY l.aanvraag_at DESC LIMIT 200`);
  const { conceptUrl } = await import("./concepts.mjs");
  const fase = (r) => r.customer_id || r.lead_status === "klant" ? "klant" : r.lead_status === "afspraak" ? "afspraak" : r.lead_status === "afgemeld" ? "afgemeld"
    : r.lead_status === "reactie" ? "reactie" : r.first_view_at ? "bekeken" : r.sent_at && r.lead_status !== "aanvraag" ? "verstuurd"
    : ["fout", "overgeslagen"].includes(r.concept_status) ? "probleem" : "in_de_maak";
  const items = rows.map((r) => ({ id: r.id, bedrijf: r.company, naam: r.contact_name, email: r.email, telefoon: r.phone, website: r.website, wat: r.aanvraag_tekst,
    aangevraagd: r.aanvraag_at, verstuurd: r.sent_at, bekeken: r.first_view_at, fase: fase(r), fout: r.error || (["fout", "overgeslagen"].includes(r.concept_status) ? r.reden : ""),
    link: r.token && r.concept_status === "klaar" ? `${conceptUrl(r.token)}?hq=1` : "", klant: r.customer_id }));
  const tel = (f) => items.filter((i) => i.fase === f).length;
  return { items, tellers: { in_de_maak: tel("in_de_maak"), probleem: tel("probleem"), verstuurd: tel("verstuurd") + tel("bekeken"), interesse: tel("afspraak") + tel("klant") + tel("reactie") } };
}
