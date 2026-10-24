// Draait elke 5 minuten: B2B-mail versturen, inbox lezen, scout en research, en de online-check van klantsites.
// Netlify kapt geplande functies af na ongeveer 15 seconden; daarom kleine porties.
import { withLock, one, q } from "../lib/core.mjs";
import { sendBatch, scanInbox, runScout, runResearch } from "../lib/b2b.mjs";
import { runChecks } from "../lib/uptime.mjs";
import { retryStuck, autoReady } from "../lib/sites.mjs";
import { sendReminders } from "../lib/agenda.mjs";
import { runConcepts } from "../lib/concepts.mjs";
import { pulse, maybeBriefings } from "../lib/team.mjs";

export default async () => {
  const started = Date.now();
  const left = () => 13000 - (Date.now() - started);
  const step = async (name, fn, ttl = 20000) => { try { const r = await withLock(name, fn, ttl); await pulse(name, r).catch(() => {}); return r; } catch (e) { console.log(`[tick] ${name}:`, e.message); } };

  await step("uptime", () => runChecks({ max: 8 }));
  await step("agenda-herinnering", () => sendReminders());
  await step("concepten", () => runConcepts({ max: 2 }));
  await step("briefings", () => maybeBriefings());
  if (autoReady()) await step("ai-retry", () => retryStuck());
  if (left() > 9000) await step("b2b-send", () => sendBatch({ max: 3, budgetMs: Math.min(8000, left() - 3000) }));
  const last = (await one("SELECT value FROM settings WHERE key = 'inbox_scan'"))?.value;
  if (left() > 8000 && (!last || Date.now() - Date.parse(last.at) > 30 * 60000)) {
    const res = await step("inbox", () => scanInbox({ days: 14, max: 120 }), 25000);
    await q(`INSERT INTO settings (key, value) VALUES ('inbox_scan', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ at: new Date().toISOString(), ...(res || {}) })]).catch(() => {});
  }
  if (left() > 6000) await step("scout", () => runScout());
  if (left() > 6000) await step("research", () => runResearch({ max: 2, budgetMs: left() - 3000 }));
};

export const config = { schedule: "*/5 * * * *" };
