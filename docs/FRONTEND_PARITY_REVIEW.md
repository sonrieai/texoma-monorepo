# Frontend Parity Review

Comparison of:

- `texoma-monorepo/src`
- `fullarched-monorepo/KPI Dashboard/KPI Dashboard`

Reviewed: 2026-09-14

## Conclusion

Keep `src/` as the production frontend. It has the stronger application
architecture, responsive behavior, settings, authentication recovery, routing,
and empty/error states.

Use KPI Dashboard as a broader metric specification. Port only fields with a
verified source; do not replace `src/` wholesale or copy demo/manual values as
if they were live.

Both applications contain the same six primary views:

1. Overview
2. Doctor
3. Treatment Coordinator
4. Insurance
5. Marketing
6. Patients by Area

## Overview

### Shared

- Production by Category
- New Patient Conversion:
  - NP's
  - Consult show rate
  - Same-day starts
  - Treatment plan closed
- Production:
  - Adjusted production
  - SoonerCare production
- Procedure Volume:
  - Extractions
  - Implants placed
  - AOX cases
  - Dentures delivered
- Collections & AR:
  - Collection ratio
  - Total AR
  - AR over 90 days
- Treatment by Type with count/percentage toggle
- Denture warranty production
- Payment mix
- Three-year monthly production trend

### Extra in `src/`

- Partial Production by Warranty
- Typed reusable chart and KPI components
- More explicit empty/error behavior

### Extra in KPI Dashboard

- No meaningful additional visible Overview field.

### Recommendation

Keep the `src/` Overview implementation.

## Doctor

### Shared aggregate fields

- Implants placed
- Full-arch cases
- New patients seen
- Same-day NP conversion
- Denture remakes
- Provider production chart
- Surgical volume chart

### Provider table

`src/` includes:

- Provider
- Production
- Dentures
- Extractions
- Hygiene
- Implants
- Partials
- Restorative
- Other
- Arches
- NP seen
- Same-day NP
- Production per patient

KPI Dashboard includes:

- Provider
- Production
- Implants
- Arches
- Dentures
- NP seen
- Same-day NP
- Production per patient

The `src/` table is more complete and includes a dedicated mobile card layout.

### Shared provider-detail sections

- Production by Category
- New Patients
- Surgical Volume
- Dentures
- Production
- Restorative Production by Type
- Monthly Production by Year

### KPI Dashboard fields not populated in `src/`

- SC NP's seen
- NPs closed later/non-same-day
- F/ Production
- FR/ Production

These fields exist in the `src/` UI but display `—` because a verified source
is not currently available.

### Recommendation

Keep the richer `src/` table. Fill the four placeholder fields only after their
Open Dental meaning and source are verified.

## Treatment Coordinator

### Shared cockpit groups

#### New Patients

- NP's Scheduled
- NP's Seen
- SC NP's
- Same-Day NP Close

#### Treatment

- TX Plans Presented
- TX Closed/Paid
- Conversions/Week
- Implant acceptance

#### Cancellations

- Cancellations
- Cancellations Re-Booked
- No-Shows
- No-Shows Rebooked

#### Financing

- Total financed
- Financing mix by lender

### Shared sections

- Patient Journey by Channel
- Conversion Funnel
- Follow-Up Recapture
- Acceptance by Case Type
- Top Denial Reasons
- Key Figures
- Per-coordinator views

### Funnel difference

`src/` uses:

```text
Presented → Showed → Closed
```

KPI Dashboard uses:

```text
Presented → Accepted → Scheduled → Same-day
```

### KPI Dashboard fields ahead of `src/`

- Phone pick-up rate
- Some manual follow-up/recapture values

The `src/` phone pick-up rate currently displays `—`.

### Recommendation

Freeze the intended funnel stages before changing labels. Add phone pickup only
after GHL call tracking or another reliable call source is connected.

## Insurance

### Shared

- Claims submitted and paid
- Denial rate
- Collection ratio
- Insurance collected
- Patient, insurance, and SoonerCare AR
- Days in AR
- Collected by payer
- Claims pipeline
- Outstanding claims by age
- Insurance AR aging
- Collections trend
- SoonerCare volume, claims, collections, and reimbursement

### KPI Dashboard fields missing or unavailable in `src/`

#### Claims

- Clean claim rate
- Denials appealed
- Denials recovered
- Structured denial reasons

#### Eligibility and pre-authorization

- Eligibility verified
- Pre-authorizations submitted
- Pre-authorization approval rate
- Average turnaround

#### SoonerCare

- Approval rate
- Pre-authorization approval
- Pre-authorization submitted/approved/pending
- Days to payment

