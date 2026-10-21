# Missed-appointment recovery workflows (item 28 — draft spec)

Build in GoHighLevel as **drafts** until the practice approves wording.

## Trigger

Card enters **Leads Pipeline → No-Show/Cancellation** (`ce2067f3-7e1a-4293-b476-e7b4834bc307`). The OD→GHL sync moves the patient's existing card to this stage on missed **consult** only.

## Sequence

1. Immediate **call task** to the contact's assigned user (human first).
2. After **5 days** with `od_next_appt_date` still empty: text sequence every few days (varied copy), booking link with `utm_campaign=no-show-text`.
3. Stop on booking, reply, or STOP.
4. Final call task closes the sequence.

## Before every text step

- Text consent = Yes (`TxtMsgOk` in Open Dental, synced to GHL SMS policy)
- Contact not DND
- `od_sync_last_success` within ~24 hours

If any check fails: skip texts; call tasks may still run.

## Attribution

Sign texts using the coordinator from the **Open Dental visit code** (N9210/N9410), not GHL card owner (round-robin).

## Website bookings

Do not count `utm_campaign=no-show-text` recoveries as marketing website booking sources (item 18).
