import type { NexAppointmentDescriptor } from "@/lib/nexhealth/client";

type OpenDentalDescriptorData = {
  ProcCat?: number;
  IsHygiene?: number | boolean;
  IsHidden?: number | boolean;
};

/** Open Dental procedure-code category id from NexHealth appointment_descriptors.data.ProcCat */
export function extractOpenDentalProcCatId(
  descriptor: NexAppointmentDescriptor,
): number | null {
  const data = descriptor.data as OpenDentalDescriptorData | undefined;
  const procCat = data?.ProcCat;
  return typeof procCat === "number" && Number.isFinite(procCat) ? procCat : null;
}

export function buildProcCatByCode(
  descriptors: NexAppointmentDescriptor[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of descriptors) {
    const code = row.code?.trim();
    if (!code || code === "~BAD~") continue;
    const procCatId = extractOpenDentalProcCatId(row);
    if (procCatId == null) continue;
    map.set(code.toUpperCase(), procCatId);
  }
  return map;
}

export function isOpenDentalHygieneDescriptor(
  descriptor: NexAppointmentDescriptor,
): boolean {
  const data = descriptor.data as OpenDentalDescriptorData | undefined;
  const flag = data?.IsHygiene;
  return flag === 1 || flag === true;
}
