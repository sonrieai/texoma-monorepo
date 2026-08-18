/**
 * Cursor MCP launcher: load Dashboard/.env.local then exec nexhealth-mcp (stdio).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(repoRoot, ".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy .env.example and set NEXHEALTH_API_KEY.`);
    process.exit(1);
  }

  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function resolveMcpExe() {
  const candidates = [
    join(homedir(), ".local", "bin", "nexhealth-mcp.exe"),
    join(homedir(), ".local", "bin", "nexhealth-mcp"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  console.error(
    "nexhealth-mcp not found. Run: uv tool install git+https://github.com/ChrisKildunne/nexhealth-mcp.git",
  );
  process.exit(1);
}

loadEnvFile(envFile);

if (!process.env.NEXHEALTH_API_KEY?.trim()) {
  console.error("NEXHEALTH_API_KEY is empty in .env.local");
  process.exit(1);
}

if (process.env.NEXHEALTH_TIMEZONE && !process.env.NEXHEALTH_TIMEZONE_OVERRIDE) {
  process.env.NEXHEALTH_TIMEZONE_OVERRIDE = process.env.NEXHEALTH_TIMEZONE;
}

process.env.PYTHONWARNINGS = process.env.PYTHONWARNINGS || "ignore";

const exe = resolveMcpExe();
const child = spawn(exe, [], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});

child.on("error", (err) => {
  console.error(`Failed to start ${exe}:`, err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
