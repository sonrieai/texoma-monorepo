# Dashboard fields — MySQL mapping and calculation

Same order as the sidebar: Overview, Doctor, Treatment Coordinator, Insurance, Marketing, Patients by Area.

## Overview

Same order as the Overview page (`src/app/overview/page.tsx`).

Tiles and charts read Open Dental on page load. Dollars on screen are cents divided by 100. A rate tile shows **—** when its denominator is 0.

Completed production is a completed procedure. Open Dental has no separate charge table. `procedurelog.ProcStatus = 2` and `procedurelog.ProcFee` become the charge. The date is `ProcDate`, then `DateComplete`.

## Production by Category

Donut, left of the tiles. Slice order matches the legend:

| Order | Slice | How it is calculated |
|------:|-------|----------------------|
| 1 | Dentures | Sum of completed `ProcFee` whose procedure category is Dentures. |
| 2 | Extractions | Same, category Extractions. |
| 3 | Hygiene | Same, category Hygiene. |
| 4 | Implants | Same, category Implants. |
| 5 | Partial Dentures | Same, category Partial Dentures. |
| 6 | Restorative Dentistry | Same, category Restorative Dentistry. Also rolls up labels Restorative, Fillings, and Crown & Bridge. |
| 7 | Other | Fixed (All-on-4), Other Surgery, Uncategorized, any other category, and codes with no category. |

Category comes from `procedurecode.ProcCat` → `definition` (category 11), then from the code chart, then from the procedure description.

Center label **total** is the sum of those seven slices. If every slice is 0 and adjusted production is above 0, the whole adjusted amount is placed in Other.

## New Patient Conversion

| Order | Tile | MySQL | Calculation |
|------:|------|-------|-------------|
| 1 | NP's | `patient.DateFirstVisit` | Count of patients whose first-visit date falls in the selected period. When that column is not loaded, the count is patients whose first completed **non-consult** procedure date falls in the period. Consult codes (`N9310*`, `D9310`, `D0150`, `D0140`, or a description that says consult) are skipped for that fallback. |
| 2 | Consult show rate | `appointment.AptStatus`, `appointment.Confirmed`, `appointment.AptDateTime`, `appointmenttype`, `procedurelog` | Shows ÷ (shows + no-shows) for consult visits in the period. Target ≥ 75%. |
| 3 | Same-day starts | `paysplit.SplitAmt`, `payment.PayDate` | Share of shows that collected **more than $250** on that same calendar day. Target ≥ 30%. |
| 4 | Same-day start count | same as the rate | The count behind the rate. |
| 5 | Treatment plan closed | `treatplan`, `proctp`, `procedurelog.ProcStatus`, `procedurelog.ProcFee` | Dollar sum of treatment plans whose every procedure is Complete, using the latest completed procedure date in the period. |

### Consult show rate

A visit is a consult when its `appointment.AppointmentTypeNum` is a consult type. If no consult types are configured, a visit on a day that has a completed consult procedure counts instead.

Attendance, in this order:

1. `appointment.AptStatus = 2` (Complete) → show.
2. `appointment.AptStatus = 5` (Broken) → no-show.
3. While the visit is still open, `appointment.Confirmed` definition **66** or **67** → cancelled. Cancelled visits are left out of the rate.
4. While the visit is still open, definition **69** → no-show.
5. Anything else → unknown. Unknown visits are booked, and they are not in the rate.

`Confirmed` is the DefNum. Definitions 66, 67, and 69 are read as those numbers.

Rate = consult shows ÷ (consult shows + consult no-shows).

If consult types are not configured, a completed consult procedure with no matching appointment that day is counted as one show.

### Same-day starts

When appointments carry `IsNewPatient`, the shows are new-patient shows (`IsNewPatient = 1`, Complete, not cancelled). Otherwise the shows are the consult shows above.

Collected that day = sum of `paysplit.SplitAmt` for that patient on that calendar date (`payment.PayDate`).

A start is that sum **greater than $250** (`250.00` exactly does not count).

Same-day starts (the percent) = starts ÷ those shows.

Same-day start count = the number of starts.

### Treatment plan closed

A plan is closed when every `proctp` line has a `procedurelog` row with `ProcStatus = 2`. An empty plan counts only when its status is completed.

