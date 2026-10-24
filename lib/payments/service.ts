import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { ASSET_DECIMALS, decimalToUnits, unitsToDecimal, usdStringToCents, usdToUnits, type Asset } from "@/lib/crypto/money";
import { isSupported, normalizeTxHash } from "@/lib/crypto/chains";
import { getUsdRate } from "@/lib/crypto/rates";
import { verifyOnChain } from "@/lib/crypto/verify";
import { decide, type ChainTx } from "./decision";
import { newDownloadToken } from "@/lib/downloads";
import { sendEmail, templates } from "@/lib/email/send";
import { HttpError } from "@/lib/http";

type Sb = SupabaseClient<any, "public", any>;

const SUBMIT_GRACE_MS = 30 * 60 * 1000;
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// ------------------------------------------------------------------ helpers
async function getSettings(sb: Sb) {
  const [{ data: s }, { data: flags }] = await Promise.all([
    sb.from("platform_settings").select("verification_mode, required_confirmations").single(),
    sb.from("feature_flags").select("key, enabled"),
  ]);
  const flag = (k: string) => flags?.find((f: any) => f.key === k)?.enabled ?? false;
  return {
    mode: (s?.verification_mode ?? "hybrid") as "automatic" | "hybrid" | "manual",
    requiredConfirmations: s?.required_confirmations ?? 1,
    cryptoEnabled: flag("crypto_payments"),
    autoEnabled: flag("auto_verification"),
  };
}

const PAYMENT_SELECT =
  "id, public_id, order_id, wallet_id, address_snap, asset, network, status, created_at, " +
  "orders!inner(id, public_id, customer_id, total_usd), payment_quotes(amount_crypto, expires_at, created_at)";

async function loadPayment(sb: Sb, by: { publicId?: string; id?: string }) {
  let q = sb.from("payments").select(PAYMENT_SELECT);
  q = by.id ? q.eq("id", by.id) : q.eq("public_id", by.publicId!);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "payment_not_found", "Payment not found.");
  const p: any = data;
  return { ...p, order: p.orders, quote: p.payment_quotes[0] } as any;
}

async function advance(sb: Sb, paymentId: string, steps: string[], actor: string | null, note: string) {
  for (const to of steps) {
    const { error } = await sb.rpc("transition_payment", { p_payment: paymentId, p_to: to, p_actor: actor, p_note: note });
    if (error) throw new Error(`transition to ${to} failed: ${error.message}`);
  }
}

async function customerOf(sb: Sb, customerId: string) {
  const { data } = await sb.from("profiles").select("id, full_name, email").eq("id", customerId).single();
  return data as { id: string; full_name: string; email: string };
}

async function notifyAdmin(sb: Sb, payId: string, note: string) {
  const { data: role } = await sb.from("user_roles").select("user_id").eq("role", "admin").maybeSingle();
  let to: string | null = null;
  if (role) { const { data: p } = await sb.from("profiles").select("email").eq("id", role.user_id).maybeSingle(); to = p?.email ?? null; }
  if (!to) { const { data: st } = await sb.from("store_settings").select("contact_email").maybeSingle(); to = st?.contact_email ?? null; }
  if (!to) return;
  const t = templates.reviewNeeded(payId, note);
  await sendEmail({ to, subject: t.subject, html: t.html, template: "admin_review_needed" });
}

// ------------------------------------------------------------ checkout steps
export async function createCheckoutOrder(userId: string, productIds: string[]) {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("create_order", { p_customer: userId, p_product_ids: productIds });
  if (error) {
    const map: Record<string, [number, string]> = {
      store_closed: [503, "The store is currently unavailable."],
      invalid_cart: [400, "Your cart is empty or too large."],
      duplicate_product: [400, "A product appears twice in your cart."],
      product_unavailable: [409, "One or more products are no longer available."],
      free_not_supported: [400, "This order has no payable amount."],
    };
    const hit = Object.entries(map).find(([k]) => error.message.includes(k));
    if (hit) throw new HttpError(hit[1][0], hit[0], hit[1][1]);
    throw error;
  }
  const { data: o } = await sb.from("orders").select("public_id, total_usd").eq("id", data).single();
  return { orderId: o!.public_id as string, totalUsd: o!.total_usd as string };
}

