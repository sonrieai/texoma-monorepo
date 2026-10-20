import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearOdSyncLastSuccessIdCache,
  OD_SYNC_LAST_SUCCESS_NAME,
  OdSyncHeartbeatConfigError,
  resolveOdSyncLastSuccessValueId,
} from "@/lib/ghl/custom-values";

describe("od_sync_last_success heartbeat", () => {
  afterEach(() => {
    clearOdSyncLastSuccessIdCache();
    delete process.env.GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID;
  });

  it("uses a stable custom value name", () => {
    assert.equal(OD_SYNC_LAST_SUCCESS_NAME, "od_sync_last_success");
  });

  it("requires GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID", () => {
    assert.throws(
      () => resolveOdSyncLastSuccessValueId(),
      OdSyncHeartbeatConfigError,
    );
  });

  it("reads the value id from env", () => {
    process.env.GHL_OD_SYNC_LAST_SUCCESS_VALUE_ID = "ky9F9nRdpbabL9AUXYPQ";
    assert.equal(resolveOdSyncLastSuccessValueId(), "ky9F9nRdpbabL9AUXYPQ");
  });
});
