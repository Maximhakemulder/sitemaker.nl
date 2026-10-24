// Achtergrondfunctie (max. 15 minuten): ochtendbriefings van managers en directeur, en antwoorden op vragen.
import { runJob, checkTeamKey } from "../lib/team.mjs";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch {}
  if (!b.job || !checkTeamKey(JSON.stringify(b.job), b.key)) return new Response("nee", { status: 403 });
  await runJob(b.job);
  return new Response("ok");
};
