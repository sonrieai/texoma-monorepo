export const DASHBOARD_ROLES = [
  "owner",
  "doctor",
  "office_manager",
  "insurance",
  "treatment_coordinator",
] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const DASHBOARD_ROLE_DETAILS: {
  role: DashboardRole;
  label: string;
  summary: string;
}[] = [
  { role: "owner", label: "Owner", summary: "All pages, including admin" },
  { role: "doctor", label: "Doctor", summary: "Their own doctor page only" },
  {
    role: "office_manager",
    label: "Office Manager",
    summary: "Every page except Overview",
  },
  { role: "insurance", label: "Insurance", summary: "Insurance page only" },
  {
    role: "treatment_coordinator",
    label: "Treatment Coordinator",
    summary: "All treatment coordinator pages",
  },
];

const ROLE_LABELS = Object.fromEntries(
  DASHBOARD_ROLE_DETAILS.map((item) => [item.role, item.label]),
) as Record<DashboardRole, string>;

export function isDashboardRole(value: unknown): value is DashboardRole {
  return (
    typeof value === "string" &&
    (DASHBOARD_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Missing/invalid stored roles get the least privilege (insurance = one page).
 * Never default to owner.
 */
export function normalizeDashboardRole(value: unknown): DashboardRole {
  return isDashboardRole(value) ? value : "insurance";
}

export function roleLabel(role: DashboardRole): string {
  return ROLE_LABELS[role];
}

/** Open Dental provider ids used in /doctor/[id]. Reject path tricks. */
export function isProviderId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function pagePath(pathname: string): string {
  const path = normalizePathname(pathname);
  return path === "/" ? "/overview" : path;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isSafeAppPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("://")
  );
}

export function homePath(
  role: DashboardRole,
  providerId?: string | null,
): string {
  switch (role) {
    case "owner":
      return "/overview";
    case "doctor":
      return providerId && isProviderId(providerId)
        ? `/doctor/${providerId}`
        : "/overview";
    case "office_manager":
      return "/doctor";
    case "insurance":
      return "/insurance";
    case "treatment_coordinator":
      return "/tc";
  }
}

export function canAccess(
  role: DashboardRole,
  pathname: string,
  providerId?: string | null,
): boolean {
  const path = normalizePathname(pathname);
  const page = pagePath(pathname);

  if (role === "owner") return true;
  if (isUnder(path, "/api/health") || isUnder(path, "/api/auth")) return true;

  if (role === "office_manager") {
    if (page === "/overview") return false;
    if (isUnder(page, "/admin") || isUnder(path, "/api/admin")) return false;
    if (path === "/api/metrics/overview") return false;
    return true;
  }

  if (role === "doctor") {
    if (!providerId || !isProviderId(providerId)) return false;
    if (page === `/doctor/${providerId}`) return true;
    if (path === "/api/metrics/providers") return true;
    return false;
  }

  if (role === "insurance") {
    return page === "/insurance";
  }

  if (role === "treatment_coordinator") {
    if (page === "/tc" || isUnder(page, "/tc")) return true;
    if (path === "/api/metrics/coordinators") return true;
    return false;
  }

  return false;
}

export function landingPath(
  role: DashboardRole,
  providerId?: string | null,
): string {
  const candidate = homePath(role, providerId);
  if (canAccess(role, candidate, providerId)) return candidate;
  return "/login?reason=no-access";
}

export function resolvePostLoginPath(input: {
  callbackUrl?: string | null;
  role?: DashboardRole | null;
  providerId?: string | null;
  homePath?: string | null;
}): string {
  const raw = input.callbackUrl?.trim() || "";
  const safe = raw && isSafeAppPath(raw) ? raw : "";
  const pathname = normalizePathname((safe || "/overview").split("?")[0] ?? "/overview");
  const allowed = input.role
    ? canAccess(input.role, pathname, input.providerId)
    : false;

  if (allowed && safe) return safe;
  if (input.homePath && isSafeAppPath(input.homePath)) return input.homePath;
  if (input.role) return landingPath(input.role, input.providerId);
  return "/overview";
}
