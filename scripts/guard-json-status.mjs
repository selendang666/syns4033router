// Guard: res.json(body, { status }) is a silent no-op in Express.
// res.json() takes one argument; the second is discarded, so a refusal the
// author meant to be 400/403/500 ships as 200 and res.ok stays true.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const findings = [];

function closeParen(text, start) {
  let depth = 0, i = start, inStr = null, esc = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === "'" || c === '"' || c === "`") inStr = c;
    else if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function topLevelArgs(inner) {
  const args = []; let depth = 0, inStr = null, esc = false, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === "'" || c === '"' || c === "`") inStr = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) { args.push(inner.slice(start, i)); start = i + 1; }
  }
  args.push(inner.slice(start));
  return args;
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|js)$/.test(name)) continue;
    const src = readFileSync(p, "utf-8");
    const re = /res\.json\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const open = m.index + m[0].length - 1;
      const close = closeParen(src, open);
      if (close < 0) continue;
      const args = topLevelArgs(src.slice(open + 1, close));
      if (args.length < 2) continue;
      const tail = args[1].trim().replace(/,$/, "").trim();
      if (/^\{\s*(status|code)\s*:/.test(tail)) findings.push(p.replace(ROOT, ""));
    }
  }
}

walk(join(ROOT, "backend", "src"));

if (findings.length) {
  console.error(`[guard] FAIL — ${findings.length} call(s) pass a status to res.json(), which ignores it:`);
  for (const f of [...new Set(findings)]) console.error("  " + f);
  process.exit(1);
}
console.log("[guard] clean — no res.json(body, { status }) in backend/src");
