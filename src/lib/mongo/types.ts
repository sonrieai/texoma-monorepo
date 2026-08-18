/**
 * Document shapes stored in the Texoma Mongo warehouse.
 * `raw` keeps the NexHealth payload so aggregators can reuse existing mappers.
 */

import type {
  NexAdjustment,
  NexAppointment,
  NexAppointmentType,
  NexCharge,
  NexClaim,
  NexGuarantorBalance,
  NexInsuranceBalance,
  NexInsurancePlan,
  NexPatient,
  NexPayment,
  NexProcedure,
  NexProvider,
  NexTreatmentPlan,
} from "@/lib/nexhealth/client";

export type WarehouseBase = {
  locationId: number;
  subdomain: string;
  nexhealthId: number;
  updatedAt: string | null;
  syncedAt: string;
};

export type ProviderDoc = WarehouseBase & {
  name: string;
  inactive: boolean;
  raw: NexProvider;
};

export type AppointmentTypeDoc = WarehouseBase & {
  name: string;
  raw: NexAppointmentType;
};

export type AppointmentDoc = WarehouseBase & {
  providerId: number | null;
  patientId: number | null;
  appointmentTypeId: number | null;
  startTime: string | null;
  cancelled: boolean;
  raw: NexAppointment;
};

export type ProcedureDoc = WarehouseBase & {
  providerId: number | null;
  patientId: number | null;
  procedureCode: string | null;
  startDate: string | null;
  status: string | null;
  raw: NexProcedure;
};

export type ChargeDoc = WarehouseBase & {
  providerId: number | null;
  patientId: number | null;
  procedureCode: string | null;
  chargedAt: string | null;
  deletedAt: string | null;
  raw: NexCharge;
};

export type PaymentDoc = WarehouseBase & {
  providerId: number | null;
  paidAt: string | null;
  deletedAt: string | null;
  raw: NexPayment;
};

export type AdjustmentDoc = WarehouseBase & {
  providerId: number | null;
  adjustedAt: string | null;
  deletedAt: string | null;
  raw: NexAdjustment;
};

export type TreatmentPlanDoc = WarehouseBase & {
  patientId: number | null;
  status: string | null;
  raw: NexTreatmentPlan;
};

export type PatientDoc = WarehouseBase & {
  patientId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  inactive: boolean;
  raw: NexPatient;
};

export type GuarantorBalanceDoc = WarehouseBase & {
  guarantorId: number | null;
  raw: NexGuarantorBalance;
};

export type ClaimDoc = WarehouseBase & {
  status: string | null;
  dateOfService: string | null;
  planId: number | null;
  raw: NexClaim;
};

export type InsuranceBalanceDoc = WarehouseBase & {
  patientId: number | null;
  guarantorId: number | null;
  raw: NexInsuranceBalance;
};

export type InsurancePlanDoc = WarehouseBase & {
  name: string | null;
  raw: NexInsurancePlan;
};

export type CdtCodeDoc = {
  code: string;
  category: string;
  description: string;
  /** Open Dental ProcCat id from NexHealth appointment_descriptors.data.ProcCat */
  procCatId?: number | null;
  volumeBucket: string | null;
  warrantyBucket: string | null;
  isAox: boolean;
  isSoldCase?: boolean;
  isConsult?: boolean;
  fee1?: string | null;
  fee2?: string | null;
  fee3?: string | null;
};

export type ProcedureCategoryDoc = {
  /** Open Dental Definition DefNum (NexHealth data.ProcCat). */
  procCatId: number;
  /** Display name — persisted after sync; bootstrapped from NexHealth code descriptions. */
  name: string;
  hidden: boolean;
  codeCount: number;
  syncedAt: string;
};
