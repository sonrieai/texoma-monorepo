# Item 29 — Text consent measurement (proposal)

**Read-only today:** `npm run report:txt-msg-ok` lists Open Dental `TxtMsgOk` distribution (SELECT only).

## Goal

Measure how many active patients are textable vs not, without bulk-writing GoHighLevel during analysis.

## Recommended import approach (practice approval required)

1. **Source of truth:** Open Dental `patient.TxtMsgOk` (and future broken-appt preferences when exposed read-only).
2. **GoHighLevel:** SMS DND is applied only by the live OD→GHL sync (`applySmsConsentDnd`) when a contact already exists for a sync reason — never bulk-create contacts for consent alone.
3. **One-time backfill (optional):** After dry-run contact counts (`npm run sync:od-ghl -- --dry-run`), run sync on a bounded window so only patients with appointments/consults get contacts; consent fields update in place.
4. **Reporting:** Weekly `report:txt-msg-ok` + GHL hygiene audit (`npm run audit:ghl-hygiene`) for DND mismatches.
5. **Do not** import consent from spreadsheets into GHL without matching `od_patnum` first.

## Done when

Practice signs off on wording, DND rules match item 28 workflows, and a sample week shows OD Yes/No aligned with GHL SMS channel for linked contacts only.
