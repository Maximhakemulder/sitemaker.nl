// Aanvragen via het formulier op de website: komen direct in HQ binnen.
import { q, one, str, cleanEmail, EMAIL_RE, sha256, env, fail, escH, OFFER } from "./core.mjs";
import { notifyStaff, sendMail, brandHtml } from "./mail.mjs";

const PREFS = { "": "Geen voorkeur", ochtend: "Ochtend", middag: "Middag", avond: "Begin van de avond", bellen: "Liever gebeld worden" };

export async function submitAppointment(b, ip) {
  // Spam: verborgen veld moet leeg zijn en het formulier niet binnen 2 seconden ingevuld.
  if (str(b.website_url)) return { ok: true };
  if (b.t && Date.now() - Number(b.t) < 2000) return { ok: true };
  const errors = {};
  const name = str(b.name, 120);
  const company = str(b.company, 160);
  const email = cleanEmail(b.email);
  const phone = str(b.phone, 30);
  const preference = PREFS[b.preference] !== undefined ? b.preference : "";
  const message = str(b.message, 2000);
  if (name.length < 2) errors.name = "Vul je naam in.";
  if (company.length < 2) errors.company = "Vul de naam van je bedrijf in.";
  if (!EMAIL_RE.test(email)) errors.email = "Vul een geldig e-mailadres in, bijvoorbeeld naam@bedrijf.nl.";
  if (phone && !/^[+()\d\s-]{8,20}$/.test(phone)) errors.phone = "Dit telefoonnummer klopt niet. Laat het leeg als je liever gemaild wordt.";
  if (preference === "bellen" && !phone) errors.phone = "Vul je telefoonnummer in, dan bellen we je.";
  if (Object.keys(errors).length) fail(400, "Controleer de gemarkeerde velden.", { errors });

  const ipHash = sha256(`${env("AUTH_SECRET", "x")}:${ip}`).slice(0, 32);
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM appointments WHERE (ip_hash = $1 OR email = $2) AND created_at > NOW() - INTERVAL '1 hour'", [ipHash, email]);
  if (n >= 5) fail(429, "We hebben al meerdere aanvragen van je ontvangen. We nemen zo snel mogelijk contact op.");

  const lead = await one("UPDATE leads SET status = 'afspraak', updated_at = NOW() WHERE lower(email) = $1 AND status NOT IN ('klant','afgemeld') RETURNING id", [email]);
  const a = await one(`INSERT INTO appointments (name, company, email, phone, preference, message, ip_hash, lead_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [name, company, email, phone, preference, message, ipHash, lead?.id || null]);

  const pending = [];
  pending.push(notifyStaff(`Nieuwe aanvraag: ${company}`, [
    `${name} van ${company} wil een kennismaking.`, `E-mail: ${email}${phone ? ` · Telefoon: ${phone}` : ""}`, `Voorkeur: ${PREFS[preference]}`,
    message ? `Bericht: ${message}` : "", lead ? "Dit bedrijf staat ook in je B2B-leads (status nu: afspraak)." : "",
  ].filter(Boolean), `/hq/#aanvragen/${a.id}`).catch(() => {}));

  pending.push(sendMail({
    to: email, kind: "aanvraag-bevestiging", ref: `appointment:${a.id}`, subject: "We hebben je aanvraag ontvangen",
    text: `Hoi ${name},\n\nBedankt voor je aanvraag voor een kennismaking met Sitemaker. We nemen zo snel mogelijk contact met je op${preference === "bellen" ? " per telefoon" : ""} om een moment af te spreken.\n\nTer herinnering: een website kost €299,95 eenmalig + €69,95 per maand. Hosting en ${OFFER.changesPerMonth} wijzigingen per maand zijn inbegrepen, en je website staat binnen ${OFFER.deliveryText} online.\n\nMet vriendelijke groet,\nSitemaker`,
    html: brandHtml({
      title: "Bedankt voor je aanvraag",
      intro: [`Hoi ${escH(name)},`, `Bedankt voor je aanvraag voor een kennismaking. We nemen zo snel mogelijk contact met je op${preference === "bellen" ? " per telefoon" : ""} om een moment af te spreken.`,
        `Ter herinnering: <b>€299,95 eenmalig + €69,95 per maand</b>. Hosting en ${OFFER.changesPerMonth} wijzigingen per maand zijn inbegrepen, en je website staat binnen ${OFFER.deliveryText} online.`],
    }),
  }).catch(() => {}));
  await Promise.allSettled(pending);
  return { ok: true };
}
