import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashPassword,
  validateNewPassword,
  verifyPasswordHash,
} from "@/lib/auth/password";

describe("validateNewPassword", () => {
  it("accepts a strong password", () => {
    assert.equal(validateNewPassword("TexomaDev1!"), null);
  });

  it("rejects short passwords", () => {
    assert.match(validateNewPassword("Ab1") ?? "", /at least 8/i);
  });

  it("rejects passwords missing complexity", () => {
    assert.match(
      validateNewPassword("alllowercase1") ?? "",
      /uppercase, lowercase, and a number/i,
    );
  });
});

describe("hashPassword", () => {
  it("hashes and verifies a password", () => {
    const stored = hashPassword("TexomaDev1!");
    assert.notEqual(stored, "TexomaDev1!");
    assert.equal(verifyPasswordHash("TexomaDev1!", stored), true);
  });

  it("rejects the wrong password", () => {
    const stored = hashPassword("TexomaDev1!");
    assert.equal(verifyPasswordHash("WrongPass1!", stored), false);
  });
});