The corresponding `src/` fields are either explicit placeholders or omitted
because the current warehouse queries do not expose the required fields.

### Recommendation

This is the highest-value direct Open Dental API migration area. Verify Open
Dental endpoints and field definitions before implementing these metrics.

## Marketing

### Shared cockpit

- Total ad spend
- Marketing ROI
- Cost per arch
- Consult show rate

### Shared channel table

- Channel
- Spend
- Leads
- Booked
- Showed
- Accepted
- Surgery
- Production
- Cost per lead
- Cost per arch
- ROI

### Shared analysis

- Acquisition funnel
- Production by source
- Referral source table
- Marketing scorecard

### Extra in KPI Dashboard

- Trailing 12-month New Patient Count chart
- Acquisition-cost table:
  - Cost per lead
  - Cost per show
  - Cost per accepted
  - Cost per arch
- ROI by Channel chart
- Production by Referral Source chart
- Average First Response Time:
  - Phone calls
  - Facebook leads
  - Website forms
  - Messenger

### Extra in `src/`

- Live GHL Ad Publishing integration for Facebook and Google spend
- Production-ready GHL configuration UI
- Explicit disconnected/no-opportunity states

KPI Dashboard classifies ad spend as manual, while `src/` can load it from GHL
Ad Publishing when ads are connected and the token has
`adPublishing.readonly`.

### Recommendation

Port the four KPI Dashboard analysis views into `src/`, but keep the `src/`
live spend implementation. Response-time fields require GHL conversation and
call timestamps.

## Patients by Area

### Shared

- Top area by production
- Patients tracked
- Production tracked
- Counties reached
- Production/patient heat-map toggle
- Interactive Leaflet map
- City, county, patient, and production table
- Production by City chart

### Extra in KPI Dashboard

- Campaign flags for Facebook, Mailer, and TV

### Period behavior problem

In `src/`, the global period control appears on Geo, but `loadGeoSummary()` is
not period-scoped. Changing Daily/Monthly/Range does not change Geo data.

In KPI Dashboard, Geo values use the shared period factor; Daily and Date range
scale the loaded monthly state rather than fetching exact date-scoped data.

### Recommendation

Implement real period-scoped Geo queries or hide the period control on Geo.
Add campaign flags only when campaign geography has a reliable source.

## Platform and Frontend Architecture

### Advantages in `src/`

- Next.js App Router with URL deep links
- Period query parameters preserved through navigation
- Responsive sidebar and mobile drawer
- Mobile provider cards
- Accessible controls and semantic React components
- Page-level loading, error, and empty states
- Settings pages:
  - Data sync
  - Sync status and history
  - GHL credentials
  - Procedure-code catalog
- Forgot-password and reset-password flows
- Development API documentation
- Search and pagination where needed

### Advantages in KPI Dashboard

- Role-scoped views:
  - Owner
  - Office
  - Doctor
  - Treatment coordinator
  - Insurance
  - Marketing
- Visible data freshness badge
- Source-health warnings
- One-click refresh
- Persistent “Sample data — not your practice” warning
- Server/CLI support for user management
- Backend support for protected manual metric values

KPI Dashboard does not currently expose complete browser interfaces for user
administration, GHL setup, sync control, data provenance, or manual entry.

### Important KPI Dashboard limitations

- No URL routing or view deep links
- All frontend rendering is concentrated in one large `public/app.js`
- Monthly selection refetches data, but Daily and Date range apply a local
  scaling factor instead of querying exact periods
- Manual-entry backend exists, but no visible `[data-path]` inputs are rendered
- User and sync administration are API/CLI only

## Recommended Implementation Order

1. Keep `src/` as the single frontend.
2. Freeze metric definitions before matching labels.
3. Add role-scoped navigation and server authorization to `src/`.
4. Add a visible freshness/source warning and refresh action.
5. Fix or hide the Geo period filter.
6. Port Marketing acquisition-cost and response-time analysis.
7. Close Insurance gaps using verified direct Open Dental reads.
8. Add campaign geography only when a real source exists.

## Evidence

Primary `src/` files:

- `src/app/overview/page.tsx`
- `src/app/doctor/page.tsx`
- `src/app/doctor/[id]/page.tsx`
- `src/app/tc/page.tsx`
- `src/app/tc/[slug]/page.tsx`
- `src/app/insurance/page.tsx`
- `src/app/marketing/page.tsx`
- `src/app/geo/page.tsx`
- `src/components/analytics/`
- `src/components/geo/`
- `src/components/providers/`
- `src/components/settings/`
- `src/components/shell/`

Primary KPI Dashboard files:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/app.css`
- `src/auth/auth.js`
- `src/api/routes.js`
- `src/metrics/registry.js`
