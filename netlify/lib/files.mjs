// Bestanden (factuur-PDF's en bijlagen bij wijzigingen) in Netlify Blobs.
// De opslag is privé: alleen de API serveert ze, na een toegangscontrole.
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import { env } from "./core.mjs";

// Lokaal testen zonder Netlify: SM_LOCAL_FILES=<map> schrijft naar schijf.
const localDir = () => env("SM_LOCAL_FILES");
// Elke keer opnieuw openen: de toegangssleutel van Blobs geldt per aanroep.
const store = () => getStore({ name: "sitemaker-files", consistency: "strong" });

export async function putFile(key, data, meta = {}) {
  const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
  if (localDir()) {
    const p = path.join(localDir(), key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, buf);
    await fs.writeFile(p + ".meta.json", JSON.stringify(meta));
    return key;
  }
  await store().set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: meta });
  return key;
}

export async function getFile(key) {
  if (localDir()) {
    try { return Buffer.from(await fs.readFile(path.join(localDir(), key))); } catch { return null; }
  }
  const ab = await store().get(key, { type: "arrayBuffer" });
  return ab ? Buffer.from(ab) : null;
}

export async function deleteFile(key) {
  if (localDir()) { await fs.rm(path.join(localDir(), key), { force: true }); return; }
  await store().delete(key);
}

// Alles onder een map weg (bijv. concepts/<id>/): ook bestanden die niet (meer) in een lijst staan.
export async function deletePrefix(prefix) {
  if (!prefix || !prefix.endsWith("/")) return 0;
  if (localDir()) { await fs.rm(path.join(localDir(), prefix), { recursive: true, force: true }); return 1; }
  const { blobs } = await store().list({ prefix });
  for (const b of blobs) await store().delete(b.key);
  return blobs.length;
}

export const ALLOWED_UPLOADS = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  "application/pdf": "pdf", "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};
export const MAX_UPLOAD = 4 * 1024 * 1024; // Netlify Functions accepteren tot ~6 MB per verzoek

// Controle op de eerste bytes, zodat een bestand niet als iets anders binnenkomt.
export function sniffOk(buf, type) {
  const b = buf.subarray(0, 12);
  const starts = (...xs) => xs.every((x, i) => b[i] === x);
  switch (type) {
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/gif": return starts(0x47, 0x49, 0x46);
    case "image/webp": return starts(0x52, 0x49, 0x46, 0x46) && buf.subarray(8, 12).toString() === "WEBP";
    case "application/pdf": return buf.subarray(0, 5).toString() === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return starts(0x50, 0x4b, 0x03, 0x04);
    case "application/msword": return starts(0xd0, 0xcf, 0x11, 0xe0);
    case "image/svg+xml": return /<svg[\s>]/i.test(buf.subarray(0, 2000).toString("utf8"));
    case "text/plain": return !buf.subarray(0, 2000).includes(0);
    default: return false;
  }
}

export function safeName(name) {
  return String(name || "bestand").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80) || "bestand";
}

// Downloadrespons: altijd als bijlage of veilig inline (alleen PDF/afbeeldingen, nooit SVG inline).
export function fileResponse(buf, { name, type, inline = false }) {
  const canInline = inline && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(type);
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": type || "application/octet-stream",
      "content-disposition": `${canInline ? "inline" : "attachment"}; filename="${safeName(name)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
