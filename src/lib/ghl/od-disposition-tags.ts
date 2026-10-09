/**
 * Texoma consult lines, confirmation names, and sold codes.
 * GoHighLevel receives only the five no-show tags named on the code list.
 * Cancel, reschedule, show, and a completed sold code clear those tags.
 */

export type ConsultLine = "aox" | "imp" | "otn" | "utn" | "dent";

export const NO_SHOW_TAGS = {
  aox: "NO SHOWED AOX",
  imp: "NO SHOWED IMP",
  otn: "NO SHOWED OTN",
  utn: "NO SHOWED UTN",
  dent: "NO SHOWED DENT",
} as const;

export type NoShowTag = (typeof NO_SHOW_TAGS)[ConsultLine];

export const NO_SHOW_TAG_LIST: readonly NoShowTag[] = [
  NO_SHOW_TAGS.aox,
  NO_SHOW_TAGS.imp,
  NO_SHOW_TAGS.otn,
  NO_SHOW_TAGS.utn,
  NO_SHOW_TAGS.dent,
];

export const CONSULT_APPOINTMENTS = [
  {
    line: "aox",
    code: "N9310 AOX Consult",
    description: "ALL ON X Consult",
  },
  {
    line: "imp",
    code: "N9310 IMP Consult",
    description: "Snap in denture",
  },
  {
    line: "otn",
    code: "N9310.OTN",
    description: "Over 10k+ Treatment Consult",
  },
  {
    line: "utn",
    code: "N9310.UTN",
    description: "Under 10k+ Treatment Consult",
  },
  {
    line: "dent",
    code: "N9310 DENT Consult",
    description: "Dentures Consult",
  },
] as const;

/** Confirmation definition names. Patient cancel has no denture code. */
export const CONFIRM_DEFINITIONS = [
  { family: "team_cancel", line: null, name: "66" },
  { family: "team_cancel", line: "aox", name: "66 AOX Cancel" },
  { family: "team_cancel", line: "imp", name: "66 IMPCANCEL" },
  { family: "team_cancel", line: "otn", name: "66OTN" },
  { family: "team_cancel", line: "utn", name: "66UTN" },
  { family: "team_cancel", line: "dent", name: "66 DENT CANC" },
  { family: "patient_cancel", line: null, name: "67" },
  { family: "patient_cancel", line: "aox", name: "67 AOX Cancel" },
  { family: "patient_cancel", line: "imp", name: "67 IMP CANCEL" },
  { family: "patient_cancel", line: "otn", name: "67OTN" },
  { family: "patient_cancel", line: "utn", name: "67UTN" },
  { family: "reschedule", line: null, name: "68" },
  { family: "reschedule", line: "aox", name: "68 AOX RESCH" },
  { family: "reschedule", line: "imp", name: "68 IMP RESC" },
  { family: "reschedule", line: "otn", name: "68OTN" },
  { family: "reschedule", line: "utn", name: "68UTN" },
  { family: "reschedule", line: "dent", name: "68 DENT RESCH" },
  { family: "no_show", line: null, name: "69" },
  { family: "no_show", line: "aox", name: "69 AOX NO SHOW" },
  { family: "no_show", line: "imp", name: "69 IMPLANT NOSH" },
  { family: "no_show", line: "otn", name: "69OTN" },
  { family: "no_show", line: "utn", name: "69UTN" },
  { family: "no_show", line: "dent", name: "69 DENT" },
] as const;

export const SOLD_PROCEDURES = [
  { code: "U-AOXS", line: "aox", description: "Single arch" },
  { code: "U-AOXD", line: "aox", description: "Double arch" },
  { code: "U-OTN", line: "otn", description: "Over 10k" },
  { code: "U-UTN", line: "utn", description: "Under 10k" },
  { code: "U-DENTS", line: "dent", description: "Single arch" },
  { code: "U-DENTD", line: "dent", description: "Double arch" },
  { code: "U-SNAPS", line: "imp", description: "Single arch" },
  { code: "U-SNAPD", line: "imp", description: "Double arch" },
  { code: "U-IMP", line: "utn", description: "Single implant" },
] as const;