The plan date is the latest completed procedure date on that plan. The tile adds `ProcFee` for plans whose date is in the period and whose fee sum is above 0.

## Production

| Order | Tile | MySQL | Calculation |
|------:|------|-------|-------------|
| 1 | Adjusted production | `procedurelog.ProcFee`, `claimproc.WriteOff`, `adjustment.AdjAmt` | Gross − write-offs + signed adjustments. |
| 2 | SC production | `procedurelog.ProcFee`, `carrier.CarrierName` | Completed fees for patients whose primary carrier is SoonerCare or OHCA. |

Gross = sum of completed `ProcFee` in the period.

Write-offs = sum of `claimproc.WriteOff` where `claimproc.Status` is 1 (Received) or 4 (Supplemental) and `DateCP` is in the period.

Signed adjustments = sum of `adjustment.AdjAmt` where `AdjDate` is in the period.

Adjusted production = gross − write-offs + signed adjustments.

SC production uses the same completed fees. The patient is included when primary insurance (`patplan.Ordinal = 1` → `inssub` → `insplan` → `carrier.CarrierName`) matches SoonerCare or OHCA. Managed-care brand names are not included.

## Procedure Volume

Counts are completed procedures in the period (`ProcStatus = 2`). `ProcDate`, then `DateComplete`, must fall in the period. The code decides the bucket. Description text is used only for All-on-X when the code itself does not match.

| Order | Tile | Codes | Calculation |
|------:|------|-------|-------------|
| 1 | Extractions | `D7140`, `D7210`, `D7220`, `D7230`, `D7240`, `D7241`, `D7250` | Count of completed procedures. Prefix match. `N` codes and `D73xx` alveoloplasty are not counted. |
| 2 | Implants placed | `D6010`, `D6011`, `D6040`, `D6050` | Count of completed procedures. Crowns and abutments are not counted. |
| 3 | AOX cases | Code or description contains `AOX` or `all on`, or the code is on the sold list (`U-AOXS`, `U-AOXD`) | Count of completed procedures. One row is one case. |
| 4 | Dentures delivered | `D5110`, `D5120`, `D5130`, `D5140` | Count of completed procedures. `N` codes, including `N4120`, are not counted. |

## Collections & AR

| Order | Tile | MySQL | Calculation |
|------:|------|-------|-------------|
| 1 | Collection ratio | `paysplit.SplitAmt`, `claimproc.InsPayAmt`, gross `ProcFee` | Collections ÷ gross production. Target ≥ 98%. |
| 2 | Total AR | `patient` where `PatNum = Guarantor` | Sum of guarantor balances. A credit balance counts as 0. |
| 3 | AR over 90 days | `patient.BalOver90` | Over-90 ÷ total AR. Target under 15%. |

Collections = `paysplit.SplitAmt` in the period (`payment.PayDate`) + `claimproc.InsPayAmt` for status 1 or 4 with `DateCP` in the period.

Collection ratio = that collections total ÷ gross production (completed `ProcFee`). The denominator is gross, not adjusted production.

Total AR uses `patient.BalTotal` when that column exists, otherwise `patient.TotBal`, otherwise `patient.EstBalance`. Only positive amounts are added. The row must be the guarantor (`PatNum = Guarantor`). This is a current snapshot, not limited to the selected period.

AR over 90 days = sum of `patient.BalOver90` ÷ total AR.

## Treatment by Type

Below the tiles. One stacked column per month in the selected period. The toggle switches the same stacks between dollars and percent of that month.

Segment order is the same seven categories as the donut: Dentures, Extractions, Hygiene, Implants, Partial Dentures, Restorative Dentistry, Other.

Each segment is completed `ProcFee` in that month, rolled into those categories the same way as the donut.

## Denture Production & Payments

Three cards, left to right. Warranty tiers inside each denture card are 6-month, 1-Yr, 3-Yr, 5-Yr.

| Order | Card | What it shows | Calculation |
|------:|------|---------------|-------------|
| 1 | Denture Production by Warranty | Dollars | Completed `ProcFee` on Dentures-category procedures, split by warranty tier. |
| 2 | Denture Quantity by Warranty | Counts | Count of those same procedures, split by the same tiers. |
| 3 | Payment Mix | Share of payments | Cash, Insurance, Financed, SoonerCare. Legend order is that same left-to-right order. |

