import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccess,
  landingPath,
  normalizeDashboardRole,
  resolvePostLoginPath,
} from "@/lib/auth/roles";

describe("dashboard role access", () => {
  it("lets the owner open every page", () => {
    for (const path of [
      "/overview",
      "/admin",
      "/doctor",
      "/doctor/9",
      "/tc",
      "/tc/ashlie",
      "/insurance",
      "/marketing",
      "/geo",
      "/settings/ghl",
      "/api/admin/users",
      "/api/metrics/overview",
    ]) {
      assert.equal(canAccess("owner", path), true, path);
    }
  });

  it("limits a doctor to their own provider page", () => {
    assert.equal(canAccess("doctor", "/doctor/15", "15"), true);
    assert.equal(canAccess("doctor", "/doctor/15?start=2026-01-01", "15"), true);
    assert.equal(canAccess("doctor", "/doctor", "15"), false);
    assert.equal(canAccess("doctor", "/doctor/16", "15"), false);
    assert.equal(canAccess("doctor", "/overview", "15"), false);
    assert.equal(canAccess("doctor", "/insurance", "15"), false);
    assert.equal(canAccess("doctor", "/tc", "15"), false);
    assert.equal(canAccess("doctor", "/admin", "15"), false);
    assert.equal(canAccess("doctor", "/api/metrics/providers", "15"), true);
    assert.equal(canAccess("doctor", "/api/metrics/overview", "15"), false);
    assert.equal(canAccess("doctor", "/doctor/15"), false);
    assert.equal(canAccess("doctor", "/overview", "../overview"), false);
    assert.equal(landingPath("doctor", "../overview"), "/login?reason=no-access");
    assert.equal(landingPath("doctor", null), "/login?reason=no-access");
    assert.equal(landingPath("doctor", "15"), "/doctor/15");
  });

  it("lets an office manager open every page except overview and admin", () => {
    assert.equal(canAccess("office_manager", "/overview"), false);
    assert.equal(canAccess("office_manager", "/"), false);
    assert.equal(canAccess("office_manager", "/admin"), false);
    assert.equal(canAccess("office_manager", "/api/admin/users"), false);
    assert.equal(canAccess("office_manager", "/api/metrics/overview"), false);
    for (const path of [
      "/doctor",
      "/doctor/4",
      "/tc",
      "/tc/brie",
      "/insurance",
      "/marketing",
      "/geo",
      "/settings",
      "/settings/procedure-codes",
      "/api/settings/ghl",
      "/api/metrics/providers",
      "/api/metrics/coordinators",
    ]) {
      assert.equal(canAccess("office_manager", path), true, path);
    }
    assert.equal(landingPath("office_manager"), "/doctor");
  });

  it("limits insurance to the insurance page", () => {
    assert.equal(canAccess("insurance", "/insurance"), true);
    assert.equal(canAccess("insurance", "/insurance/extra"), false);
    assert.equal(canAccess("insurance", "/overview"), false);
    assert.equal(canAccess("insurance", "/doctor"), false);
    assert.equal(landingPath("insurance"), "/insurance");
  });

  it("lets a treatment coordinator open every treatment coordinator page", () => {
    assert.equal(canAccess("treatment_coordinator", "/tc"), true);
    assert.equal(canAccess("treatment_coordinator", "/tc/ashlie"), true);
    assert.equal(canAccess("treatment_coordinator", "/api/metrics/coordinators"), true);
    assert.equal(canAccess("treatment_coordinator", "/overview"), false);
    assert.equal(canAccess("treatment_coordinator", "/doctor/1"), false);
    assert.equal(canAccess("treatment_coordinator", "/insurance"), false);
    assert.equal(canAccess("treatment_coordinator", "/api/metrics/providers"), false);
    assert.equal(landingPath("treatment_coordinator"), "/tc");
  });

  it("treats a missing stored role as insurance (least privilege)", () => {
    assert.equal(normalizeDashboardRole(undefined), "insurance");
    assert.equal(normalizeDashboardRole("doctor"), "doctor");
    assert.equal(normalizeDashboardRole("nope"), "insurance");
  });

  it("sends login to the role home when the callback is closed", () => {
    assert.equal(
      resolvePostLoginPath({
        callbackUrl: "/overview",
        role: "doctor",
        providerId: "15",
        homePath: "/doctor/15",
      }),
      "/doctor/15",
    );
    assert.equal(
      resolvePostLoginPath({
        callbackUrl: "/insurance?start=2026-01-01",
        role: "insurance",
        homePath: "/insurance",
      }),
      "/insurance?start=2026-01-01",
    );
    assert.equal(
      resolvePostLoginPath({
        callbackUrl: "//evil.example",
        role: "owner",
        homePath: "/overview",
      }),
      "/overview",
    );
    assert.equal(
      resolvePostLoginPath({
        callbackUrl: "/marketing",
        role: "office_manager",
        homePath: "/doctor",
      }),
      "/marketing",
    );
  });
});
