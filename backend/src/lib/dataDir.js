import fs from "node:fs";
import path from "node:path";
import os from "os";

const APP_NAME = "syns4033router";

// Pre-rebrand directory names — if the new dir has no DB yet but a legacy one
// does, keep reading from legacy so an existing install isn't orphaned.
const LEGACY_DIRS = ["syns4033router", "syns4033router"];

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

function looksPopulated(dir) {
  try {
    return fs.existsSync(path.join(dir, "db")) || fs.existsSync(path.join(dir, "db.json"));
  } catch {
    return false;
  }
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();

// One-time notice when an install still holds data under a pre-rebrand dir.
if (!process.env.DATA_DIR) {
  for (const legacy of LEGACY_DIRS) {
    const dir =
      process.platform === "win32"
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), legacy)
        : path.join(os.homedir(), `.${legacy}`);
    if (looksPopulated(dir)) {
      console.warn(
        `[DATA_DIR] data masih ada di ${dir} — set DATA_DIR=${dir} atau migrasi manual ke ~/.${APP_NAME}`
      );
      break;
    }
  }
}
