import test from "node:test";
import assert from "node:assert/strict";
import { decide, type ChainTx, type DecisionInput } from "../lib/payments/decision";

const t0 = new Date("2026-10-21T12:00:00Z");
const min = (n: number) => new Date(t0.getTime() + n * 60_000);

const ok = (over: Partial<Extract<ChainTx, { state: "ok" }>> = {}): ChainTx => ({
  state: "ok", recipientOk: true, amountUnits: 50_000_000n, confirmations: 3, occurredAt: min(10), ...over,
});

const base = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  mode: "automatic", autoVerificationEnabled: true, tx: ok(), expectedUnits: 50_000_000n,
  requiredConfirmations: 1, quoteCreatedAt: t0, quoteExpiresAt: min(60), ambiguous: false, now: min(15), ...over,
});

test("clean payment in automatic mode is approved", () => {
  assert.equal(decide(base()).action, "approve");
});

test("clean payment in hybrid mode waits for the admin, marked clean", () => {
  const d = decide(base({ mode: "hybrid" }));
  assert.equal(d.action, "review");
  assert.equal(d.action === "review" && d.verifiedClean, true);
});

test("manual mode never auto-approves", () => {
  assert.equal(decide(base({ mode: "manual" })).action, "review");
});

test("developer kill-switch turns automatic into review", () => {
  assert.equal(decide(base({ autoVerificationEnabled: false })).action, "review");
});

test("not found / failed / wrong recipient", () => {
  assert.equal(decide(base({ tx: { state: "not_found" } })).action, "not_found");
  assert.equal(decide(base({ tx: { state: "failed", reason: "reverted" } })).action, "reject_submission");
  assert.equal(decide(base({ tx: ok({ recipientOk: false }) })).action, "reject_submission");
  assert.equal(decide(base({ tx: ok({ amountUnits: 0n }) })).action, "reject_submission");
});

test("too few confirmations waits, even if otherwise clean", () => {
  assert.equal(decide(base({ requiredConfirmations: 3, tx: ok({ confirmations: 1 }) })).action, "wait");
});

test("underpayment goes to a human, never auto-approved", () => {
  const d = decide(base({ tx: ok({ amountUnits: 49_999_999n }) }));
  assert.equal(d.action, "review");
  assert.match(d.note, /underpaid/);
});

test("exact and +1% overpay are fine; beyond that needs review", () => {
  assert.equal(decide(base({ tx: ok({ amountUnits: 50_500_000n }) })).action, "approve");
  assert.equal(decide(base({ tx: ok({ amountUnits: 50_500_001n }) })).action, "review");
});

test("late or pre-dated payments are reviewed", () => {
  assert.match((decide(base({ tx: ok({ occurredAt: min(75) }) })) as any).note, /after the price quote expired/);
  assert.match((decide(base({ tx: ok({ occurredAt: min(-30) }) })) as any).note, /before this quote existed/);
  assert.equal(decide(base({ tx: ok({ occurredAt: min(69) }) })).action, "approve"); // within 10 min slack
});

test("ambiguity (same amount fits another open payment) is reviewed", () => {
  assert.equal(decide(base({ ambiguous: true })).action, "review");
});

test("unconfirmed tx (no timestamp) is timed against 'now'", () => {
  assert.equal(decide(base({ tx: ok({ occurredAt: null }), now: min(20) })).action, "approve");
  assert.equal(decide(base({ tx: ok({ occurredAt: null }), now: min(80) })).action, "review");
});
