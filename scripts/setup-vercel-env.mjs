import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const scope = process.env.VERCEL_SCOPE ?? "sonrie";
const project = process.env.VERCEL_PROJECT ?? "texoma-monorepo";

const keys = [
  "OD_MYSQL_HOST",
  "OD_MYSQL_PORT",
  "OD_MYSQL_USER",
  "OD_MYSQL_PASS",
  "OD_MYSQL_DB",
  "MONGODB_URI",
  "MONGODB_URL",
  "MONGODB_DB",
  "SYNC_STRIP_PHI",
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "GHL_BASE_URL",
  "GHL_SOURCE_CUSTOM_FIELD_ID",
  "AUTH_USERNAME",
  "AUTH_EMAIL",
  "AUTH_PASSWORD",
  "AUTH_SESSION_SECRET",
  "RESET_TOKEN_SECRET",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
  "SENDER_EMAIL",
  "AUTH_SENDER_NAME",
  "PASSWORD_RESET_WEB_BASE_URL",
];

if (!existsSync(envPath)) {
  console.error(".env.local not found");
  process.exit(1);
}

const parsed = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    })
    .filter(([key]) => key),
);

for (const key of keys) {
  let value = parsed[key]?.trim();
  if (!value && key === "SYNC_STRIP_PHI") value = "1";
  if (!value && key === "PASSWORD_RESET_WEB_BASE_URL") {
    value = "https://texoma.vercel.app";
  }
  if (!value) continue;

  console.log(`Adding ${key}...`);
  const sensitive = [
    "OD_MYSQL_PASS",
    "MONGODB_URI",
    "MONGODB_URL",
    "GHL_API_KEY",
    "AUTH_PASSWORD",
    "AUTH_SESSION_SECRET",
    "RESET_TOKEN_SECRET",
    "MAILGUN_API_KEY",
  ].includes(key);

  const envTargets = sensitive
    ? "production,preview"
    : "production,preview,development";

  const args = [
    "vercel@latest",
    "env",
    "add",
    key,
    envTargets,
    "--project",
    project,
    "--scope",
    scope,
    "--force",
    "--yes",
  ];
  if (sensitive) args.push("--sensitive");
  else args.push("--no-sensitive");

  const result = spawnSync(npx, args, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    cwd: root,
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Done. Run: npx vercel deploy --prod --scope ${scope} --project ${project} --yes`);
