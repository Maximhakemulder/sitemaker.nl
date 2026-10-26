// Achtergrondfunctie (max. 15 minuten): bekijkt de website van één lead en laat Claude er een concept van maken.
import { processConcept, checkTriggerKey } from "../lib/concepts.mjs";

import { meet } from "../lib/credits.mjs";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch {}
  const id = Number(b.id);
  if (!id || !checkTriggerKey(id, b.key)) return new Response("nee", { status: 403 });
  const t0 = Date.now();
  try { await processConcept(id); } finally { await meet("compute_ms", Date.now() - t0).catch(() => {}); }
  return new Response("ok");
};
