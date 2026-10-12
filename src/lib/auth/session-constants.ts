/** Shared session timing (safe for client + server). */
export const SESSION_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_INACTIVITY_TIMEOUT_SEC = SESSION_INACTIVITY_TIMEOUT_MS / 1000;

/** How often an active session tells the server it is still in use. */
export const SESSION_HEARTBEAT_DEBOUNCE_MS = 30_000;

/** Client poll interval to catch server-side expiry while idle in a tab. */
export const SESSION_IDLE_CHECK_MS = 60_000;