A procedure whose description starts with `SC` is left out of the warranty bars.

The tier is read from the description first. Spelled durations count, with spaces or hyphens between the number and the unit: 6-month (`6 month`, `6-month`, `6 mo`), 1-year (`1 year`, `1-year`, `1 yr`), 3-year, and 5-year. If the description names no tier, `5110` / `5120` / `5130` / `5140` (with or without a leading `D`) use the chart suffix: `.1` and `.11` are 6-month, `.4` and `.44` are 1-year, `.2` and `.22` are 3-year, `.3` and `.33` are 5-year. `.5` is not a warranty. `N8888` is not on that suffix table; its tier comes from the description only.

Partial-denture procedures are not drawn on these two bars. They stay in the Partial Dentures category elsewhere.

### Payment Mix

Each `paysplit` is classified in this order:

1. Insurance payment flag, or a PayType definition marked insurance → Insurance.
2. PayType marked SoonerCare → SoonerCare.
3. PayType marked financed → Financed.
4. PayType marked cash → Cash.
5. No PayType, and the split has a patient → Cash.
6. Otherwise the PayType name and note: SoonerCare / Medicaid / DentaQuest / Liberty Dental / Choctaw / iCare, then financing (CareCredit, Cherry, Sunbit, Proceed, and similar), then commercial insurance, then cash, check, or card.

`claimproc` insurance payments are added to Insurance, except SoonerCare carriers, which are added to SoonerCare. Amounts that match none of the buckets are omitted from the donut.

## Production Trend

One line per calendar year: two years ago, last year, this year. The axis is January through December.

Each point is the sum of completed `ProcFee` in that month. This chart is not limited to the period selected at the top of the page. It uses 1 January of two years ago through today.

The current year stops at the last finished month. A month still in progress is not drawn.

## Doctor

Practice rollup, then the provider table, then two bars. Providers are sorted by gross production, highest first.

| Order | Tile | MySQL | Calculation |
|------:|------|-------|-------------|
| 1 | Implants placed | `procedurelog` + `procedurecode.ProcCode` | Sum of each provider’s implant count (`D6010`, `D6011`, `D6040`, `D6050`, Complete). |
| 2 | Full-arch cases | same | Sum of each provider’s AOX case count. |
| 3 | New patients seen | `appointment` | Sum of each provider’s NP shows. |
| 4 | Same-day NP conversion | `paysplit.SplitAmt` | Same-day NP starts ÷ new patients seen. Target ≥ 30%. |
| 5 | Denture remakes | `procedurelog` | Sum of remake counts. The note is remakes ÷ dentures delivered. |

A provider’s new patient seen is a Complete visit (`AptStatus = 2`) on that `ProvNum`. When `appointment.IsNewPatient` is set, the visit must have `IsNewPatient = 1`. Otherwise it must be a consult show, using the same consult and attendance rules as Overview.

A same-day NP start is one of those shows with more than $250 collected that calendar day. The rate is those starts ÷ new patients seen.

Remakes are completed procedures matching `D5510`–`D5650`, `D6090`, or a description that says remake or repair of a complete denture.

### By Provider

One row per provider. Column order:

| Order | Column | Calculation |
|------:|--------|-------------|
| 1 | Provider | `provider` first and last name. |
| 2 | Production | That provider’s completed `ProcFee` in the period. |
| 3 | Dentures | Completed denture-delivery count (`D5110`–`D5140`). |
| 4 | Extractions | Completed extraction count. |
| 5 | Hygiene | Count of completed procedures whose category rolls up to Hygiene. |
| 6 | Implants | Completed implant-placement count. |
| 7 | Partials | Completed partial count (`D5211`–`D5286`). |
| 8 | Restorative | Count of completed procedures whose category rolls up to Restorative Dentistry. |
| 9 | Other | Count of completed procedures that roll up to Other. |
| 10 | Arches | That provider’s AOX case count. |
| 11 | NP seen | That provider’s new-patient shows. |
| 12 | Same-day NP | Count of that provider’s same-day NP starts. |
| 13 | $ / patient | Production ÷ NP seen. |

### Provider Production

