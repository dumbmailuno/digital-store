export const PAYMENT_LABEL: Record<string, string> = {
  created: "Created", awaiting_payment: "Awaiting payment", payment_detected: "Payment detected",
  blockchain_verified: "Verified on-chain", admin_review: "Needs review", approved: "Approved",
  fulfilled: "Delivered", rejected: "Rejected", expired: "Expired",
};

export const ORDER_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment", paid: "Paid", fulfilled: "Delivered", cancelled: "Cancelled", expired: "Expired",
};

/** Status colour + a text label always travel together (never colour alone). */
export const TONE: Record<string, string> = {
  approved: "text-ok", fulfilled: "text-ok", paid: "text-ok", blockchain_verified: "text-ok",
  admin_review: "text-warn", payment_detected: "text-warn", awaiting_payment: "text-warn", pending_payment: "text-warn", created: "text-ink-soft",
  rejected: "text-bad", expired: "text-ink-mute", cancelled: "text-ink-mute",
};

export const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
