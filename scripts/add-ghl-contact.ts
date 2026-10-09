/**
 * Add one Open Dental patient to GoHighLevel.
 *
 * Usage:
 *   npm run ghl:add-contact -- 14675
 *
 * Matches an existing GoHighLevel contact by phone or email.
 * Does not add a no-show tag.
 */
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { updateGhlContact, upsertGhlContact } from "../src/lib/ghl/contacts";
import { GhlApiError } from "../src/lib/ghl/http";
import {
  readOdGhlSyncState,
  writeOdGhlSyncState,
} from "../src/lib/ghl/od-ghl-sync-state";
import { patientContactInput } from "../src/lib/ghl/sync-from-opendental";
import { listOdPatientsForGhlByIds } from "../src/lib/opendental/ghl-sync-queries";
import { closeOpenDentalMysql } from "../src/lib/opendental/mysql";

loadEnvLocal();

function readPatNum(argv: string[]): number {
  const raw = argv.find((arg) => /^\d+$/.test(arg));
  const patNum = raw ? Number(raw) : NaN;
  if (!Number.isInteger(patNum) || patNum <= 0) {
    throw new Error("Pass an Open Dental PatNum. Example: npm run ghl:add-contact -- 14675");
  }
  return patNum;
}

async function main() {
  const patNum = readPatNum(process.argv.slice(2));
  const [patient] = await listOdPatientsForGhlByIds([patNum]);
  if (!patient) {
    throw new Error(`Open Dental patient ${patNum} was not found`);
  }
  const input = patientContactInput(patient);
  if (!input) {
    throw new Error(`Patient ${patNum} has no usable phone or email`);
  }

  const state = await readOdGhlSyncState();
  const key = String(patNum);
  let contactId = state.contacts[key]?.ghlContactId;
  let action: "created" | "updated" = "created";

  if (contactId) {
    try {
      await updateGhlContact(contactId, input);
      action = "updated";
    } catch (err) {
      if (!(err instanceof GhlApiError) || err.status !== 404) throw err;
      contactId = undefined;
    }
  }
  if (!contactId) {
    contactId = await upsertGhlContact(input);
  }

  state.contacts[key] = {
    ghlContactId: contactId,
    noShowTag: state.contacts[key]?.noShowTag ?? null,
  };
  await writeOdGhlSyncState(state);

  console.log(
    [
      action,
      `PatNum ${patNum}`,
      `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim(),
      input.phone ?? input.email,
      `GHL ${contactId}`,
    ]
      .filter(Boolean)
      .join("  "),
  );
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "add contact failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
