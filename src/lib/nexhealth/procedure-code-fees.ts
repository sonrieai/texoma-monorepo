import { normalizeProcedureCode } from "@/lib/cdt/categories";
import type {
  NexFeeSchedule,
  NexFeeScheduleProcedure,
} from "@/lib/nexhealth/client";

export type ProcedureCodeFeeEntry = {
  fee1: string | null;
  fee2: string | null;
  fee3: string | null;
};

export type ProcedureCodeFees = {
  names: [string | null, string | null, string | null];
  byCode: Map<string, ProcedureCodeFeeEntry>;
};

const OFFICE_FEE_NAME = /office\s*fees?/i;

/** Pick up to three OD fee schedules for Fee 1 / Fee 2 / Fee 3 columns. */
export function orderFeeSchedules(schedules: NexFeeSchedule[]): NexFeeSchedule[] {
  const active = schedules.filter((schedule) => schedule.active !== false);
  const priority = process.env.NEXHEALTH_FEE_SCHEDULE_PRIORITY?.trim();

  return [...active].sort((a, b) => {
    const aName = a.name?.trim() ?? "";
    const bName = b.name?.trim() ?? "";

    if (priority) {
      const needle = priority.toLowerCase();
      const aPriority = aName.toLowerCase().includes(needle) ? 0 : 1;
      const bPriority = bName.toLowerCase().includes(needle) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
    }

    const aOffice = OFFICE_FEE_NAME.test(aName) ? 0 : 1;
    const bOffice = OFFICE_FEE_NAME.test(bName) ? 0 : 1;
    if (aOffice !== bOffice) return aOffice - bOffice;

    return aName.localeCompare(bName);
  });
}

export function buildProcedureCodeFees(
  schedules: NexFeeSchedule[],
  feeRows: NexFeeScheduleProcedure[],
): ProcedureCodeFees {
  const ordered = orderFeeSchedules(schedules).slice(0, 3);
  const slotByScheduleId = new Map<number, 0 | 1 | 2>();
  for (const [index, schedule] of ordered.entries()) {
    if (schedule.id != null) {
      slotByScheduleId.set(schedule.id, index as 0 | 1 | 2);
    }
  }

  const names: [string | null, string | null, string | null] = [
    ordered[0]?.name?.trim() || null,
    ordered[1]?.name?.trim() || null,
    ordered[2]?.name?.trim() || null,
  ];

  const byCode = new Map<string, ProcedureCodeFeeEntry>();

  for (const row of feeRows) {
    if (row.fee_schedule_id == null) continue;
    const slot = slotByScheduleId.get(row.fee_schedule_id);
    if (slot === undefined) continue;

    const code = normalizeProcedureCode(row.code ?? "");
    if (code === "UNKNOWN") continue;

    const amount = row.fee?.amount?.trim() || null;
    if (!amount) continue;

    const entry = byCode.get(code) ?? { fee1: null, fee2: null, fee3: null };
    if (slot === 0) entry.fee1 = amount;
    if (slot === 1) entry.fee2 = amount;
    if (slot === 2) entry.fee3 = amount;
    byCode.set(code, entry);
  }

  return { names, byCode };
}
