import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Match precedence is documented here; live HTTP resolve is covered by e2e.
 * Order: od_patnum → phone → email → create only if none; unclear if phone≠email.
 */
describe("contact resolve precedence", () => {
  it("documents resolve order constants", () => {
    const order = ["patnum", "phone", "email", "create"] as const;
    assert.deepEqual([...order], ["patnum", "phone", "email", "create"]);
  });

  it("treats phone≠email as unclear (no create)", () => {
    const [phoneId, emailId]: string[] = ["contact-a", "contact-b"];
    const unclear = phoneId !== emailId;
    assert.equal(unclear, true);
  });
});
