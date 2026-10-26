// Claude via de Netlify AI Gateway (zet ANTHROPIC_BASE_URL/ANTHROPIC_API_KEY zelf) of rechtstreeks.
import { env } from "./core.mjs";

export const aiReady = () => !!env("ANTHROPIC_API_KEY") || !!env("AI_FAKE");

export async function claude({ system, prompt, maxTokens = 8000, timeoutMs = 120000, model, images }) {
  if (env("AI_FAKE")) return globalThis.__aiFake ? globalThis.__aiFake({ system, prompt, images }) : "{}";
  const base = (env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/+$/, "");
  const r = await fetch(base + "/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: model || env("AI_MODEL", "claude-sonnet-5-5"), max_tokens: maxTokens, system, messages: [{ role: "user", content: images?.length ? [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })), { type: "text", text: prompt }] : prompt }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d?.error?.message || `AI: status ${r.status}`); e.status = r.status; throw e; }
  // Via de Netlify AI Gateway kost dit credits: meetellen voor de credit-bewaker.
  if (env("ANTHROPIC_BASE_URL") && d.usage) { const { meet, aiCredits } = await import("./credits.mjs"); await meet("ai_credits", aiCredits(d.model || model || env("AI_MODEL", "claude-sonnet-5-5"), d.usage)); }
  return (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

// JSON uit een antwoord halen (ook als er tekst omheen staat).
export function parseJson(text) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}