| Order | Chart | Calculation |
|------:|-------|-------------|
| 1 | Production | One bar per provider: completed `ProcFee`. Same sort as the table. |
| 2 | Surgical Volume | One bar per provider: implant-placement count. |

### Provider page

Opened from a provider row. Donut first, then four stacks, then restorative, then the trend. The donut and the trend use the same rules as Overview, limited to that provider’s procedures.

| Stack | Order | Tile | Calculation |
|-------|------:|------|-------------|
| New Patients | 1 | NP's seen | That provider’s new-patient shows. |
| New Patients | 2 | SC NP's seen | When `IsNewPatient` is set, NP shows for a SoonerCare or OHCA patient. Otherwise, consult shows whose appointment type or note matches SoonerCare. |
| New Patients | 3 | Same-Day NP Close | Same-day NP starts ÷ NP's seen. Target ≥ 30%. |
| New Patients | 4 | NPs closed | Consult shows with no same-day close, and a later day in the period that does close. A close is a completed AOX sold code (`U-AOXS`, `U-AOXD`) or any other completed non-consult procedure. |
| Surgical Volume | 1 | Extractions | That provider’s extraction count. |
| Surgical Volume | 2 | Implants | That provider’s implant-placement count. |
| Dentures | 1 | Dentures | That provider’s denture-delivery count. |
| Dentures | 2 | Partials | That provider’s partial count. |
| Dentures | 3 | Denture Remakes | Remake count. The note is remakes ÷ dentures. |
| Production | 1 | Avg production / patient | Gross `ProcFee` ÷ NP's seen. |
| Production | 2 | Non-SC Production | Gross `ProcFee` minus SC production. |
| Production | 3 | SC Production | Completed fees for that provider’s SoonerCare or OHCA patients. |
| Production | 4 | F/ Production | Completed fees in category Fixed (All-on-4). |
| Production | 5 | FR/ Production | Completed fees in Dentures plus Partial Dentures. |

Restorative Production by Type is a donut of that provider’s Hygiene and Restorative Dentistry fees, larger slice first.

Production Trend is that provider’s completed `ProcFee` by month, same three-year January–December lines as Overview.

## Treatment Coordinator

### Cockpit Metrics

| Card | Order | Tile | MySQL / source | Calculation |
|------|------:|------|----------------|-------------|
| New Patients | 1 | NP's Scheduled | `appointment` | New-patient visits in the period that are not cancelled. When `IsNewPatient` is not on the appointment, this is consult visits that are not cancelled. |
| New Patients | 2 | NP's Seen | `appointment.AptStatus` | Those visits with `AptStatus = 2`. |
| New Patients | 3 | SC NP's | `carrier.CarrierName` | NP shows whose patient has a SoonerCare or OHCA primary carrier. When `IsNewPatient` is absent, a consult show whose type or note matches SoonerCare. |
| New Patients | 4 | Same-Day NP Close | `paysplit.SplitAmt` | Same rate as Overview same-day starts. The TC target is ≥ 75%. |
| Treatment | 1 | TX Plans Presented | `procedurelog` code `D7777` | Count of completed `D7777` procedures in the period. Coordinator is `N9210-Ashlie`, `N9410-Brie`, the same patient-day marker, or the `D7777` provider name. |
| Treatment | 2 | TX Closed/Paid | `treatplan`, `proctp`, `procedurelog.ProcStatus` | Closed plans ÷ presented plans. Target 60–75%. A plan is closed when every planned procedure is Complete. |
| Treatment | 3 | Conversions/Week | same closed plans | Closed plans ÷ weeks in the selected period. A week is 7 days, and the period is at least 1 week. |
| Treatment | 4 | Implants | `treatplan` procedures | Implant plans closed in the period ÷ implant plans presented in the period. Target ≥ 60%. |
| Cancellations | 1 | Cancellations | `appointment` | Visits in the period whose attendance is cancelled (confirm 66 or 67 while still open). |
| Cancellations | 2 | Cancellations Re-Booked | `appointment` | Cancelled visits that have a later non-cancelled visit for the same patient, ÷ cancellations. |
| Cancellations | 3 | No-Shows | `appointment.AptStatus`, confirm 69 | No-shows ÷ (shows + no-shows) for every visit in the period, not only consults. |
| Cancellations | 4 | No-Shows Rebooked | `appointment` | No-shows with a later non-cancelled visit ÷ no-shows. |

