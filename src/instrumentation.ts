/**
 * Fail fast when auth is misconfigured (Change Spec item 5).
 */
export async function register() {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.SKIP_AUTH_STARTUP_CHECK === "1") return;

  const { requireAuthSessionSecret } = await import("@/lib/auth/config");
  requireAuthSessionSecret();
}
