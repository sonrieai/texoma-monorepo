# Field map (draft)

Draft for Beshoy discovery. Update status as sandbox responses are inspected.

**Product note:** Overview / Doctor analytics are **appointment + production aggregates only**. Geo uses city/state/ZIP only (no street, names, or contact). `/patients` is removed (NO-ePHI). See [HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md).

## Open Dental

| Dashboard concept | Open Dental field (candidate) | Status |
|-------------------|----------------------------|--------|
| Appointment start | `appt.start_time` / list `start` | Expected |
| Provider | `provider_id` → `/providers` | Expected |
| Appointment type | `appointment_type_id` → `/appointment_types` | Expected |
| Cancelled | `cancelled` | Expected — not full no-show |
| Showed | `checkin_at` / `checked_out` / `confirmed` / `patient_confirmed`; OD `apt_status` Complete | Conversion uses `mapConversionAttendance` — **fallback** if no OD confirm |
| No-show | OD confirm **69**; `patient_missed`; OD `apt_status` Broken | Conversion: **69** / Broken = miss |
| Team cancel | OD confirm **66** (remove from consult denom) | Conversion reads `confirmation_status`, `confirm_status`, `confirmation`, `confirmation_id`, `confirm_id`, `od_confirm`, `def_num` (numeric or string `66`) |
| Patient cancel | OD confirm **67** (drop from denom, like 66) | Same candidate fields as 66; frozen OD default = cancel, not miss |
| Consult code | Procedure `code` **N9310** Complete | Conversion consult event; appointment type IDs / name heuristic = fallback |
| Same-day sold | Procedure `code` **U-AOXS** / **U-AOXD** / **U-FMR** Complete same patient+day as consult | Conversion; else first non-consult Complete proc |
| Patient city/ZIP | `bio.city` / `state` / `zip_code` (stripped at sync) | Geo city aggregates — **no street** |
| New patient | `new_patient` query / patient flag | Deferred (count-only if added) |
| EHR PatNum | `foreign_id` | Write-back / join later |
| Procedure code | `/procedures` items | Confirm / may 404 |
| Production $ | `charge.fee` / `procedure.fee` (Price.amount dollars) | Confirmed shape — sandbox volume TBD |
| Collections | `payment.payment_amount` | Confirmed shape |
| Adjustments / write-offs | `adjustment.adjustment_amount` (abs for KPI) | Confirmed shape |
| Procedure mix | `procedure.code` / `charge.procedure_code` | Expected |
| Location | `location_id` | Expected |
| Write-back source note | `appt.note` or custom | Confirm |

## GoHighLevel (read-only marketing)

GHL is **outside** the warehouse. The dashboard fetches opportunities at page load, drops `contact` and opportunity `name` at parse, and never writes GHL payloads to Mongo. Sign a GHL BAA if the CRM stores patient names/phones.

| Dashboard concept | GHL field | Status |
|-------------------|-----------|--------|
| Lead created_at | opportunity `createdAt` | Confirmed (aggregated) |
| Channel / source | `attributions.utmSessionSource` / `source` | Confirmed |
| Booked / showed / accepted | pipeline stage name → funnel tier | Confirmed |
| Ad spend | Ad Publishing `spend` / Google `cost_micros` | Live when ads connected + `adPublishing.readonly` |
| Pipeline stage | opportunity `pipelineStageId` | Confirmed |
| Contact name | `contact.name` | **Stripped** — not used in UI or warehouse |

## Derived metrics (`src/lib/metrics`)

| Metric | Inputs | Formula (cents / rates) |
|--------|--------|-------------------------|
| Cost per lead | spendCents, leads | spend / leads |
| Cost per booked | spendCents, booked | spend / booked |
| Cost per arch | spendCents or production, arches | spend\|cost / arches |
| ROI | productionCents, spendCents | (production − spend) / spend |
| Show rate | showed, (show + no-show) | showed / denom |
| Lead time | timestamps per stage | avg days between stages |