$ Financed is the sum of `paysplit.SplitAmt` in the period whose PayType is a financing type (CareCredit, Cherry, Sunbit, Proceed, and the other financing names). The donut splits that sum in this order: Care Credit, Cherry, Sunbit, Proceed, Other.

### Patient Journey by Channel

This block is GoHighLevel, not MySQL. Columns, left to right: Leads, Booked, Showed, Presented, Closed / paid, Production.

Leads, Booked, Showed, and Presented come from opportunity stage. Closed / paid is the surgery stage count. Production is the opportunity dollar amount. Presented on this table is the accepted stage, and Closed / paid is the surgery stage.

### Conversion Funnel

| Order | Chart | Stages | Calculation |
|------:|-------|--------|-------------|
| 1 | Presented → Showed → Closed | Plans presented, Showed, Closed | Distinct patients with a presented `D7777`, then those who also had a consult show, then those whose plan closed in the period. |
| 2 | Follow-Up Recapture | By day 1, By day 7, By day 30 | Closed plans whose close date is 0–1, 2–7, or 8–30 days after that patient’s consult show. |
| 3 | Acceptance by Case Type | Denture, Implant | Closed ÷ presented for that case type, shown as a percent. |

### Top Denial Reasons

One bar per reason, highest count first. A reason is the note on a treatment plan whose status is rejected and whose activity date is in the period. When GoHighLevel is connected, lost or declined pipeline stages are included.

### Key Figures

Left table, then right table.

| Order | Left | Calculation |
|------:|------|-------------|
| 1 | Plans presented | Completed `D7777` count. |
| 2 | Plans closed | Closed treatment plans in the period. |
| 3 | Presented ($) | Fees on the presented `D7777` events. |
| 4 | Closed ($) | Sum of procedure fees on closed plans. |
| 5 | Close rate | Closed dollars ÷ presented dollars. When presented dollars are 0, closed count ÷ presented count. |
| 6 | $ financed | Same financing total as the donut. |
| 7 | Conversions / week | Closed plans ÷ weeks in the period. |

| Order | Right | Calculation |
|------:|-------|-------------|
| 1 | Consult showed | Patients in the funnel who had a consult show. |
| 2 | Plans closed | Patients in the funnel whose plan closed. |
| 3 | Same-day starts | Overview same-day start count. |
| 4 | Denture acceptance | Denture plans closed ÷ denture plans presented. |
| 5 | Implant acceptance | Implant plans closed ÷ implant plans presented. |
| 6 | Same-day NP conversion | Overview same-day start rate. |
| 7 | NP success rate | Closed plans ÷ consult shows. |
| 8 | Phone pick-up rate | Not calculated. The tile stays —. |

## Insurance

Claim rows are `claim`. Status letters: `U` unsent (draft, skipped), `S` sent, `R` received (counted as paid), `C` canceled, `H` hold, `W` waiting. The period filter is `claim.DateSent`. Pre-authorizations are `claim.ClaimType = PreAuth` and are not included in the claim counts.

### Cockpit Metrics

| Card | Order | Tile | Calculation |
|------|------:|------|-------------|
| Claims | 1 | Submitted | Non-draft, non-PreAuth claims with `DateSent` in the period. |
| Claims | 2 | Paid | Those claims with status Received. |
| Claims | 3 | Clean claim rate | (Submitted − hold − waiting − canceled − corrected) ÷ submitted. Target ≥ 95%. Corrected means `CorrectionType` &gt; 0, or `DateSentOrig` / `DateResent` differs from `DateSent`. |
| Claims | 4 | Denial rate | (Hold + waiting + canceled) ÷ submitted. Target ≤ 5%. |
| Collections & AR | 1 | Collection ratio | When claims exist: `claimproc.InsPayAmt` ÷ estimated insurance payment. Otherwise the Overview ratio, collections ÷ gross production. Target ≥ 98%. |
| Collections & AR | 2 | Insurance collected | Sum of `claimproc.InsPayAmt` for status Received or Supplemental with `DateCP` in the period. Without claim lines, the Insurance slice of Payment Mix. |
| Collections & AR | 3 | Patient AR | Sum of guarantor `EstBalance`, floored at 0. Snapshot, not the selected period. |
| Collections & AR | 4 | Insurance AR | Sum of guarantor `InsEst` aging. If that is 0, outstanding sent-claim dollars. |
| Collections & AR | 5 | SC AR | Outstanding sent claims whose plan name is SoonerCare or Medicaid. |
| Collections & AR | 6 | Days in AR | Aging dollars weighted by midpoints 15, 45, 75, and 105, ÷ total aging dollars. Target ≤ 30 days. |
| Eligibility & Pre-Auth | 1 | Elig. verified | Not in Open Dental. The tile stays —. |
| Eligibility & Pre-Auth | 2 | Pre-auths submitted | `ClaimType = PreAuth` with `DateSent` in the period, excluding drafts. |
| Eligibility & Pre-Auth | 3 | Pre-auth approval | PreAuth claims Received ÷ pre-auths submitted. Target ≥ 80%. |
| Eligibility & Pre-Auth | 4 | Avg turnaround | Average days from `DateSent` to received for approved PreAuth claims. |

