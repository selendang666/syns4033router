/**
 * Renders every dashboard menu in a real browser and reports what the page
 * actually shows, plus any console error or failed request it produced.
 *
 * The API audit proves handlers run. It cannot prove a menu renders — a page
 * can return 200 for every call it makes and still throw on the last one.
 *
 *   PW=... node scripts/verify-menu-render.mjs [baseUrl]
 */
import { chromium } from "playwright";
import fs from "node:fs";

const GW = process.argv[2] || process.env.GW || "http://localhost:3001";
const PW = process.env.PW || "";
const OUT = "/tmp/menu-shots";
fs.mkdirSync(OUT, { recursive: true });

const MENUS = [
  ["endpoint", "/dashboard/endpoint"],
  ["providers", "/dashboard/providers"],
  ["system-prompt", "/dashboard/system-prompt"],
  ["models", "/dashboard/models"],
  ["combos", "/dashboard/combos"],
  ["usage", "/dashboard/usage"],
  ["quota", "/dashboard/quota"],
  ["proxy-pools", "/dashboard/proxy-pools"],
  ["cli-tools", "/dashboard/cli-tools"],
  ["mitm", "/dashboard/mitm"],
  ["automation", "/dashboard/automation"],
  ["media", "/dashboard/media"],
  ["skills", "/dashboard/skills"],
  ["console-log", "/dashboard/console-log"],
  ["remote", "/dashboard/remote"],
  ["settings", "/dashboard/settings"],
  ["basic-chat", "/dashboard/basic-chat"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const rows = [];
let current = "(auth)";
page.on("console", (m) => {
  if (m.type() === "error") rows.push({ menu: current, kind: "console", text: m.text().slice(0, 200) });
});
page.on("pageerror", (e) => rows.push({ menu: current, kind: "pageerror", text: String(e).slice(0, 200) }));
page.on("requestfailed", (r) => {
  const u = r.url();
  if (u.startsWith(GW)) rows.push({ menu: current, kind: "reqfail", text: `${r.failure()?.errorText} ${u}` });
});
page.on("response", (r) => {
  if (r.url().startsWith(GW) && r.status() >= 400) {
    rows.push({ menu: current, kind: `http ${r.status()}`, text: r.url().replace(GW, "") });
  }
});

// --- login ---
current = "(login)";
await page.goto(GW + "/login", { waitUntil: "domcontentloaded" });
await page.fill('input[type="password"]', PW);
await page.click('button[type="submit"]');
await page.waitForTimeout(4500);
const afterLogin = page.url();
console.log(`login -> ${afterLogin}`);

// --- walk every menu ---
const report = [];
for (const [name, path] of MENUS) {
  current = name;
  rows.length = 0;
  let status = "?";
  try {
    const resp = await page.goto(GW + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = resp?.status() ?? "?";
    await page.waitForTimeout(2600);
  } catch (e) {
    rows.push({ menu: name, kind: "goto", text: String(e).slice(0, 140) });
  }

  const info = await page.evaluate(() => {
    const txt = document.body.innerText || "";
    const root = document.querySelector("#root");
    return {
      len: txt.length,
      empty: txt.trim().length < 40,
      hasError: /something went wrong|unexpected error|is not defined|cannot read|failed to|internal server error/i.test(txt),
      snippet: txt.replace(/\s+/g, " ").slice(0, 150),
      nodes: root ? root.childElementCount : -1,
    };
  }).catch(() => ({ len: 0, empty: true, hasError: false, snippet: "(evaluate failed)", nodes: -1 }));

  const errs = rows.filter((r) => r.kind !== "http 404" && r.kind !== "http 401");
  const shot = `${OUT}/${name}.png`;
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

  const bad = info.empty || info.hasError || errs.length;
  report.push({ name, status, ...info, errors: errs, shot, bad });
  console.log(`  ${bad ? "FAIL" : "PASS"}  ${name.padEnd(15)} http=${status} nodes=${info.nodes} len=${info.len}`
    + (errs.length ? `  errors=${errs.length}` : ""));
  if (info.hasError) console.log(`        page error text: ${info.snippet}`);
  for (const e of errs.slice(0, 3)) console.log(`        [${e.kind}] ${e.text}`);
}

await browser.close();

const bad = report.filter((r) => r.bad);
console.log(`\n=== ${report.length - bad.length}/${report.length} menu render bersih ===`);
console.log(`screenshot: ${OUT}/`);
if (bad.length) {
  console.log("\nbermasalah:");
  for (const b of bad) console.log(`  ${b.name} — empty=${b.empty} pageError=${b.hasError} errors=${b.errors.length}`);
}