/** Methods the customer may choose from. Addresses are NOT exposed here. */
export async function listPaymentMethods() {
  const sb = createServiceClient();
  const { data } = await sb.from("payment_wallets").select("id, asset, network, label").eq("is_active", true);
  return (data ?? []).filter((w: any) => isSupported(w.asset, w.network));
}

export async function createPaymentQuote(userId: string, orderPublicId: string, walletId: string) {
  const sb = createServiceClient();
  const settings = await getSettings(sb);
  if (!settings.cryptoEnabled) throw new HttpError(503, "payments_disabled", "Crypto payments are temporarily disabled.");

  const { data: order } = await sb.from("orders").select("id, customer_id, total_usd, status").eq("public_id", orderPublicId).maybeSingle();
  if (!order || order.customer_id !== userId) throw new HttpError(404, "order_not_found", "Order not found.");

  const { data: wallet } = await sb.from("payment_wallets").select("id, asset, network, is_active").eq("id", walletId).maybeSingle();
  if (!wallet?.is_active || !isSupported(wallet.asset, wallet.network)) {
    throw new HttpError(400, "wallet_unavailable", "That payment method isn't available.");
  }

  let rate: number;
  try { rate = await getUsdRate(wallet.asset as Asset); }
  catch { throw new HttpError(503, "rate_unavailable", "We can't price that coin right now. Please try again in a minute."); }

  const decimals = ASSET_DECIMALS[wallet.asset as Asset];
  const units = usdToUnits(usdStringToCents(String(order.total_usd)), rate, decimals);

  const { data, error } = await sb.rpc("create_payment", {
    p_order: order.id, p_customer: userId, p_wallet: wallet.id,
    p_rate: rate, p_amount_crypto: unitsToDecimal(units, decimals, false),
  });
  if (error) {
    if (error.message.includes("payment_in_progress")) throw new HttpError(409, "payment_in_progress", "A payment for this order is already being processed.");
    if (error.message.includes("order_not_payable")) throw new HttpError(409, "order_not_payable", "This order can no longer be paid.");
    if (error.message.includes("store_closed")) throw new HttpError(503, "store_closed", "The store is currently unavailable.");
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { paymentId: row.public_id as string, expiresAt: row.expires_at as string };
}

// --------------------------------------------------- verification & decisions
async function isAmbiguous(sb: Sb, p: any, amountUnits: bigint): Promise<boolean> {
  const { data } = await sb.from("payments")
    .select("id, asset, payment_quotes(amount_crypto)")
    .eq("wallet_id", p.wallet_id).in("status", ["awaiting_payment", "payment_detected"]).neq("id", p.id);
  const decimals = ASSET_DECIMALS[p.asset as Asset];
  return (data ?? []).some((o: any) => {
    const q = o.payment_quotes?.[0];
    if (!q) return false;
    const exp = decimalToUnits(String(q.amount_crypto), decimals);
    return amountUnits >= exp && amountUnits * 100n <= exp * 101n;
  });
}

async function recordTx(sb: Sb, p: any, hash: string, chain: Extract<ChainTx, { state: "ok" }> | null) {
  const decimals = ASSET_DECIMALS[p.asset as Asset];
  const row = {
    payment_id: p.id, network: p.network, tx_hash: hash,
    amount_crypto: unitsToDecimal(chain?.amountUnits ?? 0n, decimals, false),
    confirmations: chain?.confirmations ?? 0,
  };
  const { error } = await sb.from("blockchain_transactions").insert(row);
  if (!error) return { duplicateOfOther: false };
  if (error.code !== "23505") throw error;
  const { data: existing } = await sb.from("blockchain_transactions").select("id, payment_id").eq("network", p.network).eq("tx_hash", hash).single();
  if (existing && existing.payment_id === p.id) {
    await sb.from("blockchain_transactions").update({ confirmations: row.confirmations, amount_crypto: row.amount_crypto }).eq("id", existing.id);
    return { duplicateOfOther: false };
  }
  return { duplicateOfOther: true };
}

const toReview = (s: string) => (s === "awaiting_payment" ? ["payment_detected", "admin_review"] : ["admin_review"]);
const toApprove = (s: string) =>
  s === "awaiting_payment" ? ["payment_detected", "blockchain_verified", "approved"]
  : s === "payment_detected" ? ["blockchain_verified", "approved"] : ["approved"];

async function evaluate(sb: Sb, p: any, hash: string, trigger: "submit" | "cron") {
  const settings = await getSettings(sb);
  const customer = await customerOf(sb, p.order.customer_id);

  // MANUAL mode: no chain lookup at all; the admin checks the explorer themselves.
  if (settings.mode === "manual") {
    const dup = await recordTx(sb, p, hash, null);
    await advance(sb, p.id, toReview(p.status), null, dup.duplicateOfOther ? "manual mode: hash also claimed by another payment" : "manual mode: hash submitted for admin check");
    await notifyAdmin(sb, p.public_id, "a customer submitted a transaction hash (manual verification mode).");
    return { status: "admin_review" };
  }

  let chain: ChainTx;
  try {
    chain = await verifyOnChain({ asset: p.asset, network: p.network, txHash: hash, wallet: p.address_snap });
  } catch (e) {
    console.error("[verify]", p.public_id, e);
    if (trigger === "submit") throw new HttpError(503, "chain_unreachable", "We couldn't reach the network to check that transaction. Please try again shortly.");
    return { status: p.status };
  }

  const decimals = ASSET_DECIMALS[p.asset as Asset];
  const expectedUnits = decimalToUnits(String(p.quote.amount_crypto), decimals);
  const ambiguous = chain.state === "ok" ? await isAmbiguous(sb, p, chain.amountUnits) : false;

  const d = decide({
    mode: settings.mode, autoVerificationEnabled: settings.autoEnabled, tx: chain, expectedUnits,
    requiredConfirmations: settings.requiredConfirmations,
    quoteCreatedAt: new Date(p.quote.created_at), quoteExpiresAt: new Date(p.quote.expires_at),
    ambiguous, now: new Date(),
  });

  if (d.action === "not_found") {
    if (trigger === "submit") throw new HttpError(404, "tx_not_found", "We can't see that transaction yet. If you just sent it, wait a minute and try again.");
    return { status: p.status };
  }
  if (d.action === "reject_submission") {
    if (trigger === "submit") throw new HttpError(422, "tx_rejected", `${d.note}. Check the hash and the network, or contact support.`);
    await advance(sb, p.id, toReview(p.status), null, `previously seen tx no longer verifies: ${d.note}`);
    await notifyAdmin(sb, p.public_id, d.note);
    return { status: "admin_review" };
  }

  // from here chain.state === "ok"
  const dup = await recordTx(sb, p, hash, chain as Extract<ChainTx, { state: "ok" }>);
  if (dup.duplicateOfOther) {
    await advance(sb, p.id, toReview(p.status), null, "this transaction hash is already attached to another payment");
    await notifyAdmin(sb, p.public_id, "this transaction hash is already attached to another payment.");
    return { status: "admin_review" };
  }

  if (d.action === "wait") {
    if (p.status === "awaiting_payment") {
      await advance(sb, p.id, ["payment_detected"], null, d.note);
      const t = templates.paymentDetected(customer.full_name, p.public_id);
      await sendEmail({ to: customer.email, subject: t.subject, html: t.html, template: "payment_detected", recipientId: customer.id });
    }
    return { status: "payment_detected" };
  }
  if (d.action === "review") {
    await advance(sb, p.id, toReview(p.status), null, d.note);
    await notifyAdmin(sb, p.public_id, d.note);
    return { status: "admin_review" };
  }
  await advance(sb, p.id, toApprove(p.status), null, d.note);
  await fulfillPayment(sb, p.id);
  return { status: "approved" };
}

export async function submitTransaction(userId: string, paymentPublicId: string, rawHash: string) {
  const sb = createServiceClient();
  const p = await loadPayment(sb, { publicId: paymentPublicId });
  if (p.order.customer_id !== userId) throw new HttpError(404, "payment_not_found", "Payment not found.");

  const hash = normalizeTxHash(p.network, rawHash);
  if (!hash) throw new HttpError(400, "bad_hash", "That doesn't look like a valid transaction hash for this network.");

  if (p.status !== "awaiting_payment") return { status: p.status as string, alreadySubmitted: true };
  if (Date.now() > new Date(p.quote.expires_at).getTime() + SUBMIT_GRACE_MS) {
    throw new HttpError(410, "quote_expired", "This quote has expired. If you already sent funds, contact support with your transaction hash.");
  }
  const result = await evaluate(sb, p, hash, "submit");
  return { ...result, alreadySubmitted: false };
}

// ------------------------------------------------------------- fulfillment
export async function fulfillPayment(sb: Sb, paymentId: string) {
  const p = await loadPayment(sb, { id: paymentId });
  if (p.status !== "approved") return false;

  const { data: items } = await sb.from("order_items")
    .select("id, product_name_snap, products(download_limit, link_expiry_hours)").eq("order_id", p.order_id);
  if (!items?.length) return false;

  const links: { product: string; url: string; note: string }[] = [];
  for (const it of items as any[]) {
    const { token, hash } = newDownloadToken();
    const hours: number | null = it.products?.link_expiry_hours ?? null;
    const limit: number | null = it.products?.download_limit ?? null;
    const { error } = await sb.from("download_grants").upsert({
      order_item_id: it.id, token_hash: hash, max_downloads: limit,
      expires_at: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
    }, { onConflict: "order_item_id" });
    if (error) throw error;
    links.push({
      product: it.product_name_snap, url: `${SITE()}/download/${token}`,
      note: [limit ? `${limit} download${limit > 1 ? "s" : ""}` : "Unlimited downloads", hours ? `link valid for ${hours} hours` : "link does not expire"].join(" · "),
    });
  }

  const customer = await customerOf(sb, p.order.customer_id);
  const t = templates.downloadReady(customer.full_name, p.order.public_id, links);
  const sent = await sendEmail({ to: customer.email, subject: t.subject, html: t.html, template: "download_ready", recipientId: customer.id, critical: true });
  if (!sent) return false; // stays 'approved'; the cron retries and rotates the links

  await advance(sb, paymentId, ["fulfilled"], null, "download links emailed");
  return true;
}

// ---------------------------------------------------------- admin decisions
export async function adminDecision(actorId: string, paymentPublicId: string, decision: "approve" | "reject", note: string) {
  const sb = createServiceClient();
  const p = await loadPayment(sb, { publicId: paymentPublicId });
  if (p.status !== "admin_review") throw new HttpError(409, "not_in_review", "This payment is not awaiting review.");

  if (decision === "reject") {
    await advance(sb, p.id, ["rejected"], actorId, note || "rejected by admin");
    const c = await customerOf(sb, p.order.customer_id);
    const t = templates.paymentRejected(c.full_name, p.public_id, note);
    await sendEmail({ to: c.email, subject: t.subject, html: t.html, template: "payment_rejected", recipientId: c.id });
    return { status: "rejected" };
  }
  await advance(sb, p.id, ["approved"], actorId, note || "approved by admin");
  const delivered = await fulfillPayment(sb, p.id);
  return { status: delivered ? "fulfilled" : "approved" };
}

// --------------------------------------------------------------------- cron
export async function runMaintenance() {
  const sb = createServiceClient();
  const out = { expired: 0, rechecked: 0, retriedFulfillment: 0, escalated: 0, reminded: 0 };

  // 1. expire unpaid quotes (and tell the customer)
  const cutoff = new Date(Date.now() - SUBMIT_GRACE_MS).toISOString();
  const { data: due } = await sb.from("payments")
    .select("id, public_id, orders!inner(customer_id), payment_quotes!inner(expires_at)")
    .eq("status", "awaiting_payment").lt("payment_quotes.expires_at", cutoff);
  const { data: n } = await sb.rpc("expire_stale_payments");
  out.expired = Number(n ?? 0);
  for (const row of (due ?? []) as any[]) {
    const c = await customerOf(sb, row.orders.customer_id);
    const t = templates.paymentExpired(c.full_name, row.public_id);
    await sendEmail({ to: c.email, subject: t.subject, html: t.html, template: "payment_expired", recipientId: c.id });
  }

  // 2. re-check payments that were seen but not yet confirmed
  const { data: seen } = await sb.from("payments").select("id, created_at").eq("status", "payment_detected");
  for (const row of (seen ?? []) as any[]) {
    const { data: tx } = await sb.from("blockchain_transactions").select("tx_hash").eq("payment_id", row.id).order("detected_at", { ascending: false }).limit(1).maybeSingle();
    if (!tx) continue;
    const p = await loadPayment(sb, { id: row.id });
    try {
      const r = await evaluate(sb, p, tx.tx_hash, "cron");
      out.rechecked++;
      if (r.status === "payment_detected" && Date.now() - new Date(row.created_at).getTime() > 24 * 3600_000) {
        await advance(sb, p.id, ["admin_review"], null, "still unconfirmed after 24h");
        await notifyAdmin(sb, p.public_id, "still unconfirmed after 24 hours.");
        out.escalated++;
      }
    } catch (e) { console.error("[cron recheck]", row.id, e); }
  }

  // 3. approved but not delivered (e.g. email provider was down)
  const { data: stuck } = await sb.from("payments").select("id").eq("status", "approved");
  for (const row of (stuck ?? []) as any[]) {
    try { if (await fulfillPayment(sb, row.id)) out.retriedFulfillment++; } catch (e) { console.error("[cron fulfil]", row.id, e); }
  }

  // 4. renewal reminder to the developer (at most one email a day)
  try { out.reminded = await remindDeveloper(sb); } catch (e) { console.error("[cron remind]", e); }

  // 5. heartbeat: lets the developer console show whether these jobs are actually running
  await sb.from("platform_settings").update({ last_cron_at: new Date().toISOString() }).eq("id", true);
  return out;
}

async function remindDeveloper(sb: Sb): Promise<number> {
  const { data: sub } = await sb.from("platform_subscription").select("expires_at, grace_days").maybeSingle();
  if (!sub) return 0;
  const daysLeft = Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 7) return 0;

  const { data: role } = await sb.from("user_roles").select("user_id").eq("role", "developer").maybeSingle();
  if (!role) return 0;
  const { data: dev } = await sb.from("profiles").select("id, email").eq("id", role.user_id).maybeSingle();
  if (!dev) return 0;

  const since = new Date(Date.now() - 23 * 3600_000).toISOString();
  const { count } = await sb.from("email_events").select("id", { count: "exact", head: true })
    .eq("template", "dev_subscription_due").eq("status", "sent").eq("recipient_id", dev.id).gte("created_at", since);
  if ((count ?? 0) > 0) return 0;

  const graceEnds = new Date(new Date(sub.expires_at).getTime() + sub.grace_days * 86_400_000);
  const t = templates.subscriptionDue(daysLeft, new Date(sub.expires_at), graceEnds);
  const ok = await sendEmail({ to: dev.email, subject: t.subject, html: t.html, template: "dev_subscription_due", recipientId: dev.id, critical: true });
  return ok ? 1 : 0;
}