Collected by payer is a donut of insurance payments in the period, one slice per plan name, largest first, at most eight plans. The total above the donut is the sum of those slices.

### Claims Pipeline

| Order | Chart | Stages |
|------:|-------|--------|
| 1 | Submitted → Accepted → Paid | Submitted, Accepted (submitted minus canceled), Paid. |
| 2 | Denial Recovery | Canceled, then Paid. |

### Outstanding Claims

Donut of unpaid sent claims, billed amount, aged from `DateSent` (then date of service). Slice order: 0–29 Days, 30–59 Days, 60–89 Days, 90+ Days. The center is the open total. This is a current snapshot.

### Insurance AR Aging

| Order | Chart | Slices |
|------:|-------|--------|
| 1 | Aging AR | 0–30 days, 31–60 days, 61–90 days, 90+ days. Guarantor insurance estimates (`Bal_0_30`, `Bal_31_60`, `Bal_61_90`, `BalOver90` on the insurance side, or `InsEst`). If those are empty, the outstanding-claim buckets above are reused. |
| 2 | Aging Detail | The same four buckets as shares of the aging total. |

### Collections Trend

Two lines for the selected period: Net production, then Collected. Net production is completed `ProcFee` minus write-offs plus signed adjustments, by month. Collected is `paysplit.SplitAmt` plus insurance `InsPayAmt`, by month.

### SoonerCare

| Card | Order | Tile | Calculation |
|------|------:|------|-------------|
| Volume & Approval | 1 | SC patients seen | Same SC new-patient show count as the Treatment Coordinator tile. |
| Volume & Approval | 2 | SC claims submitted | Submitted claims whose plan or patient is SoonerCare, Medicaid, DentaQuest, or Liberty, with `DateSent` in the period. |
| Volume & Approval | 3 | SC approval rate | (SC submitted − SC canceled) ÷ SC submitted. Target ≥ 85%. |
| Volume & Approval | 4 | SC collected | SC claim `insurance_payment` in the period. Without claims, the SoonerCare payment-mix slice. |

SC Claim Approval repeats that approval rate on a gauge, then the funnel Submitted → Accepted (not canceled) → Paid.

SoonerCare Figures, top to bottom:

| Order | Row | Calculation |
|------:|-----|-------------|
| 1 | SC production billed | SC claim amount billed. Without claims, Overview SC production. |
| 2 | SC reimbursement collected | Same as SC collected. |
| 3 | Reimbursement ratio | SC collected ÷ SC production billed. |
| 4 | Avg reimbursement / claim | SC collected ÷ SC claims paid. |
| 5 | Pre-auth approval rate | SC PreAuth received ÷ SC PreAuth submitted. If no SC PreAuth exists, the all-payer PreAuth rate is shown instead. |
| 6 | Claims denied | SC claims canceled. |
| 7 | Claims pending | Outstanding sent SC claims. |
| 8 | Days to payment | Average days from `DateSent` to received for paid SC claims. |

SC Pre-Authorizations, when any exist: Submitted, Approved, Pending, Approval rate. Pending is sent, hold, or waiting. Approval rate is approved ÷ submitted, target ≥ 80%. If the period has PreAuth claims but none are SoonerCare, the same four tiles are shown for all payers.

## Marketing

