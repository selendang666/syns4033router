"use server";


import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { parseTOML, stringifyTOML } from "confbox";

const execAsync = promisify(exec);

const getJcodeConfigDir = () => path.join(os.homedir(), ".jcode");
const getConfigPath = () => path.join(getJcodeConfigDir(), "config.toml");

const getProviderEnvPath = () => {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configDir, "jcode", "provider-syns4033router.env");
};

const checkJcodeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where jcode" : "which jcode";
    await execAsync(command, { windowsHide: true });
    return true;
  } catch {
    try {
      await fs.access(getJcodeConfigDir());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfig = async () => {
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return parseTOML(content);
  } catch (error) {
    return { providers: {} };
  }
};

const hasSYNS4033RouterConfig = (config) => {
  if (!config || !config.providers) return false;

  const providers = config.providers;

  if (providers["syns4033router"]) return true;

  for (const [name, provider] of Object.entries(providers)) {
    if (provider.base_url && provider.base_url.includes("localhost:3001")) {
      return true;
    }
  }

  return false;
};

const writeConfig = async (config) => {
  const configPath = getConfigPath();
  const content = stringifyTOML(config);
  await fs.writeFile(configPath, content, "utf-8");
};

const readProviderEnv = async () => {
  try {
    const envPath = getProviderEnvPath();
    const content = await fs.readFile(envPath, "utf-8");
    const env = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        env[key] = value;
      }
    }

    return env;
  } catch {
    return {};
  }
};

const writeProviderEnv = async (env) => {
  const envPath = getProviderEnvPath();
  let content = "# jcode provider environment variables\n";

  for (const [key, value] of Object.entries(env)) {
    content += `${key}="${value}"\n`;
  }

  await fs.writeFile(envPath, content, "utf-8");
};

export async function GET(req, res) {
  const isInstalled = await checkJcodeInstalled();

  if (!isInstalled) {
    return res.json({
      installed: false,
      message: "jcode not installed. Install via: curl -fsSL https://raw.githubusercontent.com/1jehuang/jcode/master/scripts/install.sh | bash",
    });
  }

  const config = await readConfig();
  const hasSYNS4033Router = hasSYNS4033RouterConfig(config);

  return res.json({
    installed: true,
    config,
    hasSYNS4033Router,
    configPath: getConfigPath(),
  });
}

export async function POST_handler(req, res) {
  try {
    const { baseUrl, apiKey, models } = req.body || {};

    if (!baseUrl || !apiKey) {
      return res.status(400).json(
        { error: "baseUrl and apiKey are required" });
    }

    const normalizedBaseUrl = baseUrl.endsWith("/v1")
      ? baseUrl
      : `${baseUrl}/v1`;

    let config = await readConfig();

    if (!config.providers) {
      config.providers = {};
    }

    config.providers["syns4033router"] = {
      type: "openai-compatible",
      base_url: normalizedBaseUrl,
      auth: "bearer",
      api_key_env: "JCODE_SYNS4033_API_KEY",
      env_file: "provider-syns4033router.env",
      default_model: models && models.length > 0 ? models[0] : "cc/claude-opus-4-7",
      requires_api_key: true,
    };

    const configDir = getJcodeConfigDir();
    await fs.mkdir(configDir, { recursive: true });

    await writeConfig(config);

    const xdgConfigDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const jcodeConfigDir = path.join(xdgConfigDir, "jcode");
    await fs.mkdir(jcodeConfigDir, { recursive: true });

    const env = await readProviderEnv();
    env.JCODE_SYNS4033_API_KEY = apiKey;
    await writeProviderEnv(env);

    return res.json({
      success: true,
      message: "jcode configured successfully. Use: jcode --provider-profile syns4033router",
      configPath: getConfigPath(),
    });
  } catch (error) {
    console.error("Error configuring jcode:", error);
    return res.status(500).json(
      { error: error.message });
  }
}

export async function DELETE(req, res) {
  try {
    const config = await readConfig();

    if (!config.providers) {
      return res.json({ success: true, message: "No configuration to remove" });
    }

    delete config.providers["syns4033router"];

    await writeConfig(config);

    const env = await readProviderEnv();
    delete env.JCODE_SYNS4033_API_KEY;
    await writeProviderEnv(env);

    return res.json({
      success: true,
      message: "syns4033router configuration removed from jcode",
    });
  } catch (error) {
    console.error("Error removing jcode configuration:", error);
    return res.status(500).json(
      { error: error.message });
  }
}
