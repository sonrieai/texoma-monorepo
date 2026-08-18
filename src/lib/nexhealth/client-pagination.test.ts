import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  NEXHEALTH_MAX_PAGES_CAP,
  resolveListMaxPages,
} from "./client";

describe("resolveListMaxPages", () => {
  const prev = process.env.SYNC_NEXHEALTH_MAX_PAGES;

  afterEach(() => {
    if (prev === undefined) delete process.env.SYNC_NEXHEALTH_MAX_PAGES;
    else process.env.SYNC_NEXHEALTH_MAX_PAGES = prev;
  });

  it("defaults to 50 when env is unset", () => {
    delete process.env.SYNC_NEXHEALTH_MAX_PAGES;
    assert.equal(resolveListMaxPages(), 50);
  });

  it("honors numeric env up to cap", () => {
    process.env.SYNC_NEXHEALTH_MAX_PAGES = "120";
    assert.equal(resolveListMaxPages(), 120);
  });

  it("treats all/0 as cap", () => {
    process.env.SYNC_NEXHEALTH_MAX_PAGES = "all";
    assert.equal(resolveListMaxPages(), NEXHEALTH_MAX_PAGES_CAP);
  });

  it("respects explicit override", () => {
    process.env.SYNC_NEXHEALTH_MAX_PAGES = "10";
    assert.equal(resolveListMaxPages(25), 25);
  });
});