Open Dental only. The source is `refattach` joined to `referral`. This office stores those sources with `RefType = 1`. A referral with no first name keeps its last name (`Google`, `Facebook or Instagram`, `TV`). A referral with a first name is one bucket, `Patient referral`. A patient with no referral is `Unknown`. One source per patient: earliest ref date, then item order, then attach id.

GoHighLevel is not used on this page. Ad spend, marketing ROI, cost per arch, $/lead, $/arch, and lead response time stay — because Open Dental does not store them. The Treatment Coordinator journey still uses GoHighLevel opportunities.

| Order | Tile | Calculation |
|------:|------|-------------|
| 1 | Total ad spend | Not stored in Open Dental. The tile stays —. |
| 2 | Marketing ROI | Needs ad spend. The tile stays —. |
| 3 | Cost / arch | Needs ad spend. The tile stays —. |
| 4 | Consult show rate | Open Dental consult shows ÷ (shows + no-shows). |

### Channel performance

One row per Open Dental referral source, then a Total row.

Leads, booked, showed, accepted, and surgery are new patients (`patient.DateFirstVisit` in the period). Booked is a non-cancelled visit. Showed is a complete visit. Accepted is a showed new patient with a completed non-consult procedure. Surgery is a completed `U-AOXS` or `U-AOXD`. Production is completed `ProcFee` in the period for every patient of that source, including patients whose first visit was earlier.

| Order | Column | Calculation |
|------:|--------|-------------|
| 1 | Channel | Open Dental referral name. |
| 2 | Spend | Not stored. The cell stays —. |
| 3 | Leads | New patients from that source. |
| 4 | Booked | Those new patients with a non-cancelled visit. |
| 5 | Showed | Those new patients with a complete visit. |
| 6 | Accepted | Showed new patients with a completed non-consult procedure. |
| 7 | Surgery | New patients with a completed AOX sold code. |
| 8 | Production | Completed `ProcFee` for patients of that source. |
| 9 | $/lead | Needs spend. The cell stays —. |
| 10 | $/arch | Needs spend. The cell stays —. |
| 11 | ROI | Needs spend. The cell stays —. |

Appointments on the snapshot go back about 365 days. When the selected period starts earlier, booked and showed stop at that window.

### Where we win & lose

| Order | Chart | Order of items |
|------:|-------|----------------|
| 1 | Acquisition funnel | Leads, Booked, Showed, Accepted, Surgery. All channels added together. |
| 2 | Production by source | Channels with production above 0, largest first, at most eight. |

### Top referral sources

| Order | Table column | Calculation |
|------:|--------------|-------------|
| 1 | Referral source | Open Dental referral name. |
| 2 | Leads | Showed, or leads when showed is 0. |
| 3 | Production | Completed `ProcFee` for that source. |

The first ten sources are shown.

Marketing scorecard, top to bottom: Cost per arch, Show rate, Treatment acceptance (accepted ÷ showed), Lead response time, Marketing ROI. Show rate and treatment acceptance come from Open Dental. Cost per arch, lead response time, and marketing ROI stay — .

## Patients by Area

City and ZIP only. Street and name are not read.

| Order | Tile | MySQL | Calculation |
|------:|------|-------|-------------|
| 1 | Top area by production | `patient.City`, `patient.State`, completed `ProcFee` | City with the highest completed production. The note is that dollar amount. |
| 2 | Patients (tracked) | `patient` | Patients grouped into a city, including unknown address. The note is how many distinct cities that is, excluding the unknown bucket. |
| 3 | Production (tracked) | `procedurelog.ProcFee` | Sum of completed fees in the period, grouped by the patient’s city. Includes unknown address. |
| 4 | Counties reached | city → county lookup | Distinct counties among mapped cities, out of the Texoma region county count. |

The heat map toggles between production and patients. Pins follow the current page of the city table.

### By City

Ranked by production, highest first.

| Order | Column | Calculation |
|------:|--------|-------------|
| 1 | City | `patient.City` and `patient.State`. |
| 2 | County | County for that city. |
| 3 | Patients | Patients in that city. Inactive patients stay in the index and are not dropped here. |
| 4 | Production | Completed `ProcFee` for patients in that city, in the selected period. |

Production by City repeats those page rows as bars, same rank order.
