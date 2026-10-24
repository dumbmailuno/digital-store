import test from "node:test";
import assert from "node:assert/strict";
import { deriveState, type Sub } from "../lib/subscription";

const now = Date.parse("2026-10-22T12:00:00Z");
const day = 86_400_000;
const sub = (over: Partial<Sub> = {}): Sub => ({ status: "active", expires_at: new Date(now + 30 * day).toISOString(), grace_days: 3, maintenance_forced: false, monthly_fee_usd: "0", note: null, ...over });

test("online with 30 days left", () => assert.equal(deriveState(sub(), now).state, "online"));
test("warning inside the last 7 days", () => assert.equal(deriveState(sub({ expires_at: new Date(now + 5 * day).toISOString() }), now).state, "warning"));
test("grace period right after expiry", () => assert.equal(deriveState(sub({ expires_at: new Date(now - 1 * day).toISOString() }), now).state, "grace"));
test("offline once the grace period ends", () => assert.equal(deriveState(sub({ expires_at: new Date(now - 4 * day).toISOString() }), now).state, "offline"));
test("forced maintenance and suspended status are offline even when paid up", () => {
  assert.equal(deriveState(sub({ maintenance_forced: true }), now).state, "offline");
  assert.equal(deriveState(sub({ status: "suspended" }), now).state, "offline");
});
test("zero grace days: offline the moment it expires", () => assert.equal(deriveState(sub({ grace_days: 0, expires_at: new Date(now - 1000).toISOString() }), now).state, "offline"));
