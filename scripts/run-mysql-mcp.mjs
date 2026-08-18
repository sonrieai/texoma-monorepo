/**
 * Cursor MCP launcher: load Dashboard/.env.local then start MySQL MCP (stdio).
 * Maps OD_MYSQL_* from .env.local to @benborla29/mcp-server-mysql env vars.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(repoRoot, ".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy .env.example and set OD_MYSQL_* vars.`);
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

function envFlag(name, fallback = "false") {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  return value.toLowerCase() === "true" ? "true" : "false";
}

function configureMysqlMcpEnv() {
  const host = process.env.OD_MYSQL_HOST?.trim() || "localhost";
  const port = process.env.OD_MYSQL_PORT?.trim() || "3306";
  const user = process.env.OD_MYSQL_USER?.trim() || "root";
  const pass = process.env.OD_MYSQL_PASS?.trim() ?? process.env.OD_MYSQL_PASSWORD?.trim() ?? "";
  const db = process.env.OD_MYSQL_DB?.trim() || "demo";

  if (!pass) {
    console.error(
      "OD_MYSQL_PASS is empty in .env.local — set your Open Dental MySQL password.",
    );
    process.exit(1);
  }

  process.env.MYSQL_HOST = host;
  process.env.MYSQL_PORT = port;
  process.env.MYSQL_USER = user;
  process.env.MYSQL_PASS = pass;
  process.env.MYSQL_DB = db;

  process.env.ALLOW_INSERT_OPERATION = envFlag("MYSQL_ALLOW_INSERT", "false");
  process.env.ALLOW_UPDATE_OPERATION = envFlag("MYSQL_ALLOW_UPDATE", "false");
  process.env.ALLOW_DELETE_OPERATION = envFlag("MYSQL_ALLOW_DELETE", "false");
}

loadEnvFile(envFile);
configureMysqlMcpEnv();

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["-y", "@benborla29/mcp-server-mysql"],
  {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
    shell: process.platform === "win32",
  },
);

child.on("error", (err) => {
  console.error("Failed to start MySQL MCP:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
