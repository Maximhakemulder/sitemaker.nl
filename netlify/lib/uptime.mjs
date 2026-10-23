// Online-check van de klantsites: elke ~15 minuten per live site.
import { q, one } from "./core.mjs";
import { notifyStaff } from "./mail.mjs";

export async function checkSite(url) {
  const started = Date.now();
  try {
    let r = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": "Sitemaker-onlinecheck/1.0" }, signal: AbortSignal.timeout(8000) });
    const ms = Date.now() - started;
    try { await r.body?.cancel(); } catch {}
    return { ok: r.status < 400, code: r.status, ms, error: r.status < 400 ? "" : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, code: null, ms: Date.now() - started, error: e.name === "TimeoutError" ? "Geen antwoord binnen 8 seconden" : (e.cause?.code || e.message || "Niet bereikbaar").toString().slice(0, 120) };
  }
}

export async function recordCheck(c, res) {
  const fails = res.ok ? 0 : (c.check_fails || 0) + 1;
  await q("UPDATE customers SET check_at = NOW(), check_ok = $1, check_code = $2, check_ms = $3, check_fails = $4, check_error = $5 WHERE id = $6",
    [res.ok, res.code, res.ms, fails, res.error || "", c.id]);
  // Melding bij de tweede mislukte check op rij, en als hij weer online is.
  if (!res.ok && fails === 2) await notifyStaff(`Site offline: ${c.company}`, [`${c.site_url} reageert niet (${res.error}).`, "We controleren elke 15 minuten opnieuw."], `/hq/#sites`).catch(() => {});
  if (res.ok && (c.check_fails || 0) >= 2) await notifyStaff(`Site weer online: ${c.company}`, [`${c.site_url} is weer bereikbaar.`], `/hq/#sites`).catch(() => {});
  return { ...res, fails };
}

export async function runChecks({ max = 8 } = {}) {
  const due = await q(`SELECT * FROM customers WHERE site_url <> '' AND site_status = 'live'
                       AND (check_at IS NULL OR check_at < NOW() - INTERVAL '14 minutes') ORDER BY check_at NULLS FIRST LIMIT $1`, [max]);
  const out = await Promise.all(due.map(async (c) => recordCheck(c, await checkSite(c.site_url))));
  return { checked: out.length };
}

export async function checkNow(customerId) {
  const c = await one("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (!c?.site_url) return { ok: false, error: "Geen site-adres ingevuld." };
  return recordCheck(c, await checkSite(c.site_url));
}
