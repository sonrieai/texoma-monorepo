/**
 * NP consult appointment types from Open Dental `appointmenttype.AppointmentTypeName`.
 */

export function inferNpConsultAppointmentTypeFromName(
  name: string | null | undefined,
): boolean {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (/\breturning\b/i.test(t)) return false;

  if (/\bnew patient\b|\bnew pt\b|\bwebsched new patient\b/i.test(t)) {
    return true;
  }
  if (/\bnew patient implant consult\b/i.test(t)) return true;
  if (/\bsoonercare exam\b/i.test(t)) return true;
  if (/\bdentaquest exam\b/i.test(t)) return true;
  if (/\bfinance consult\b/i.test(t)) return true;
  if (/\bdual ins exam\b/i.test(t)) return true;
  if (/\bimplant consult\b/i.test(t) && /\bnew patient\b/i.test(t)) {
    return true;
  }

  return false;
}
