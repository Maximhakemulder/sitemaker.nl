// Achtergrondfunctie (max. 15 minuten): laat Claude één wijziging verwerken tot een voorstel.
import { processChange, triggerKey } from "../lib/sites.mjs";

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch {}
  const id = Number(b.id);
  if (!id || b.key !== triggerKey(id)) return new Response("nee", { status: 403 });
  await processChange(id);
  return new Response("ok");
};