Statuses: Expected · Stub · Unknown · Confirmed · Deferred

## Open Dental MySQL (local warehouse ingest)

Open Dental native IDs map 1:1 into warehouse `sourceId` / `raw.id`.

| Dashboard concept | Open Dental column | Mapper / notes |
|-------------------|--------------------|----------------|
| Appointment id | `appointment.AptNum` | `mapOdAppointment` |
| Appointment start | `AptDateTime` | ISO via `odDateToIso` |
| Provider | `ProvNum` → `provider` | `mapOdProvider` |
| Appointment type | `AppointmentTypeNum` | `appointmenttype` |
| Apt status | `AptStatus` (2 Complete, 5 Broken) | `apt_status` Complete/Broken |
| Confirm / cancel / no-show | `Confirmed` DefNum (site: **21** Confirmed, **246** Check Out; legacy **66/67/69** if configured) | Primary attendance: **AptStatus** Complete=show, Broken=no-show (`mapConversionAttendance`) |
| Procedure | `procedurelog.ProcNum` + `procedurecode.ProcCode` | Complete → also charge |
| Production $ | `ProcFee` on Complete procs | Charge `fee.amount` |
| Collections | `paysplit.SplitAmt` | Payment rows keyed by `SplitNum` |
| Adjustments | `adjustment.AdjAmt` / `AdjType` | Types from `definition` AdjTypes |
| Patient geo | `patient.City/State/Zip` | PHI stripped at upsert |
| Primary carrier | `patplan` ordinal 1 → `carrier.CarrierName` | `insurance_plans[0]` |
| Treatment plan | `treatplan` + `proctp` | Nested procedures |
| Claims | `claim.ClaimStatus` U/S/R | draft/sent/received |
| Guarantor AR | patient where `PatNum=Guarantor` aging cols | `mapOdGuarantorBalance` |
| ProcCat | `procedurecode.ProcCat` / `definition` cat 11 | CDT catalog sync |

See [LOCAL_OPENDENTAL.md](./LOCAL_OPENDENTAL.md).

## Texoma production MySQL (verified)

Baseline numbers: [OVERVIEW_KPI_BASELINE.md](./OVERVIEW_KPI_BASELINE.md).

### NP consult (inferred from OD, no Mongo chart)

| Signal | Open Dental source | Inference |
|--------|-------------------|-----------|
| Consult procedures | `procedurecode.ProcCode` / `Descript` | `N9310*`, `D9310`, `D0150`, `D0140`; descriptions with `consult` / `consultation` |
| NP consult appt types | `appointmenttype.AppointmentTypeName` | Names matching new patient / consult / soonercare exam / finance consult heuristics |
| Consult show rate | `appointment` in range + type filter | Complete ÷ (Complete + Broken) for consult types |

Key appointment types (examples): **5** New Patient Exam, **30** New Patient Implant Consult, **31** Soonercare Exam, **45** Finance Consult, **47** DentaQuest Exam, **52** Dual Ins Exam.

### Payment types (category 10)

Insurance-like PayType DefNums include **72** Ins. Check, **373** Insurance Credit Card Payment. Medicaid/plan-specific types (DentaQuest, SoonerCare, Liberty) classify as **SoonerCare** bucket in payment mix, not commercial insurance.

### Guarantor AR

| Column | Use |
|--------|-----|
| `Bal_0_30` … `BalOver90` | Aging buckets; over-90 numerator |
| `EstBalance` | May be negative while aging is positive — total AR may use aging sum |
| `BalTotal` | Used when column exists (`odPickColumn`) |

### Treatment plan closed

`proctp.ProcNumOrig` joined to `procedurelog.ProcStatus` — plan “closed” when all planned lines are **Complete** in the ledger.

### Warranty production

Inferred from `procedurecode.ProcCode` suffixes / description (6-mo, 1-yr, 3-yr, 5-yr patterns) at snapshot time.
