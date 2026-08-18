# Field map (draft)

Draft for Beshoy discovery. Update status as sandbox responses are inspected.

**Product note:** Overview / Doctor analytics are **appointment + production aggregates only**. Geo uses city/state/ZIP only (no street, names, or contact). `/patients` is removed (NO-ePHI). See [HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md).

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
| Ad spend | ads platforms (not GHL CRM) | Deferred — always $0 |
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
