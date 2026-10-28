// Inloggen met een eenmalige code per e-mail. Geen wachtwoorden.
// Klanten en medewerkers loggen op dezelfde manier in; de rol bepaalt wat ze zien.
import crypto from "node:crypto";
import { env, q, one, tx, cleanEmail, EMAIL_RE, sha256, randomToken, fail, escH } from "./core.mjs";
import { sendMail, brandHtml, mailReady } from "./mail.mjs";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = { klant: 30, medewerker: 14, admin: 14 };
export const COOKIE = "sm_sess";

const pepper = () => env("AUTH_SECRET", "sitemaker-local-dev");
const hashCode = (email, code) => crypto.createHmac("sha256", pepper()).update(`${email}:${code}`).digest("hex");
export const ipOf = (req, context) => context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

const adminEmails = () => env("ADMIN_EMAILS").split(",").map(cleanEmail).filter(Boolean);
// HQ staat dicht voor iedereen behalve deze adressen (besluit Maxim, 27-10-2026). Wijzigen: env HQ_ALLEEN (komma-gescheiden).
export const hqAlleen = () => (env("HQ_ALLEEN") || "maxim@sitemaker.nl").split(",").map(cleanEmail).filter(Boolean);

// Zoekt (of maakt, voor ADMIN_EMAILS) de gebruiker bij een adres.
async function findUser(email) {
  let u = await one("SELECT * FROM users WHERE email = $1", [email]);
  if (!u && (adminEmails().includes(email) || hqAlleen().includes(email))) {
    u = await one("INSERT INTO users (email, role, name) VALUES ($1, 'admin', '') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING *", [email]);
  }
  // Wie op de HQ-lijst staat, is beheerder.
  if (u && u.role === "medewerker" && hqAlleen().includes(email)) u = await one("UPDATE users SET role = 'admin' WHERE id = $1 RETURNING *", [u.id]);
  return u;
}

export async function requestCode(rawEmail, ip, portal) {
  const email = cleanEmail(rawEmail);
  if (!EMAIL_RE.test(email)) fail(400, "Vul een geldig e-mailadres in.");
  // Grenzen: per adres 5 codes per uur, per IP 20 per uur.
  const [{ n: perEmail }] = await q("SELECT COUNT(*)::int AS n FROM login_codes WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'", [email]);
  const [{ n: perIp }] = await q("SELECT COUNT(*)::int AS n FROM login_codes WHERE ip = $1 AND ip <> '' AND created_at > NOW() - INTERVAL '1 hour'", [ip]);
  if (perEmail >= 5 || perIp >= 20) fail(429, "Je hebt te vaak een code aangevraagd. Probeer het over een uur opnieuw.");

  const user = await findUser(email);
  const allowed = user && user.active && (portal === "hq" ? user.role !== "klant" && hqAlleen().includes(user.email) : true);
  // We loggen ook pogingen voor onbekende adressen (voor de grens), maar sturen dan geen mail.
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await q("INSERT INTO login_codes (email, code_hash, ip, expires_at, used) VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval, $5)",
    [email, hashCode(email, code), ip, String(CODE_MINUTES), !allowed]);
  if (!allowed) return { sent: false };
  if (!mailReady()) fail(503, "Inloggen per mail is nog niet ingesteld. Neem contact op met Sitemaker.");
  const where = user.role === "klant" ? "het Sitemaker-klantenportaal" : "Sitemaker HQ";
  const res = await sendMail({
    to: email, kind: "inlogcode", subject: `Je inlogcode: ${code}`,
    text: `Je inlogcode voor ${where} is: ${code}\n\nDe code is ${CODE_MINUTES} minuten geldig. Heb je niet geprobeerd in te loggen? Dan kun je deze mail negeren.`,
    html: brandHtml({
      title: "Je inlogcode",
      intro: [`Gebruik deze code om in te loggen op ${escH(where)}:`,
        `<span style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:bold;color:#1C0747;background:#E7F4FF;border-radius:10px;padding:12px 18px">${code}</span>`,
        `De code is ${CODE_MINUTES} minuten geldig.`],
      after: ["Heb je niet geprobeerd in te loggen? Dan kun je deze mail negeren."],
    }),
  });
  if (!res.ok) fail(502, "We konden de code niet versturen. Probeer het zo opnieuw.");
  return { sent: true };
}

