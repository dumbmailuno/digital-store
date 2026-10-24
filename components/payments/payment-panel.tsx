"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ASSET_DECIMALS, decimalToUnits, unitsToDecimal, type Asset } from "@/lib/crypto/money";
import { NETWORK_LABEL } from "@/lib/crypto/chains";

type Props = {
  paymentId: string; orderId: string; status: string; asset: Asset; network: string;
  address: string; amountCrypto: string; totalUsd: string; expiresAt: string;
};

const LIVE = ["awaiting_payment", "payment_detected", "blockchain_verified", "admin_review", "approved"];

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  awaiting_payment: { title: "Waiting for your payment", body: "Send the exact amount below, then paste your transaction hash." },
  payment_detected: { title: "Payment detected", body: "We can see your transaction and are waiting for network confirmations. This page updates by itself." },
  blockchain_verified: { title: "Verifying", body: "Your transaction is confirmed on-chain. Finalising now." },
  admin_review: { title: "Under review", body: "We're reviewing your payment. You'll get an email as soon as it's decided." },
  approved: { title: "Payment approved", body: "We're preparing your download email." },
  fulfilled: { title: "All done", body: "Your download links have been emailed to you. Check your inbox (and spam folder)." },
  rejected: { title: "Payment not approved", body: "This payment couldn't be approved. Check your email for details. All sales are final." },
  expired: { title: "Quote expired", body: "The price quote expired before we saw a payment. Go back to your order to start a new one." },
};

function useCountdown(iso: string) {
  const [left, setLeft] = useState(() => new Date(iso).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(iso).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return Math.max(0, left);
}

function Copy({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn btn-ghost min-h-[36px] px-3"
      onClick={async () => { try { await navigator.clipboard.writeText(value); toast("success", `${label} copied`); } catch { toast("error", "Couldn't copy. Select it manually."); } }}>
      Copy
    </button>
  );
}

export function PaymentPanel(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = useCountdown(p.expiresAt);
  const copy = STATUS_COPY[p.status] ?? STATUS_COPY.awaiting_payment;
  const amount = unitsToDecimal(decimalToUnits(p.amountCrypto, ASSET_DECIMALS[p.asset]), ASSET_DECIMALS[p.asset]);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  // poll while a payment is in flight so the page moves on without a manual refresh
  useEffect(() => {
    if (!LIVE.includes(p.status) || p.status === "awaiting_payment") return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [p.status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (hash.trim().length < 40) { setErr("Paste the full transaction hash (it's a long string of letters and numbers)."); return; }
    setErr(null); setBusy(true);
    const res = await fetch(`/api/payments/${p.paymentId}/tx`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: hash.trim() }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json?.error?.message ?? "Something went wrong. Please try again."); return; }
    toast("success", "Transaction submitted. We're checking it now.");
    router.refresh();
  }

  const awaiting = p.status === "awaiting_payment";
  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-xs text-ink-mute">Payment {p.paymentId} · Order {p.orderId}</p>
        <h1 className="mt-1 text-xl font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{copy.body}</p>
      </div>

      {awaiting && (
        <div className="card space-y-4">
          <div className="rounded border border-warn/40 bg-paper-dim p-3 text-sm">
            Send <b>only {p.asset}</b> on <b>{NETWORK_LABEL[p.network] ?? p.network}</b>. Funds sent on a different network are lost and cannot be recovered. All sales are final.
          </div>

          <div>
            <p className="text-xs text-ink-mute">Amount to send (≈ ${p.totalUsd} USD)</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="break-all font-mono text-lg">{amount} {p.asset}</p>
              <Copy value={amount} label="Amount" />
            </div>
            <p className="mt-1 text-xs text-ink-mute">Send at least this exact amount. If your exchange deducts a withdrawal fee, add it on top.</p>
          </div>

          <div>
            <p className="text-xs text-ink-mute">To this address</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="break-all font-mono text-sm">{p.address}</p>
              <Copy value={p.address} label="Address" />
            </div>
          </div>

          <p className={`text-sm ${left === 0 ? "text-bad" : "text-ink-soft"}`}>
            {left === 0 ? "Price quote expired. If you already sent funds, still submit your hash below." : <>Price locked for <span className="font-mono">{mm}:{ss}</span></>}
          </p>

          <form onSubmit={submit} noValidate className="space-y-2 border-t border-paper-line pt-4">
            <label htmlFor="tx" className="block text-sm font-medium">Transaction hash</label>
            <input id="tx" value={hash} onChange={(e) => { setHash(e.target.value); setErr(null); }}
              placeholder="Paste it here after you've sent the payment" autoComplete="off" spellCheck={false}
              aria-invalid={!!err} className={`input font-mono ${err ? "border-bad" : ""}`} />
            {err && <p role="alert" className="text-xs text-bad">{err}</p>}
            <button className="btn w-full" disabled={busy}>{busy ? "Checking the network…" : "I've paid, check my transaction"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
