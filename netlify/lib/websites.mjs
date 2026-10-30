// Meerdere websites per klant. Elke website is een eigen klantregel (eigen abonnement, eigen 4 wijzigingen per maand,
// eigen facturen en domein); één inlog ziet ze allemaal (tabel user_sites) en wisselt in het portaal.
import { q, one, str, fail, audit, OFFER } from "./core.mjs";
import { notifyStaff } from "./mail.mjs";

const SITE = (c) => ({ id: c.id, naam: c.site_naam || c.company, bedrijf: c.company, url: c.site_url, siteStatus: c.site_status, billingStatus: c.billing_status, start: c.onboarding && !c.intake_at ? true : false });

export async function listWebsites(user) {
  const rows = await q("SELECT * FROM customers WHERE id = ANY($1) ORDER BY created_at, id", [user.sites || [user.customer_id]]);
  return rows.map(SITE);
}

// Websites die bij dezelfde klant horen (zelfde portaalgebruiker), voor HQ.
export async function siblings(customerId) {
  const rows = await q(`SELECT DISTINCT c.* FROM user_sites a JOIN user_sites b ON b.user_id = a.user_id JOIN customers c ON c.id = b.customer_id
                        WHERE a.customer_id = $1 ORDER BY c.created_at, c.id`, [customerId]);
  return rows.length > 1 ? rows.map(SITE) : [];
}

// Extra website: nieuwe klantregel met de bedrijfsgegevens van de huidige website; de klant gaat akkoord en betaalt in het portaal.
async function maakExtra(van, b, { userIds, door }) {
  const naam = str(b.naam, 120);
  if (naam.length < 2) fail(400, "Geef de nieuwe website een naam, bijvoorbeeld de naam van je tweede zaak.", { field: "naam" });
  const omschrijving = str(b.omschrijving, 3000);
  if (omschrijving.length < 10) fail(400, "Vertel in een paar zinnen waar de website over gaat.", { field: "omschrijving" });
  const huidig = str(b.huidigeSite, 300);
  const c = await one(`INSERT INTO customers (company, contact_name, email, phone, address, kvk, vat_number, site_status, onboarding, details_at, site_naam, notes, intake)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,'in_aanbouw',TRUE,NOW(),$8,$9,$10::jsonb) RETURNING *`,
    [van.company, van.contact_name, van.email, van.phone, van.address, van.kvk, van.vat_number, naam, `Extra website van ${van.company} (aangevraagd ${door}).`,
      JSON.stringify({ omschrijving, huidigeSite: huidig })]);
  for (const uid of userIds) await q("INSERT INTO user_sites (user_id, customer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [uid, c.id]);
  return c;
}

export async function requestExtra(user, b) {
  const van = await one("SELECT * FROM customers WHERE id = $1", [user.customer_id]);
  const open = await one("SELECT COUNT(*)::int AS n FROM customers WHERE id = ANY($1) AND onboarding AND started_at IS NULL", [user.sites]);
  if (open.n >= 2) fail(409, "Je hebt al een extra website aangevraagd die nog niet gestart is. Rond die eerst af.");
  const c = await maakExtra(van, b, { userIds: [user.id], door: "door de klant in het portaal" });
  await q("UPDATE sessions SET customer_id = $2 WHERE token_hash = $1", [user.sessie, c.id]);
  await audit(user.id, c.id, "website.extra", { naam: c.site_naam, van: van.id });
  await notifyStaff(`Extra website aangevraagd: ${van.company}`, [`${van.company} wil een extra website: ${c.site_naam}.`, str(b.omschrijving, 400), `Prijs zoals altijd: €99,95 startkosten + €69,95 per maand. De klant gaat in het portaal akkoord en betaalt; daarna levert hij de informatie aan.`], `/hq/#klant/${c.id}`).catch(() => {});
  return { id: c.id };
}

// HQ: extra website voor een bestaande klant aanmaken (alle portaalgebruikers van de klant krijgen toegang).
export async function staffExtra(customerId, b, user) {
  const van = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!van) fail(404, "Klant niet gevonden.");
  const users = (await q("SELECT u.id FROM users u WHERE u.role = 'klant' AND (u.customer_id = $1 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $1))", [customerId])).map((r) => r.id);
  const c = await maakExtra(van, { omschrijving: "Extra website, aangemaakt in HQ.", ...b }, { userIds: users, door: "in HQ" });
  await audit(user.id, c.id, "website.extra", { naam: c.site_naam, van: van.id });
  return { id: c.id };
}
export const PRIJS = () => ({ buildCents: OFFER.buildCents, monthlyCents: OFFER.monthlyCents });
