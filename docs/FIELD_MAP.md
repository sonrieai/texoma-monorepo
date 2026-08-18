# Field map (draft)

Draft for Beshoy discovery. Update status as sandbox responses are inspected.

**Product note:** Overview / Doctor analytics are **appointment + production aggregates only** (no patient names, DOB, phone, email, address). Geo is deferred.

## NexHealth

| Dashboard concept | NexHealth field (candidate) | Status |
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
| Patient address | `bio.address_*` (unused on analytics paths) | Geo **deferred** |
| New patient | `new_patient` query / patient flag | Deferred (count-only if added) |
| EHR PatNum | `foreign_id` | Write-back / join later |
| Procedure code | `/procedures` items | Confirm / may 404 |
| Production $ | `charge.fee` / `procedure.fee` (Price.amount dollars) | Confirmed shape — sandbox volume TBD |
| Collections | `payment.payment_amount` | Confirmed shape |
| Adjustments / write-offs | `adjustment.adjustment_amount` (abs for KPI) | Confirmed shape |
| Procedure mix | `procedure.code` / `charge.procedure_code` | Expected |
| Location | `location_id` | Expected |
| Write-back source note | `appt.note` or custom | Confirm |

## GoHighLevel (stub interface)

| Dashboard concept | GHL field (planned) | Status |
|-------------------|---------------------|--------|
| Lead created_at | contact/opportunity created | Stub |
| Channel / source | attribution / UTM / pipeline source | Stub |
| Booked consult | opportunity stage or calendar | Stub |
| Ad spend | campaign spend import | Stub |
| Pipeline stage | opportunity status | Stub |

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
