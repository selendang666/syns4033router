#!/usr/bin/env node
// guard-no-creds.mjs — menolak commit yang membawa kredensial ke dalam repo.
//
// Scanner ini membuktikan dirinya dulu: kalau tidak bisa membedakan aman dari
// berbahaya pada sentinel, ia keluar 1 alih-alih melaporkan repo bersih.
//
// usage: node scripts/guard-no-creds.mjs [--self-test]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["backend/src", "backend/open-sse", "frontend/src", "scripts"];
const SELF = "guard-no-creds.mjs"; // fixture self-test di file ini memang disengaja
const EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".yml", ".yaml"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", ".cache"]);

// Prefiks yang mustahil muncul sebagai placeholder.
const PREFIX_RULES = [
  ["GOOGLE_CLIENT_SECRET", /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ["IFLOW_CLIENT_SECRET", /\b4Z3YjXyc[A-Za-z0-9_-]{10,}/],
  ["OPENAI_KEY", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["GITHUB_TOKEN", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
  ["GITHUB_PAT", /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ["AWS_KEY", /\bAKIA[0-9A-Z]{16}\b/],
  ["GOOGLE_API_KEY", /\bAIzaSy[A-Za-z0-9_-]{30,}/],
  ["SLACK_TOKEN", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["STRIPE_KEY", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ["PRIVATE_KEY", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["RAILWAY_URL", /\brailway\.com\/project\/[0-9a-f-]{36}\b/],
];

// Penugasan kunci sensitif ke literal — satu-satunya sumber dari mana secret bisa masuk.
const KEY_RULE =
  /(clientSecret|client_secret|apiKey|api_key|accessToken|access_token|refreshToken|authToken|password|passwd|secret)\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/gi;

// Nilai yang jelas bukan secret. PERINGATAN: jangan pernah menambahkan
// alternatif kosong di depan — `^(?:|X)` match nol-panjang di posisi 0 sehingga
// SETIAP nilai lolos sebagai "aman" (bug yang pernah disables scanner ini).
const BENIGN = [
  /^(?:process\.env|\$\{|<[^>]*>|\{\{[^}]*\}\}|REDACTED|CHANGEME|TODO|CHANGE_ME|placeholder|example|your[-_ ])/i,
  /^(?:https?:|wss?:|data:|\/)/i, // URL endpoint
  /^(?:secret|password|token|api[-_]?key|null|undefined|true|false)/i,
  /^[a-z]{1,5}-[a-z]+(?:-[a-z]+)?-\d{2,4}$/i, // class utility: bg-amber-500
  /[A-Za-z]{3,}\s+[A-Za-z]{3,}/, // kalimat UI: "API Key is required"
];
const IS_COMMENT = /^\s*(?:\/\/|\*|\/\*)/;

const isBenign = (v) => BENIGN.some((re) => re.test(v));

// Secret sungguhan: >=12 karakter, ada huruf DAN angka. Inilah yang berhasil lolos
// seluruh filter di atas (lihat --self-test: "hunter2hunter2" terdeteksi).
const looksLikeSecret = (v) => v.length >= 12 && /\d/.test(v) && /[A-Za-z]/.test(v);

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) yield* walk(path.join(dir, e.name));
    } else if (EXT.has(path.extname(e.name))) {
      yield path.join(dir, e.name);
    }
  }
}

function scanText(text, rel, hits) {
  text.split("\n").forEach((line, i) => {
    const at = { file: rel, line: i + 1 };
    for (const [rule, re] of PREFIX_RULES) {
      const m = line.match(re);
      if (m) hits.push({ ...at, rule, snippet: `${rule} · prefix ${m[0].slice(0, 6)}…` });
    }
    if (IS_COMMENT.test(line)) return;
    KEY_RULE.lastIndex = 0;
    for (let km; (km = KEY_RULE.exec(line)); ) {
      const v = km[2].trim();
      if (v.includes("process.env") || isBenign(v) || !looksLikeSecret(v)) continue;
      hits.push({ ...at, rule: `HARDCODED_${km[1]}`, snippet: `${km[1]}: "${v.slice(0, 6)}…"` });
    }
  });
}

function scanTree() {
  const hits = [];
  for (const d of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, d))) {
      if (path.basename(file) === SELF) continue;
      try {
        scanText(fs.readFileSync(file, "utf8"), path.relative(ROOT, file), hits);
      } catch {
        /* binary/terkunci — bukan target */
      }
    }
  }
  return hits;
}

const MUST_FLAG = [
  'clientSecret: "GOCSPX-AAAAAAAAAAAAAAAAAAAAAAAA"',
  'clientSecret: "4Z3YjXycBBBBBBBBBBBBBBBBBBBB"',
  'const k = "sk-CCCCCCCCCCCCCCCCCCCCCCCC"',
  'const t = "ghp_DDDDDDDDDDDDDDDDDDDDDDDDDD"',
  'password: "hunter2hunter2"',
  'apiKey: "AKIAIOSFODNN7EXAMPLE"',
];
const MUST_PASS = [
  'clientSecret: process.env.GEMINI_CLIENT_SECRET || ""',
  'clientSecret: ""',
  'token: "https://oauth2.googleapis.com/token"',
  '// password = "contoh-di-komentar"',
  'apiKey: "<REDACTED>"',
  'apikey: "bg-amber-500"',
  'apikey: "API Key is required"',
  'password: "TEXT NOT NULL"',
];

function selfTest() {
  let ok = true;
  const run = (cases, want) => {
    for (const line of cases) {
      const hits = [];
      scanText(line, "<selftest>", hits);
      const good = want ? hits.length > 0 : hits.length === 0;
      if (!good) ok = false;
      console.log(`    ${good ? "OK    " : "SALAH"}  ${line}`);
    }
  };
  console.log("  [harus terdeteksi]");
  run(MUST_FLAG, true);
  console.log("  [harus lolos]");
  run(MUST_PASS, false);
  return ok;
}

if (!selfTest()) {
  console.error("\nGAGAL: scanner tidak bisa membedakan aman dari berbahaya — jangan percaya hasil nolnya.");
  process.exit(1);
}
if (process.argv.includes("--self-test")) {
  console.log("\nKontrol guard-no-creds: OK (scanner terbukti hidup).");
  process.exit(0);
}

const hits = scanTree();
if (!hits.length) {
  console.log("guard-no-creds: OK — tidak ada kredensial hardcoded di source tree.");
  process.exit(0);
}
console.error(`guard-no-creds: MENOLAK — ${hits.length} temuan:\n`);
for (const h of hits.slice(0, 40)) console.error(`  ${h.file}:${h.line}  [${h.rule}]  ${h.snippet}`);
if (hits.length > 40) console.error(`  … dan ${hits.length - 40} lagi`);
console.error("\nPindahkan nilai ke process.env (lihat backend/.env.example) atau set Railway Variables.");
process.exit(1);