/** Shared guest identity (safe for client + server). */
export const GUEST_SESSION_EMAIL = "guest@texoma.local";

export function isGuestEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === GUEST_SESSION_EMAIL;
}
