// Achtergrondfunctie (max. 15 minuten): laat Claude één wijziging verwerken tot een voorstel.
import { processChange, triggerKey } from "../lib/sites.mjs";

import { meet } from "../lib/credits.mjs";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch {}
  const id = Number(b.id);
  if (!id || b.key !== triggerKey(id)) return new Response("nee", { status: 403 });
  const t0 = Date.now();
  try { await processChange(id); } finally { await meet("compute_ms", Date.now() - t0).catch(() => {}); }
  return new Response("ok");
};
