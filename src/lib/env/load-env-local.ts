import { existsSync } from "node:fs";

export function loadEnvLocal(path = ".env.local"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
