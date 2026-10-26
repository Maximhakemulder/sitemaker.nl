// Achtergrondfunctie (max. 15 minuten): ochtendbriefings van managers en directeur, en antwoorden op vragen.
import { runJob, checkTeamKey } from "../lib/team.mjs";

import { meet } from "../lib/credits.mjs";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch {}
  if (!b.job || !checkTeamKey(JSON.stringify(b.job), b.key)) return new Response("nee", { status: 403 });
  const t0 = Date.now();
  try { await runJob(b.job); } finally { await meet("compute_ms", Date.now() - t0).catch(() => {}); }
  return new Response("ok");
};
