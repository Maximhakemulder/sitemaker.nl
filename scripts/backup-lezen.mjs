// Een back-up uit Sitemakerhq/backups (db/<datum>.smb) ontsleutelen naar JSON.
// Gebruik: BACKUP_KEY=... (of AUTH_SECRET=... als BACKUP_KEY niet is gezet) node scripts/backup-lezen.mjs db/2026-10-28.smb > backup.json
import fs from "node:fs";
import { ontsleutel, backupSleutel } from "../netlify/lib/backup.mjs";
const f = process.argv[2];
if (!f) { console.error("Gebruik: node scripts/backup-lezen.mjs <bestand.smb>"); process.exit(1); }
process.stdout.write(ontsleutel(fs.readFileSync(f), backupSleutel()).toString("utf8"));
