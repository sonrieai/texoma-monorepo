/**
 * Open Dental MySQL row shapes used by warehouse ingest.
 * Field names match common OD schema (v17+); verify with probe after restore.
 */

import type { RowDataPacket } from "mysql2";

export type OdProviderRow = {
  ProvNum: number;
  Abbr: string | null;
  FName: string | null;
  LName: string | null;
  IsHidden: number | boolean;
  DateTStamp: Date | string | null;
};

export type OdAppointmentTypeRow = {
  AppointmentTypeNum: number;
  AppointmentTypeName: string | null;
};

export type OdAppointmentRow = {
  AptNum: number;
  PatNum: number;
  ProvNum: number;
  AptStatus: number;
  AptDateTime: Date | string | null;
  Confirmed: number;
  AppointmentTypeNum: number | null;
  ClinicNum: number | null;
  DateTStamp: Date | string | null;
  DateTimeArrived: Date | string | null;
  DateTimeDismissed: Date | string | null;
  IsNewPatient?: number | boolean | null;
};

export type OdPatientRow = {
  PatNum: number;
  Guarantor: number;
  FName: string | null;
  LName: string | null;
  City: string | null;
  State: string | null;
  Zip: string | null;
  Birthdate: Date | string | null;
  PatStatus: number;
  ClinicNum: number | null;
  DateTStamp: Date | string | null;
  PriProv: number | null;
  DateFirstVisit?: Date | string | null;
};

export type OdProcedureCodeRow = {
  CodeNum: number;
  ProcCode: string;
  Descript: string | null;
  ProcCat: number;
};

export type OdProcedureLogRow = {
  ProcNum: number;
  PatNum: number;
  ProvNum: number;
  CodeNum: number;
  ProcStatus: number;
  ProcDate: Date | string | null;
  ProcFee: number;
  AptNum: number | null;
  ClinicNum: number | null;
  DateTStamp: Date | string | null;
  DateComplete: Date | string | null;
  ProcCode?: string | null;
  Descript?: string | null;
  ProcCat?: number | null;
};

export type OdDefinitionRow = {
  DefNum: number;
  Category: number;
  ItemName: string | null;
  ItemValue: string | null;
  ItemOrder: number;
  IsHidden: number | boolean;
};

export type OdPaymentRow = {
  PayNum: number;
  PatNum: number;
  PayDate: Date | string | null;
  PayAmt: number;
  PayType: number;
  DateEntry: Date | string | null;
  ClinicNum: number | null;
};

export type OdPaySplitRow = {
  SplitNum: number;
  PayNum: number;
  PatNum: number;
  ProvNum: number;
  SplitAmt: number;
  DatePay: Date | string | null;
  ProcNum: number | null;
  UnearnedType: number;
  ClinicNum: number | null;
  PayType?: number | null;
  PayTypeName?: string | null;
  PayNote?: string | null;
  CheckNum?: string | null;
};

export type OdAdjustmentRow = {
  AdjNum: number;
  PatNum: number;
  ProvNum: number;
  AdjDate: Date | string | null;
  AdjAmt: number;
  AdjType: number;
  DateEntry: Date | string | null;
  ClinicNum: number | null;
  AdjTypeName?: string | null;
};

export type OdTreatPlanRow = {
  TreatPlanNum: number;
  PatNum: number;
  DateTP: Date | string | null;
  Heading: string | null;
  TPStatus: number;
  DateTStamp: Date | string | null;
};

export type OdProcTpRow = {
  ProcTPNum: number;
  TreatPlanNum: number;
  PatNum: number;
  ProcNumOrig: number | null;
  ProcCode: string | null;
  Descript: string | null;
  FeeAmt: number;
  Priority: number | null;
  LogProcStatus?: number | null;
  LogProcDate?: Date | string | null;
  LogDateComplete?: Date | string | null;
  LogProcFee?: number | null;
};

export type OdClaimRow = {
  ClaimNum: number;
  PatNum: number;
  PlanNum: number;
  ClaimStatus: string | null;
  ClaimType: string | null;
  DateService: Date | string | null;
  DateSent: Date | string | null;
  DateSentOrig: Date | string | null;
  DateReceived: Date | string | null;
  DateResent: Date | string | null;
  ClaimFee: number;
  InsPayEst: number;
  InsPayAmt: number;
  WriteOff: number;
  CorrectionType: number | null;
  ProvTreat: number;
  ClinicNum: number | null;
  DateTStamp: Date | string | null;
};

/** claimproc line: Status 1 = Received, 4 = Supplemental. */
export type OdClaimProcRow = {
  ClaimProcNum: number;
  PatNum: number;
  ProvNum: number | null;
  Status: number;
  InsPayAmt: number;
  WriteOff: number;
  DateCP: Date | string | null;
  CarrierName?: string | null;
};

export type OdInsPlanRow = {
  PlanNum: number;
  CarrierNum: number;
  GroupName: string | null;
  GroupNum: string | null;
  CarrierName?: string | null;
};

export type OdCarrierRow = {
  CarrierNum: number;
  CarrierName: string | null;
};

export type OdPatPlanJoinRow = {
  PatPlanNum: number;
  PatNum: number;
  Ordinal: number;
  PlanNum: number;
  CarrierName: string | null;
};

export type OdGuarantorBalanceRow = {
  PatNum: number;
  Bal_0_30: number;
  Bal_31_60: number;
  Bal_61_90: number;
  BalOver90: number;
  InsEst: number;
  TotBal: number;
  EstBalance: number;
};

export type OdRow = RowDataPacket & Record<string, unknown>;

/** Open Dental AptStatus enum (common). */
export const OdAptStatus = {
  None: 0,
  Scheduled: 1,
  Complete: 2,
  UnschedList: 3,
  ASAP: 4,
  Broken: 5,
  Planned: 6,
} as const;

/** Open Dental ProcStatus enum (common). */
export const OdProcStatus = {
  TP: 1,
  Complete: 2,
  ExistingCurrentProvider: 3,
  ExistingOtherProvider: 4,
  Referred: 5,
  Deleted: 6,
  Condition: 7,
  TreatmentPlanInactive: 8,
} as const;

/** definition.Category for AdjTypes (DefCat.AdjTypes). */
export const OD_DEF_CAT_ADJ_TYPES = 1;

/** definition.Category for ApptConfirmed. */
export const OD_DEF_CAT_APPT_CONFIRMED = 2;

/** definition.Category for PaymentTypes. */
export const OD_DEF_CAT_PAYMENT_TYPES = 10;

/** definition.Category for ProcCodeCats. */
export const OD_DEF_CAT_PROC_CODE_CATS = 11;
