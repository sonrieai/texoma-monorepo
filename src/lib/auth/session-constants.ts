/** Shared session timing (safe for client + server). */
export const SESSION_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
export const SESSION_INACTIVITY_TIMEOUT_SEC = SESSION_INACTIVITY_TIMEOUT_MS / 1000;

/** Debounce server heartbeats while the user is active. */
export const SESSION_HEARTBEAT_DEBOUNCE_MS = 30_000;

/** Client poll interval to catch server-side expiry while idle in a tab. */
export const SESSION_IDLE_CHECK_MS = 60_000;