/** Stay on the procedure in Open Dental. Not sent as GoHighLevel tags. */
export const TREATMENT_COORDINATORS = [
  { code: "N9210-Ashlie", name: "Ashlie" },
  { code: "N9410-Brie", name: "Brie" },
  { code: "N9510-Asst/Other", name: "Asst/Other" },
] as const;

export type TagEffect = NoShowTag | "clear" | "leave";

export type ConfirmFamily =
  | "team_cancel"
  | "patient_cancel"
  | "reschedule"
  | "no_show";

export type ClassifiedConfirm = {
  family: ConfirmFamily;
  line: ConsultLine | null;
};

const SOLD_BY_CODE = new Map<string, ConsultLine>(
  SOLD_PROCEDURES.map((row) => [row.code, row.line]),
);

function norm(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return norm(value).split(" ").filter(Boolean);
}

function phrase(tokens: string[], text: string): boolean {
  return tokens.join(" ").includes(norm(text));
}

function consultLineFromNormalized(n: string): ConsultLine | null {
  if (!n) return null;
  if (n.includes("N9310 OTN") || n.includes("OVER 10K")) return "otn";
  if (n.includes("N9310 UTN") || n.includes("UNDER 10K")) return "utn";
  if (
    n.includes("N9310 DENT") ||
    n.includes("DENTURES CONSULT") ||
    n.includes("DENT CONSULT")
  ) {
    return "dent";
  }
  if (n.includes("N9310 IMP") || n.includes("SNAP IN DENTURE")) return "imp";
  if (n.includes("N9310 AOX") || n.includes("ALL ON X")) return "aox";
  return null;
}

/** Consult line from an appointment type name or a procedure code. */
export function consultLineFromText(
  text: string | null | undefined,
): ConsultLine | null {
  if (!text?.trim()) return null;
  return consultLineFromNormalized(norm(text));
}

export function consultLineFromProcedures(
  codes: readonly string[],
): ConsultLine | null {
  for (const code of codes) {
    const line = consultLineFromText(code);
    if (line) return line;
  }
  return null;
}

export function soldLine(
  code: string | null | undefined,
): ConsultLine | null {
  const key = (code ?? "").trim().toUpperCase();
  if (!key) return null;
  return SOLD_BY_CODE.get(key) ?? null;
}

export function isSoldProcedureCode(code: string | null | undefined): boolean {
  return soldLine(code) != null;
}

/**
 * Match an Open Dental ApptConfirmed definition name.
 * Specific line names win over a bare 66, 67, 68, or 69.
 */
