export type Sub = {
  status: string; expires_at: string; grace_days: number; maintenance_forced: boolean;
  monthly_fee_usd: string | number; note: string | null;
};
export type StoreState = "online" | "warning" | "grace" | "offline";

/** Mirrors the database's store_is_open(): the page and the rule can never disagree. */
export function deriveState(s: Sub, now = Date.now()): { state: StoreState; reason: string; daysLeft: number; graceEnds: Date } {
  const exp = new Date(s.expires_at).getTime();
  const graceEnds = new Date(exp + s.grace_days * 86_400_000);
  const daysLeft = Math.ceil((exp - now) / 86_400_000);
  const closedByStatus = !["active", "warning"].includes(s.status);
  if (s.maintenance_forced) return { state: "offline", reason: "Maintenance mode is switched on", daysLeft, graceEnds };
  if (closedByStatus) return { state: "offline", reason: `Status is "${s.status}"`, daysLeft, graceEnds };
  if (now > graceEnds.getTime()) return { state: "offline", reason: "Subscription expired and the grace period has ended", daysLeft, graceEnds };
  if (now > exp) return { state: "grace", reason: "Expired, running on the grace period", daysLeft, graceEnds };
  if (daysLeft <= 7) return { state: "warning", reason: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, daysLeft, graceEnds };
  return { state: "online", reason: "Active", daysLeft, graceEnds };
}
