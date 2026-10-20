/**
 * One-time backfill of GHL od_consult_date (drives Consults Today) for patients
 * whose consult was booked before the OD → GHL cursor and never re-synced.
 *
 * Consult = N9310 consult line / consult appointment type, or D0150, D0120, D0150.2.
 * Writes only od_consult_date. Never creates contacts, tags, or sequences.
 * Output is PatNums and counts only.
 *
 * Usage:
 *   npx tsx --env-file=.env.local --require ./scripts/register-server-only-stub.cjs scripts/backfill-od-consult-date.ts
 *   ... -- --apply   (write; default is dry run)
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import {
  consultDateBackfillAction,
  ghlDateFieldYmd,
  nextConsultDateByPatient,
  type ConsultBackfillAction,
} from "../src/lib/ghl/consult-date-backfill";
import { resolveGhlContact } from "../src/lib/ghl/contact-resolve";
import { setContactConsultDate } from "../src/lib/ghl/contacts";
import { ghlFetch } from "../src/lib/ghl/http";
import { readOdGhlSyncState } from "../src/lib/ghl/od-ghl-sync-state";
import {
  getTexomaGhlConfigForSync,
  patientContactInput,
} from "../src/lib/ghl/sync-from-opendental";
import { closeMongoClient } from "../src/lib/mongo/client";
import {
  listOdAppointmentProcedureCodes,
  listOdFutureScheduledAppointments,
  listOdPatientsForGhlByIds,
} from "../src/lib/opendental/ghl-sync-queries";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

const APPLY = process.argv.includes("--apply");
const PAUSE_MS = 150;

type ContactView = {
  contact?: { customFields?: Array<{ id?: string; value?: unknown }> };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fieldId = process.env.GHL_OD_CONSULT_DATE_FIELD_ID?.trim();
  if (!fieldId) throw new Error("GHL_OD_CONSULT_DATE_FIELD_ID is required");
  const config = await getTexomaGhlConfigForSync();

  const future = await listOdFutureScheduledAppointments();
  const codeRows = await listOdAppointmentProcedureCodes(
    future.map((row) => row.AptNum),
  );
  const codesByApt = new Map<number, string[]>();
  for (const row of codeRows) {
    const list = codesByApt.get(row.AptNum) ?? [];
    list.push(row.ProcCode);
    codesByApt.set(row.AptNum, list);
  }
  const consultByPat = nextConsultDateByPatient(future, codesByApt);

  const state = await readOdGhlSyncState();
  const linkedPatNums = Object.keys(state.contacts).map(Number);
  const candidates = [
    ...new Set([...consultByPat.keys(), ...linkedPatNums]),
  ].sort((a, b) => a - b);

  const unlinked = candidates.filter((p) => !state.contacts[String(p)]);
  const patients = new Map(
    (await listOdPatientsForGhlByIds(unlinked)).map((row) => [row.PatNum, row]),
  );

  const byAction: Record<ConsultBackfillAction, number[]> = {
    set: [],
    change: [],
    clear: [],
    unchanged: [],
  };
  const unmatched: number[] = [];
  const unclear: number[] = [];
  const failed: number[] = [];

  for (const patNum of candidates) {
    try {
      const link = state.contacts[String(patNum)];
      let contactId = link?.ghlContactId ?? null;
      if (!contactId) {
        const row = patients.get(patNum);
        const input = row ? patientContactInput(row) : null;
        const resolved = await resolveGhlContact(
          { patNum, phone: input?.phone ?? null, email: input?.email ?? null },
          config,
        );
        if (resolved.kind === "unclear") {
          unclear.push(patNum);
          continue;
        }
        if (resolved.kind === "none") {
          unmatched.push(patNum);
          continue;
        }
        contactId = resolved.contactId;
      }

      const view = await ghlFetch<ContactView>(
        `/contacts/${encodeURIComponent(contactId)}`,
        {},
        config,
      );
      const field = view.contact?.customFields?.find((f) => f.id === fieldId);
      const current = ghlDateFieldYmd(field?.value);
      const next = consultByPat.get(patNum) ?? null;
      const action = consultDateBackfillAction({
        current,
        next,
        linked: Boolean(link),
      });
      byAction[action].push(patNum);

      if (APPLY && action !== "unchanged") {
        await setContactConsultDate(contactId, next ?? "", config);
      }
    } catch (err) {
      failed.push(patNum);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`PatNum ${patNum}: ${message.slice(0, 160)}`);
    }
    await sleep(PAUSE_MS);
  }

  const list = (ids: number[]) => (ids.length ? ids.join(", ") : "-");
  console.log(APPLY ? "od_consult_date backfill APPLIED" : "od_consult_date backfill DRY RUN");
  console.log(`future scheduled appts ${future.length}`);
  console.log(`patients with a future consult ${consultByPat.size}`);
  console.log(`linked contacts in sync state ${linkedPatNums.length}`);
  console.log(`candidates ${candidates.length}`);
  console.log(`set (empty -> date) ${byAction.set.length}: ${list(byAction.set)}`);
  console.log(`change (wrong date) ${byAction.change.length}: ${list(byAction.change)}`);
  console.log(`clear (linked, no future consult) ${byAction.clear.length}: ${list(byAction.clear)}`);
  console.log(`already correct ${byAction.unchanged.length}`);
  console.log(`no GHL contact ${unmatched.length}: ${list(unmatched)}`);
  console.log(`unclear match (skipped) ${unclear.length}: ${list(unclear)}`);
  console.log(`failed ${failed.length}: ${list(failed)}`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOpenDentalMysql();
    await closeMongoClient().catch(() => undefined);
  });
