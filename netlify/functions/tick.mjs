// Draait elke 5 minuten: B2B-mail versturen, inbox lezen, scout en research, en de online-check van klantsites.
// Netlify kapt geplande functies af na ongeveer 15 seconden; daarom kleine porties.
import { withLock, one, q, env, getSettings, saveSetting } from "../lib/core.mjs";
import { mailReady, notifyStaff } from "../lib/mail.mjs";
import { sendBatch, scanInbox, runScout, runResearch } from "../lib/b2b.mjs";
import { runChecks } from "../lib/uptime.mjs";
import { retryStuck, autoReady } from "../lib/sites.mjs";
import { sendReminders } from "../lib/agenda.mjs";
import { runConcepts, vulFormulierenAan } from "../lib/concepts.mjs";
import { pulse, maybeBriefings } from "../lib/team.mjs";
import { runDomainChecks } from "../lib/domains.mjs";
import { runCancellations, retryDrafts } from "../lib/service.mjs";
import { controleer as controleerCredits, spaarstand, meet } from "../lib/credits.mjs";

export default async () => {
  const started = Date.now();
  try { await ronde(started); } finally { await meet("compute_ms", Date.now() - started).catch(() => {}); }
};

async function ronde(started) {
  const left = () => 13000 - (Date.now() - started);
  const step = async (name, fn, ttl = 20000) => { try { const r = await withLock(name, fn, ttl); await pulse(name, r).catch(() => {}); return r; } catch (e) { console.log(`[tick] ${name}:`, e.message); } };

  // Netlify-credits: elke 30 minuten bijwerken; vanaf 75% spaarstand (zie credits.mjs).
  await step("credits", () => controleerCredits({ budgetMs: Math.min(6000, left() - 5000) }), 40000);
  const spaar = await spaarstand().catch(() => false);
  const minuut = new Date().getMinutes();
  if (!spaar || minuut < 5 || (minuut >= 30 && minuut < 35)) await step("uptime", () => runChecks({ max: 8 }));
  await step("agenda-herinnering", () => sendReminders());
  await step("domeinen", () => runDomainChecks({ max: 4 }));
  await step("opzeggingen", () => runCancellations());
  await step("klantvragen", () => retryDrafts());
  if (!spaar) await step("concepten", () => runConcepts({ max: 2 }));
  if (!spaar && left() > 9000) await step("concept-formulieren", () => vulFormulierenAan());
  if (!spaar) await step("briefings", () => maybeBriefings());
  await step("start-herinnering", () => startHerinnering());
  if (autoReady()) await step("ai-retry", () => retryStuck());
  if (left() > 9000) await step("b2b-send", () => sendBatch({ max: 3, budgetMs: Math.min(8000, left() - 3000) }));
  const last = (await one("SELECT value FROM settings WHERE key = 'inbox_scan'"))?.value;
  if (left() > 8000 && (!last || Date.now() - Date.parse(last.at) > 30 * 60000)) {
    const res = await step("inbox", () => scanInbox({ days: 14, max: 120 }), 25000);
    await q(`INSERT INTO settings (key, value) VALUES ('inbox_scan', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ at: new Date().toISOString(), ...(res || {}) })]).catch(() => {});
  }
  if (!spaar && left() > 6000) await step("scout", () => runScout());
  if (!spaar && left() > 6000) await step("research", () => runResearch({ max: 2, budgetMs: left() - 3000 }));
}

// Eenmalig zodra de mail werkt: herinnering aan Maxim om de start af te ronden (open modus, Mollie, btw).
async function startHerinnering() {
  if (!mailReady() || env("MAIL_TRANSPORT") === "capture") return { skip: true };
  if ((await one("SELECT 1 FROM settings WHERE key = 'start_herinnering'"))) return { klaar: true };
  const s = await getSettings();
  const regels = [
    "De mail werkt. HQ is nu niet meer open: inloggen gaat met een code per mail.",
    env("ADMIN_EMAILS") ? `Log in op HQ met ${env("ADMIN_EMAILS").split(",")[0].trim()}.` : "Let op: ADMIN_EMAILS staat nog niet in Netlify. Zet daar je eigen adres in, anders kun je niet inloggen.",
    env("OPEN_MODE") ? "Haal OPEN_MODE weg uit Netlify (Project configuration › Environment variables), zodat HQ nooit per ongeluk weer open gaat." : null,
    env("MOLLIE_API_KEY") ? null : "Zet de live Mollie-sleutel in Netlify als MOLLIE_API_KEY (begint met live_).",
    s.billing?.pricesIncludeVat !== false ? "Check de btw: in HQ › Instellingen staan de prijzen nu als inclusief btw. Reken je €299,95 en €69,95 exclusief btw, zet dat dan uit." : null,
    "Na het wijzigen van variabelen is één nieuwe deploy nodig.",
  ].filter(Boolean);
  await notifyStaff("Mail werkt: rond de start van Sitemaker af", regels, "/hq/");
  await saveSetting("start_herinnering", { at: new Date().toISOString() });
  return { verstuurd: true };
}

export const config ={ schedule: "*/5 * * * *" };
