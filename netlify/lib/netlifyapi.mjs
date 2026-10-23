// Netlify-koppeling: per klant een eigen project, gekoppeld aan de GitHub-repo van die klant.
// Sleutels in Netlify: NETLIFY_API_TOKEN, NETLIFY_ACCOUNT_SLUG (team), NETLIFY_GITHUB_INSTALLATION_ID
// (te vinden onder Team settings › GitHub app). Zonder die laatste koppelt HQ de repo niet zelf,
// maar laat het de stappen zien om het project in Netlify met de hand te koppelen.
import { env, fail } from "./core.mjs";

export const netlifyReady = () => !!(env("NETLIFY_API_TOKEN") && env("NETLIFY_ACCOUNT_SLUG"));
export const netlifyLinkReady = () => netlifyReady() && !!env("NETLIFY_GITHUB_INSTALLATION_ID");

async function nf(method, path, body) {
  if (env("NETLIFY_FAKE")) return { id: "site-" + Math.random().toString(36).slice(2, 8), name: body?.name || "test", ssl_url: `https://${body?.name || "test"}.netlify.app` };
  if (!netlifyReady()) fail(503, "Netlify is nog niet gekoppeld. Zet NETLIFY_API_TOKEN en NETLIFY_ACCOUNT_SLUG.");
  const r = await fetch("https://api.netlify.com/api/v1" + path, {
    method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${env("NETLIFY_API_TOKEN")}`, "content-type": "application/json", "user-agent": "sitemaker-hq" },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`Netlify: ${d.message || r.status}`); e.status = r.status; throw e; }
  return d;
}

export async function createSite({ name, repoFullName, repoId }) {
  const body = { name };
  if (netlifyLinkReady()) {
    body.repo = {
      provider: "github", repo: repoFullName, id: repoId, private: true, branch: "main",
      cmd: "node build.mjs", dir: "dist", installation_id: Number(env("NETLIFY_GITHUB_INSTALLATION_ID")),
    };
  }
  const site = await nf("POST", `/${env("NETLIFY_ACCOUNT_SLUG")}/sites`, body);
  return { id: site.id, name: site.name, url: site.ssl_url || site.url, linked: !!body.repo };
}

export const previewUrl = (siteName, prNumber) => (siteName && prNumber ? `https://deploy-preview-${prNumber}--${siteName}.netlify.app` : "");
