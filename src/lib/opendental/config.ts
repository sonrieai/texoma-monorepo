import "server-only";

export type OpenDentalMysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function isOpenDentalMysqlConfigured(): boolean {
  return getOpenDentalMysqlConfig() != null;
}

export function getOpenDentalMysqlConfig(): OpenDentalMysqlConfig | null {
  const host = process.env.OD_MYSQL_HOST?.trim();
  const user = process.env.OD_MYSQL_USER?.trim();
  const database = process.env.OD_MYSQL_DB?.trim();
  if (!host || !user || !database) return null;

  const portRaw = process.env.OD_MYSQL_PORT?.trim() || "3306";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;

  const password =
    process.env.OD_MYSQL_PASS?.trim() ??
    process.env.OD_MYSQL_PASSWORD?.trim() ??
    "";

  return { host, port, user, password, database };
}

export function requireOpenDentalMysqlConfig(): OpenDentalMysqlConfig {
  const config = getOpenDentalMysqlConfig();
  if (!config) {
    throw new Error(
      "Open Dental MySQL is not configured. Set OD_MYSQL_HOST, OD_MYSQL_USER, OD_MYSQL_DB, and OD_MYSQL_PASS in .env.local.",
    );
  }
  return config;
}
