// GitHub-koppeling voor klantsites: repo's aanmaken, bestanden lezen/schrijven, branches en pull requests.
// Sleutels in Netlify: GITHUB_TOKEN (fine-grained token of app-token) en GITHUB_ORG (organisatie of gebruiker).
import { env, fail } from "./core.mjs";

export const githubReady = () => !!(env("GITHUB_TOKEN") && env("GITHUB_ORG"));
export const githubOwner = () => env("GITHUB_ORG");

async function gh(method, path, body, { ok404 = false } = {}) {
  if (env("GITHUB_FAKE")) return fakeGh(method, path, body, ok404);
  if (!githubReady()) fail(503, "GitHub is nog niet gekoppeld. Zet GITHUB_TOKEN en GITHUB_ORG in Netlify.");
  const r = await fetch("https://api.github.com" + path, {
    method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${env("GITHUB_TOKEN")}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "sitemaker-hq" },
  });
  if (ok404 && r.status === 404) return null;
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`GitHub: ${d.message || r.status}${d.errors ? " (" + JSON.stringify(d.errors).slice(0, 200) + ")" : ""}`); e.status = r.status; throw e;
  }
  return d;
}

// Nieuwe repo in de organisatie (of, als GITHUB_ORG de eigen gebruiker is, onder de gebruiker).
export async function createRepo(name, description) {
  const owner = githubOwner();
  const me = await gh("GET", "/user").catch(() => null);
  const path = me && me.login && me.login.toLowerCase() === owner.toLowerCase() ? "/user/repos" : `/orgs/${owner}/repos`;
  return gh("POST", path, { name, description, private: true, auto_init: true, has_issues: false, has_wiki: false, has_projects: false });
}
export const getRepo = (repo) => gh("GET", `/repos/${repo}`, null, { ok404: true });

// Meerdere bestanden in één commit op een branch zetten (Git Data API).
export async function commitFiles(repo, branch, files, message, { createFrom } = {}) {
  let base;
  if (createFrom) {
    base = (await gh("GET", `/repos/${repo}/git/ref/heads/${createFrom}`)).object.sha;
  } else {
    base = (await gh("GET", `/repos/${repo}/git/ref/heads/${branch}`)).object.sha;
  }
  const baseCommit = await gh("GET", `/repos/${repo}/git/commits/${base}`);
  const tree = [];
  for (const f of files) {
    const blob = await gh("POST", `/repos/${repo}/git/blobs`, { content: Buffer.from(f.content).toString("base64"), encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nt = await gh("POST", `/repos/${repo}/git/trees`, { base_tree: baseCommit.tree.sha, tree });
  const commit = await gh("POST", `/repos/${repo}/git/commits`, { message, tree: nt.sha, parents: [base] });
  if (createFrom) {
    const bestaat = await gh("GET", `/repos/${repo}/git/ref/heads/${branch}`, null, { ok404: true });
    if (bestaat) await gh("PATCH", `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
    else await gh("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  } else {
    await gh("PATCH", `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha });
  }
  return commit.sha;
}

export async function readFile(repo, path, ref = "main") {
  const d = await gh("GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, null, { ok404: true });
  if (!d) return null;
  return Buffer.from(d.content, "base64").toString("utf8");
}

export const openPr = (repo, branch, title, body) => gh("POST", `/repos/${repo}/pulls`, { title, body, head: branch, base: "main" });
export const mergePr = (repo, number, title) => gh("PUT", `/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash", commit_title: title });
export const closePr = (repo, number) => gh("PATCH", `/repos/${repo}/pulls/${number}`, { state: "closed" });
export const deleteBranch = (repo, branch) => gh("DELETE", `/repos/${repo}/git/refs/heads/${branch}`, null, { ok404: true }).catch(() => null);

// ---------------------------------------------------------------- nep-GitHub voor tests (GITHUB_FAKE=1)
const F = globalThis.__ghFake || (globalThis.__ghFake = { repos: {}, n: 0, prs: {} });
function fakeGh(method, path, body, ok404) {
  const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
  const sha = () => "sha" + (++F.n);
  if (method === "GET" && path === "/user") return { login: "maxim" };
  if (method === "POST" && /\/repos$/.test(path)) {
    const full = `${env("GITHUB_ORG")}/${body.name}`;
    if (F.repos[full]) { const e = new Error("GitHub: name already exists"); e.status = 422; throw e; }
    const c = sha(); F.repos[full] = { refs: { main: c }, commits: { [c]: { files: {} } } };
    return { full_name: full, html_url: `https://github.com/${full}` };
  }
  if (!m) return {};
  const repo = F.repos[m[1]], rest = m[2] || "";
  if (!repo) { if (ok404) return null; const e = new Error("GitHub: Not Found"); e.status = 404; throw e; }
  if (method === "GET" && rest === "") return { full_name: m[1] };
  let r;
  if ((r = rest.match(/^\/git\/ref\/heads\/(.+)$/))) { const s = repo.refs[r[1]]; if (!s) { if (ok404) return null; const e = new Error("Not Found"); e.status = 404; throw e; } return { object: { sha: s } }; }
  if ((r = rest.match(/^\/git\/commits\/(.+)$/)) && method === "GET") return { tree: { sha: r[1] } };
  if (rest === "/git/blobs") { const s = sha(); (F.blobs ||= {})[s] = Buffer.from(body.content, "base64").toString("utf8"); return { sha: s }; }
  if (rest === "/git/trees") { const s = sha(); const basis = repo.commits[body.base_tree]?.files || {}; const files = { ...basis }; for (const t of body.tree) files[t.path] = F.blobs[t.sha]; repo.commits[s] = { files }; return { sha: s }; }
  if (rest === "/git/commits" && method === "POST") { repo.commits[body.tree] && (repo.commits[body.tree].parent = body.parents[0]); return { sha: body.tree }; }
  if ((r = rest.match(/^\/git\/refs\/heads\/(.+)$/))) { if (method === "DELETE") { delete repo.refs[r[1]]; return {}; } repo.refs[r[1]] = body.sha; return {}; }
  if (rest === "/git/refs") { repo.refs[body.ref.replace("refs/heads/", "")] = body.sha; return {}; }
  if ((r = rest.match(/^\/contents\/(.+?)\?ref=(.+)$/))) { const c = repo.commits[repo.refs[decodeURIComponent(r[2])]]; const v = c?.files[r[1]]; if (v == null) { if (ok404) return null; const e = new Error("Not Found"); e.status = 404; throw e; } return { content: Buffer.from(v).toString("base64") }; }
  if (rest === "/pulls" && method === "POST") { const n = Object.keys(F.prs).length + 1; F.prs[`${m[1]}#${n}`] = { head: body.head, state: "open" }; return { number: n, html_url: `https://github.com/${m[1]}/pull/${n}` }; }
  if ((r = rest.match(/^\/pulls\/(\d+)\/merge$/))) { const p = F.prs[`${m[1]}#${r[1]}`]; repo.refs.main = repo.refs[p.head]; p.state = "merged"; return { merged: true }; }
  if ((r = rest.match(/^\/pulls\/(\d+)$/))) { F.prs[`${m[1]}#${r[1]}`].state = body.state; return {}; }
  return {};
}
export const __ghFake = F;
