// Werkbestanden van de marketing-taak (mockups, video's, Kive-beelden) met een publieke, onraadbare link.
// Nodig omdat Kive en Canva alleen publieke https-links kunnen ophalen. Bestanden in Blobs onder media/<sleutel>.<ext>.
import crypto from "node:crypto";
import { fail } from "./core.mjs";
import { putFile, getFile } from "./files.mjs";

const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
const EXT = Object.fromEntries(Object.entries(TYPES).map(([e, t]) => [t, e === "jpeg" ? "jpg" : e]));

async function bewaar(buf, ext, base) {
  if (!TYPES[ext]) fail(400, "Onbekend bestandstype.");
  if (!buf.length || buf.length > 40 * 1024 * 1024) fail(400, "Bestand is leeg of groter dan 40 MB.");
  const key = `${crypto.randomBytes(16).toString("base64url")}.${ext}`;
  await putFile(`media/${key}`, buf, { type: TYPES[ext], name: key });
  return { ok: true, url: `${base}/api/media/${key}`, bytes: buf.length };
}
// PUT taak/media?ext=png met het bestand als body.
export async function upload(req, base) {
  const ext = String(new URL(req.url).searchParams.get("ext") || "").toLowerCase();
  return bewaar(Buffer.from(await req.arrayBuffer()), ext, base);
}
// POST taak/media {url}: haalt een bestand op (bijv. een Kive-beeld) en bewaart het.
export async function ophalen(url, base) {
  if (!/^https:\/\//.test(String(url || ""))) fail(400, "url (https) is verplicht.");
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) fail(400, `Ophalen lukte niet (${r.status}).`);
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!EXT[type]) fail(400, `Onbekend bestandstype ${type || "?"}.`);
  return bewaar(Buffer.from(await r.arrayBuffer()), EXT[type], base);
}
export async function serveer(key) {
  if (!/^[A-Za-z0-9_-]{22}\.(png|jpg|webp|mp4|webm|mov)$/.test(String(key || ""))) return new Response("Niet gevonden", { status: 404 });
  const buf = await getFile(`media/${key}`);
  if (!buf) return new Response("Niet gevonden", { status: 404 });
  return new Response(buf, { headers: { "content-type": TYPES[key.split(".").pop()], "cache-control": "public, max-age=604800, immutable", "x-content-type-options": "nosniff", "x-robots-tag": "noindex", "access-control-allow-origin": "*" } });
}
