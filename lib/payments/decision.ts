// Pure decision logic: given what the chain says and what we expected, decide
// what happens next. No network, no database, so it can be tested exhaustively.
// Rule of thumb: anything uncertain goes to a human. We only ever auto-approve
// a payment that is clean on every check.

export type ChainTx =
  | { state: "not_found" }
  | { state: "failed"; reason: string }
  | {
      state: "ok";
      recipientOk: boolean;      // funds reached OUR wallet on the right asset/network
      amountUnits: bigint;       // amount that reached our wallet
      confirmations: number;
      occurredAt: Date | null;   // null while unconfirmed
    };

export type VerificationMode = "automatic" | "hybrid" | "manual";

export type DecisionInput = {
  mode: VerificationMode;
  autoVerificationEnabled: boolean;   // developer feature flag
  tx: ChainTx;
  expectedUnits: bigint;
  requiredConfirmations: number;
  quoteCreatedAt: Date;
  quoteExpiresAt: Date;
  ambiguous: boolean;                 // another live payment could be claiming this same tx
  now: Date;
};

export type Decision =
  | { action: "not_found"; note: string }
  | { action: "reject_submission"; note: string }
  | { action: "wait"; note: string }
  | { action: "review"; note: string; verifiedClean: boolean }
  | { action: "approve"; note: string };

const OVERPAY_TOLERANCE_NUM = 101n; // up to +1% is accepted as "exact"
const OVERPAY_TOLERANCE_DEN = 100n;
const LATE_SLACK_MS = 10 * 60 * 1000;
const EARLY_SLACK_MS = 2 * 60 * 1000;

export function decide(i: DecisionInput): Decision {
  const { tx } = i;
  if (tx.state === "not_found") return { action: "not_found", note: "transaction not found yet" };
  if (tx.state === "failed") return { action: "reject_submission", note: `transaction failed on-chain: ${tx.reason}` };
  if (!tx.recipientOk || tx.amountUnits <= 0n) {
    return { action: "reject_submission", note: "transaction did not send the expected asset to our address" };
  }

  if (tx.confirmations < i.requiredConfirmations) {
    return { action: "wait", note: `waiting for confirmations (${tx.confirmations}/${i.requiredConfirmations})` };
  }

  const problems: string[] = [];
  if (tx.amountUnits < i.expectedUnits) problems.push("underpaid");
  if (tx.amountUnits * OVERPAY_TOLERANCE_DEN > i.expectedUnits * OVERPAY_TOLERANCE_NUM) problems.push("overpaid by more than 1%");

  const when = tx.occurredAt ?? i.now;
  if (when.getTime() > i.quoteExpiresAt.getTime() + LATE_SLACK_MS) problems.push("sent after the price quote expired");
  if (when.getTime() < i.quoteCreatedAt.getTime() - EARLY_SLACK_MS) problems.push("sent before this quote existed");
  if (i.ambiguous) problems.push("amount also fits another open payment");

  if (problems.length) {
    return { action: "review", note: `needs review: ${problems.join(", ")}`, verifiedClean: false };
  }
  if (i.mode === "automatic" && i.autoVerificationEnabled) {
    return { action: "approve", note: "verified on-chain, amount and timing match" };
  }
  return { action: "review", note: "verified on-chain and clean; awaiting admin approval", verifiedClean: true };
}
