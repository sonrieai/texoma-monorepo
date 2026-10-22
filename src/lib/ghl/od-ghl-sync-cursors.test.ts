import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hydrateModeCursors,
  normalizeOdGhlSyncState,
  parseOdGhlSyncMode,
} from "@/lib/ghl/od-ghl-sync-state";
import { odConsultAppointmentSqlPredicate } from "@/lib/opendental/ghl-sync-queries";
import { isConsultProcedureCode } from "@/lib/ghl/od-disposition-tags";

describe("GHL sync mode cursors", () => {
  it("seeds all modes from the legacy cursor", () => {
    const cursors = hydrateModeCursors(undefined, "2026-10-09 10:00:00");
    assert.equal(cursors.consults, "2026-10-09 10:00:00");
    assert.equal(cursors.patients, "2026-10-09 10:00:00");
    assert.equal(cursors.appointments, "2026-10-09 10:00:00");
    assert.equal(cursors.sold, "2026-10-09 10:00:00");
  });

  it("does not let a consults advance overwrite other modes", () => {
    const state = normalizeOdGhlSyncState({
      cursor: "2026-10-09 10:00:00",
      cursors: {
        consults: "2026-10-09 12:00:00",
        patients: "2026-10-09 10:00:00",
        appointments: "2026-10-09 10:00:00",
        sold: "2026-10-09 10:00:00",
      },
      contacts: {},
    });
    assert.equal(state.cursors.consults, "2026-10-09 12:00:00");
    assert.equal(state.cursors.patients, "2026-10-09 10:00:00");
    assert.equal(state.cursor, "2026-10-09 12:00:00");
  });

  it("parses CLI modes and rejects unknown values", () => {
    assert.equal(parseOdGhlSyncMode("consults"), "consults");
    assert.equal(parseOdGhlSyncMode("patients"), "patients");
    assert.equal(parseOdGhlSyncMode("appointments"), "appointments");
    assert.equal(parseOdGhlSyncMode("sold"), "sold");
    assert.equal(parseOdGhlSyncMode("all"), "all");
    assert.equal(parseOdGhlSyncMode("nope"), null);
  });
});

describe("consult appointment SQL predicate", () => {
  it("matches N9310* and the three exam codes", () => {
    const sql = odConsultAppointmentSqlPredicate("a");
    assert.match(sql, /N9310%/);
    assert.match(sql, /'D0150'/);
    assert.match(sql, /'D0120'/);
    assert.match(sql, /'D0150\.2'/);
  });

  it("aligns procedure-code helper with that SQL", () => {
    assert.equal(isConsultProcedureCode("N9310 AOX Consult"), true);
    assert.equal(isConsultProcedureCode("N9310"), true);
    assert.equal(isConsultProcedureCode("D0150"), true);
    assert.equal(isConsultProcedureCode("D0150.1"), false);
    assert.equal(isConsultProcedureCode("D1110"), false);
  });
});