export function classifyConfirmName(
  confirmName: string | null | undefined,
): ClassifiedConfirm | null {
  const tokens = tokensOf(confirmName);
  if (tokens.length === 0) return null;
  const joined = tokens.join(" ");

  const specific: Array<{
    family: ConfirmFamily;
    line: ConsultLine;
    hit: boolean;
  }> = [
    {
      family: "team_cancel",
      line: "aox",
      hit: phrase(tokens, "66 AOX"),
    },
    {
      family: "team_cancel",
      line: "imp",
      hit: phrase(tokens, "66 IMP") || phrase(tokens, "IMPCANCEL"),
    },
    {
      family: "team_cancel",
      line: "otn",
      hit: phrase(tokens, "66OTN") || phrase(tokens, "66 OTN"),
    },
    {
      family: "team_cancel",
      line: "utn",
      hit: phrase(tokens, "66UTN") || phrase(tokens, "66 UTN"),
    },
    {
      family: "team_cancel",
      line: "dent",
      hit: phrase(tokens, "66 DENT"),
    },
    {
      family: "patient_cancel",
      line: "aox",
      hit: phrase(tokens, "67 AOX"),
    },
    {
      family: "patient_cancel",
      line: "imp",
      hit: phrase(tokens, "67 IMP"),
    },
    {
      family: "patient_cancel",
      line: "otn",
      hit: phrase(tokens, "67OTN") || phrase(tokens, "67 OTN"),
    },
    {
      family: "patient_cancel",
      line: "utn",
      hit: phrase(tokens, "67UTN") || phrase(tokens, "67 UTN"),
    },
    {
      family: "reschedule",
      line: "aox",
      hit: phrase(tokens, "68 AOX"),
    },
    {
      family: "reschedule",
      line: "imp",
      hit: phrase(tokens, "68 IMP"),
    },
    {
      family: "reschedule",
      line: "otn",
      hit: phrase(tokens, "68OTN") || phrase(tokens, "68 OTN"),
    },
    {
      family: "reschedule",
      line: "utn",
      hit: phrase(tokens, "68UTN") || phrase(tokens, "68 UTN"),
    },
    {
      family: "reschedule",
      line: "dent",
      hit: phrase(tokens, "68 DENT"),
    },
    {
      family: "no_show",
      line: "aox",
      hit: phrase(tokens, "69 AOX"),
    },
    {
      family: "no_show",
      line: "imp",
      hit: phrase(tokens, "69 IMPLANT") || phrase(tokens, "69 IMP"),
    },
    {
      family: "no_show",
      line: "otn",
      hit: phrase(tokens, "69OTN") || phrase(tokens, "69 OTN"),
    },
    {
      family: "no_show",
      line: "utn",
      hit: phrase(tokens, "69UTN") || phrase(tokens, "69 UTN"),
    },
    {
      family: "no_show",
      line: "dent",
      hit: phrase(tokens, "69 DENT"),
    },
  ];

  for (const row of specific) {
    if (row.hit) return { family: row.family, line: row.line };
  }

  if (tokens.includes("66") || joined.includes("CANCELLED BY TEAM")) {
    return { family: "team_cancel", line: null };
  }
  if (tokens.includes("67") || joined.includes("CANCELLED BY PATIENT")) {
    return { family: "patient_cancel", line: null };
  }
  if (tokens.includes("68") || joined.includes("RESCHEDULED")) {
    return { family: "reschedule", line: null };
  }
  if (
    tokens.includes("69") ||
    tokens.some((token) => token.startsWith("69")) ||
    joined.includes("NO SHOW") ||
    joined.includes("NOSHOW")
  ) {
    return { family: "no_show", line: null };
  }
  return null;
}

export function noShowTagForLine(line: ConsultLine): NoShowTag {
  return NO_SHOW_TAGS[line];
}

/**
 * What to do with the contact's no-show tag for one appointment.
 * Complete, cancel, and reschedule clear it. A booked visit leaves it alone.
 * A generic 69 uses the consult line on the appointment type or procedures.
 */
export function appointmentTagEffect(input: {
  completed: boolean;
  confirmName: string | null;
  appointmentTypeName: string | null;
  procedureCodes: readonly string[];
}): TagEffect {
  if (input.completed) return "clear";
  const confirm = classifyConfirmName(input.confirmName);
  if (
    confirm?.family === "team_cancel" ||
    confirm?.family === "patient_cancel" ||
    confirm?.family === "reschedule"
  ) {
    return "clear";
  }
  if (confirm?.family === "no_show") {
    const line =
      confirm.line ??
      consultLineFromText(input.appointmentTypeName) ??
      consultLineFromProcedures(input.procedureCodes);
    if (!line) return "leave";
    return NO_SHOW_TAGS[line];
  }
  return "leave";
}

/** Later non-leave effects win. Booked visits do not remove a no-show tag. */
export function foldTagEffects(effects: readonly TagEffect[]): TagEffect {
  let current: TagEffect = "leave";
  for (const effect of effects) {
    if (effect !== "leave") current = effect;
  }
  return current;
}
