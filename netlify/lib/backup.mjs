// Nachtelijke back-up van de database: alle tabellen als JSON, gzip, versleuteld (AES-256-GCM),
// in de privé-repo <GITHUB_ORG>/backups (map db/). Laatste 30 dagen blijven staan.
// Sleutel: env BACKUP_KEY, anders afgeleid van AUTH_SECRET. Terugzetten/lezen: scripts/backup-lezen.mjs.
import zlib from "node:zlib";
import crypto from "node:crypto";
import { q, one, env, dayKey } from "./core.mjs";
import { githubReady, githubOwner, getRepo, createRepo, commitFiles } from "./github.mjs";

const OVERSLAAN = new Set(["sessions", "login_codes"]); // tijdelijk en gevoelig, niet nodig om terug te zetten
const BEWAAR_DAGEN = 30;
export const backupRepo = () => `${githubOwner()}/backups`;

export function backupSleutel(raw = env("BACKUP_KEY")) {
  return crypto.createHash("sha256").update(raw ? String(raw) : "sitemaker-backup:" + env("AUTH_SECRET")).digest();
}
export function versleutel(buf, key = backupSleutel()) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from("SMB1"), iv, c.getAuthTag(), enc]);
}
export function ontsleutel(buf, key = backupSleutel()) {
  if (buf.subarray(0, 4).toString() !== "SMB1") throw new Error("Geen Sitemaker-back-up.");
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(32)), d.final()]));
}

async function bewaar(status) {
  await q(`INSERT INTO settings (key, value) VALUES ('backup_status', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(status)]);
}
export async function backupStatus() {
  return (await one("SELECT value FROM settings WHERE key = 'backup_status'"))?.value || null;
}

export async function maakBackup() {
  if (!githubReady()) return { skipped: "geen GitHub" };
  const t0 = Date.now();
  try {
    const tabellen = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"))
      .map((r) => r.table_name).filter((t) => !OVERSLAAN.has(t) && /^[a-z0-9_]+$/.test(t));
    const data = { gemaakt: new Date().toISOString(), tabellen: {} };
    let rijen = 0;
    for (const t of tabellen) { const rows = await q(`SELECT * FROM "${t}"`); data.tabellen[t] = rows; rijen += rows.length; }
    const buf = versleutel(zlib.gzipSync(Buffer.from(JSON.stringify(data))));
    const repo = backupRepo();
    if (!(await getRepo(repo))) {
      await createRepo("backups", "Versleutelde back-ups van de Sitemaker-database (automatisch, niet bewerken)");
      for (let i = 0; i < 10 && !(await getRepo(repo).catch(() => null))?.default_branch; i++) await new Promise((r) => setTimeout(r, 800));
      await new Promise((r) => setTimeout(r, 1500));
    }
    const dag = dayKey();
    const files = [{ path: `db/${dag}.smb`, content: buf }];
    // oude back-ups (ouder dan 30 dagen) weghalen
    const lijst = env("GITHUB_FAKE") ? [] : await fetch(`https://api.github.com/repos/${repo}/contents/db`, { headers: { authorization: `Bearer ${env("GITHUB_TOKEN")}`, accept: "application/vnd.github+json", "user-agent": "sitemaker-hq" } })
      .then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const grens = new Date(Date.now() - BEWAAR_DAGEN * 86400000).toISOString().slice(0, 10);
    for (const f of Array.isArray(lijst) ? lijst : []) { const m = /^(\d{4}-\d{2}-\d{2})\.smb$/.exec(f.name); if (m && m[1] < grens) files.push({ path: `db/${f.name}`, content: null }); }
    await commitFiles(repo, "main", files, `Back-up ${dag}`);
    const status = { ok: true, at: new Date().toISOString(), bestand: `db/${dag}.smb`, repo, bytes: buf.length, tabellen: tabellen.length, rijen, ms: Date.now() - t0 };
    await bewaar(status);
    return status;
  } catch (e) {
    const status = { ok: false, at: new Date().toISOString(), fout: e.message };
    await bewaar(status).catch(() => {});
    return status;
  }
}
