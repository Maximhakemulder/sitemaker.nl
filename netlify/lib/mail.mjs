// Mail via SMTP (standaard Hostnet, zoals bij de andere HQ's). Alles wordt gelogd in mail_log.
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { env, q, escH, publicBase, getSettings, hqUrl } from "./core.mjs";

export function mailEnv() {
  const user = env("MAIL_USER");
  return {
    user, pass: env("MAIL_PASSWORD"), from: env("MAIL_FROM", user),
    smtpHost: env("SMTP_HOST", "smtp.hostnet.nl"), smtpPort: Number(env("SMTP_PORT", "587")),
    imapHost: env("IMAP_HOST", "imap.hostnet.nl"), imapPort: Number(env("IMAP_PORT", "993")),
  };
}
export const mailReady = () => env("MAIL_TRANSPORT") === "capture" || !!(env("MAIL_USER") && env("MAIL_PASSWORD"));

// Testmodus: mails worden in het geheugen bewaard in plaats van verstuurd.
export const captured = [];

export function transport(m = mailEnv()) {
  if (env("MAIL_TRANSPORT") === "capture") return { sendMail: async (msg) => { captured.push(msg); return { messageId: msg.messageId }; } };
  return nodemailer.createTransport({
    host: m.smtpHost, port: m.smtpPort, secure: m.smtpPort === 465, requireTLS: m.smtpPort !== 465,
    auth: { user: m.user, pass: m.pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}

export function mailError(e) {
  if (e?.code === "EAUTH") return "Inloggen bij de mailserver lukt niet. Controleer MAIL_USER en MAIL_PASSWORD in Netlify.";
  if (e?.responseCode >= 500) return "De mailserver weigerde dit bericht.";
  return `Versturen lukte niet (${e?.code || e?.responseCode || "verbinding"}).`;
}

// Verstuurt één mail en logt het resultaat. Gooit niet: geeft { ok, error } terug.
export async function sendMail({ to, subject, text, html, kind, ref = "", replyTo, headers, fromName, inReplyTo, references, messageId }) {
  if (!mailReady()) {
    await logMail(to, subject, kind, false, "Mail is nog niet ingesteld (MAIL_USER/MAIL_PASSWORD).", ref);
    return { ok: false, error: "Mail is nog niet ingesteld in Netlify." };
  }
  const m = mailEnv();
  const domain = (m.from || "sitemaker.nl").split("@")[1] || "sitemaker.nl";
  const id = messageId || `<${crypto.randomUUID()}@${domain}>`;
  try {
    await transport(m).sendMail({
      from: { name: fromName || "Sitemaker", address: m.from || "noreply@sitemaker.nl" },
      to, subject, text, html, replyTo, headers, inReplyTo, references, messageId: id,
    });
    await logMail(to, subject, kind, true, "", ref);
    return { ok: true, messageId: id };
  } catch (e) {
    const error = mailError(e);
    await logMail(to, subject, kind, false, error, ref);
    return { ok: false, error, code: e?.code, responseCode: e?.responseCode, response: e?.response };
  }
}

async function logMail(to, subject, kind, ok, error, ref) {
  if (kind === "inlogcode") subject = "Je inlogcode: ••••••"; // codes nooit bewaren
  await q("INSERT INTO mail_log (to_email, subject, kind, ok, error, ref) VALUES ($1,$2,$3,$4,$5,$6)",
    [String(to).slice(0, 300), String(subject).slice(0, 300), kind, ok, error, String(ref || "")]).catch(() => {});
}

// Huisstijl-mail voor transactionele berichten (inlogcode, wijziging, factuur, welkom).
export function brandHtml({ title, intro = [], button, after = [], footnote = "" }) {
  const base = publicBase();
  const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#1C0747">${t}</p>`;
  const btn = button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 18px"><tr><td style="border-radius:10px;background:#FF5757">
<a href="${escH(button.href)}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1C0747;text-decoration:none;border-radius:10px">${escH(button.label)}</a></td></tr></table>` : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(title)}</title></head>
<body style="margin:0;padding:0;background:#E7F4FF">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="background:#1C0747;border-radius:16px 16px 0 0;padding:20px 24px"><img src="${base}/assets/brand/logo-wit.png" width="170" alt="Sitemaker" style="display:block;border:0;width:170px;height:auto"></div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:26px 24px 12px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:28px;color:#1C0747">${escH(title)}</h1>
${intro.map(p).join("")}${btn}${after.map(p).join("")}
</div>
<p style="margin:16px 4px;font-size:12px;line-height:18px;color:#5b5577">${footnote || "Sitemaker · Maak van je website je beste verkoper"}</p>
</div></body></html>`;
}

// "/hq/#klant/3" → "https://hq.sitemaker.nl/#klant/3" (of <website>/hq/#klant/3 zonder HQ_URL).
const hqLink = (link) => hqUrl() + String(link).replace(/^\/hq\/?/, "");
export async function notifyStaff(subject, lines, link) {
  const s = await getSettings();
  const to = s.notify?.email || env("NOTIFY_EMAIL") || mailEnv().from;
  if (!to) return { ok: false };
  const base = publicBase();
  return sendMail({
    to, subject, kind: "melding",
    text: lines.join("\n") + (link ? `\n\nOpen in HQ: ${hqLink(link)}` : ""),
    html: brandHtml({ title: subject, intro: lines.map(escH), button: link ? { label: "Open in HQ", href: hqLink(link) } : null }),
  });
}
