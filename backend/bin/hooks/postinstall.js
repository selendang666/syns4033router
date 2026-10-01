#!/usr/bin/env node

// Postinstall: warm-up SQLite deps into ~/.syns4033router/runtime so the first
// `syns4033router` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");

try {
  ensureSqliteRuntime({ silent: false });
  console.log("[syns4033router] runtime SQLite deps ready");
} catch (e) {
  console.warn(`[syns4033router] runtime warm-up skipped: ${e.message}`);
}

try {
  ensureTrayRuntime({ silent: false });
} catch (e) {
  console.warn(`[syns4033router] tray runtime skipped: ${e.message}`);
}

process.exit(0);