export async function verifyCode(rawEmail, rawCode, portal) {
  const email = cleanEmail(rawEmail);
  const code = String(rawCode || "").replace(/\D/g, "");
  if (!EMAIL_RE.test(email) || code.length !== 6) fail(400, "Vul de 6 cijfers uit de mail in.");
  return tx(async (t) => {
    const row = await t.one(`SELECT * FROM login_codes WHERE email = $1 AND used = FALSE AND expires_at > NOW()
                             ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [email]);
    if (!row) fail(400, "Deze code is verlopen of al gebruikt. Vraag een nieuwe code aan.");
    if (row.attempts >= MAX_ATTEMPTS) fail(429, "Te veel pogingen. Vraag een nieuwe code aan.");
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashCode(email, code)));
    if (!ok) {
      await t.q("UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      fail(400, left > 0 ? `Deze code klopt niet. Nog ${left} ${left === 1 ? "poging" : "pogingen"}.` : "Te veel pogingen. Vraag een nieuwe code aan.");
    }
    await t.q("UPDATE login_codes SET used = TRUE WHERE email = $1 AND used = FALSE", [email]);
    const user = await t.one("SELECT * FROM users WHERE email = $1 AND active = TRUE", [email]);
    if (!user) fail(403, "Dit account is niet actief.");
    if (portal === "hq" && user.role === "klant") fail(403, "Dit account heeft geen toegang tot HQ.");
    return createSession(t, user);
  });
}

async function createSession(t, user) {
  const token = randomToken();
  const days = SESSION_DAYS[user.role] || 14;
  await t.q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' days')::interval)", [sha256(token), user.id, String(days)]);
  await t.q("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
  await t.q("DELETE FROM sessions WHERE expires_at < NOW()");
  return { user, cookie: sessionCookie(token, days * 86400) };
}

// Zolang de mail nog niet is ingesteld: beheerders loggen in op HQ met ADMIN_LOGIN_KEY.
// Zodra de mail werkt, gaat deze route vanzelf dicht.
export const keyLoginOpen = () => !mailReady() && env("ADMIN_LOGIN_KEY").length >= 16;
export async function loginWithKey(rawEmail, rawKey, ip) {
  if (!keyLoginOpen()) fail(403, "Inloggen met een toegangssleutel is niet (meer) mogelijk. Gebruik de code per mail.");
  const email = cleanEmail(rawEmail);
  const [{ n }] = await q("SELECT COUNT(*)::int AS n FROM login_codes WHERE ip = $1 AND created_at > NOW() - INTERVAL '1 hour'", [ip]);
  if (n >= 10) fail(429, "Te veel pogingen. Probeer het over een uur opnieuw.");
  await q("INSERT INTO login_codes (email, code_hash, ip, expires_at, used) VALUES ($1, 'sleutel', $2, NOW(), TRUE)", [email, ip]);
  const a = Buffer.from(sha256(String(rawKey || ""))), b = Buffer.from(sha256(env("ADMIN_LOGIN_KEY")));
  if (!adminEmails().includes(email) || !crypto.timingSafeEqual(a, b)) fail(400, "E-mailadres of toegangssleutel klopt niet.");
  const user = await findUser(email);
  if (!user?.active || user.role === "klant") fail(403, "Dit account heeft geen toegang tot HQ.");
  return tx((t) => createSession(t, user));
}

function isLocal() { return env("SM_INSECURE_COOKIE") === "1"; }
export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocal() ? "" : "; Secure"}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isLocal() ? "" : "; Secure"}`;

// "Bekijk als klant": een aparte cookie, zodat de HQ-sessie blijft bestaan.
export const ALS_COOKIE = "sm_als";
function tokenFrom(req, name = COOKIE) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]{20,})`));
  return m ? m[1] : null;
}
async function userForToken(token) {
  if (!token) return null;
  const u = await one(`SELECT u.*, s.customer_id AS sessie_site, s.token_hash AS sessie FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`, [sha256(token)]);
  if (!u) return null;
  if (u.role === "klant") {
    // Meerdere websites: de sessie onthoudt welke website open staat; alleen websites van deze gebruiker.
    const sites = (await q("SELECT customer_id FROM user_sites WHERE user_id = $1 ORDER BY customer_id", [u.id])).map((r) => r.customer_id);
    if (!sites.includes(u.customer_id)) sites.unshift(u.customer_id);
    u.sites = sites;
    if (u.sessie_site && sites.includes(u.sessie_site)) u.customer_id = u.sessie_site;
  }
  return u;
}
// Klant wisselt van website in het portaal.
export async function switchSite(user, customerId) {
  if (!user.sites?.includes(customerId)) fail(404, "Website niet gevonden.");
  await q("UPDATE sessions SET customer_id = $2 WHERE token_hash = $1", [user.sessie, customerId]);
  user.customer_id = customerId;
  return { ok: true };
}

// Open modus: zolang de mail niet is ingesteld en OPEN_MODE=1, is HQ zonder inloggen te gebruiken.
export const openMode = () => env("OPEN_MODE") === "1" && !mailReady();
async function openAdmin() {
  const email = adminEmails()[0] || "beheer@sitemaker.nl";
  return one(`INSERT INTO users (email, role, name) VALUES ($1, 'admin', 'Open modus') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING *`, [email]);
}

// scope "portaal": eerst een "bekijk als klant"-sessie, anders de gewone. scope "hq": de gewone, of in open modus de beheerder.
export async function currentUser(req, scope = "hq") {
  if (scope === "portaal") {
    const als = await userForToken(tokenFrom(req, ALS_COOKIE));
    if (als && als.role === "klant") return Object.assign(als, { viaHq: true });
  }
  const u = await userForToken(tokenFrom(req));
  if (scope === "hq" && !isStaff(u) && openMode()) return Object.assign(await openAdmin(), { open: true });
  return u;
}

export async function logout(req, scope = "hq") {
  const als = tokenFrom(req, ALS_COOKIE);
  if (scope === "portaal" && als) { await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(als)]); return alsCookie("", 0); }
  const token = tokenFrom(req);
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  return clearCookie();
}

const alsCookie = (token, maxAge) => `${ALS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocal() ? "" : "; Secure"}`;

// Een medewerker opent het portaal van een klant, precies zoals de klant het ziet (8 uur geldig, gelogd).
export async function openPortalAs(customerId) {
  if (!openMode()) fail(403, "Het portaal staat niet open.");
  return viewAsCustomer(await openAdmin(), customerId);
}

export async function viewAsCustomer(staff, customerId) {
  const u = await one(`SELECT u.* FROM users u WHERE u.role = 'klant' AND u.active AND (u.customer_id = $1 OR EXISTS (SELECT 1 FROM user_sites us WHERE us.user_id = u.id AND us.customer_id = $1)) ORDER BY u.customer_id = $1 DESC, u.id LIMIT 1`, [customerId]);
  if (!u) fail(400, "Deze klant heeft geen actieve portaalgebruiker.");
  const token = randomToken();
  await q("INSERT INTO sessions (token_hash, user_id, expires_at, customer_id) VALUES ($1, $2, NOW() + INTERVAL '8 hours', $3)", [sha256(token), u.id, customerId]);
  await q("INSERT INTO audit_log (user_id, customer_id, action, detail) VALUES ($1, $2, 'portaal.bekeken_als_klant', $3::jsonb)", [staff.id, customerId, JSON.stringify({ email: u.email })]);
  return { cookie: alsCookie(token, 8 * 3600) };
}

export const isStaff = (u) => !!u && (u.role === "medewerker" || u.role === "admin") && hqAlleen().includes(cleanEmail(u.email));
export function requireUser(u) { if (!u) fail(401, "Je bent niet (meer) ingelogd."); return u; }
export function requireStaff(u) { requireUser(u); if (!isStaff(u)) fail(403, "Geen toegang."); return u; }
export function requireAdmin(u) { requireUser(u); if (u.role !== "admin") fail(403, "Alleen een beheerder kan dit."); return u; }
export function requireCustomer(u) { requireUser(u); if (u.role !== "klant" || !u.customer_id) fail(403, "Geen toegang."); return u; }
