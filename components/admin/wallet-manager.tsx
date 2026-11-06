"use client";

import { Guard } from "@/components/admin/read-only";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { validateAddress } from "@/lib/crypto/address";
import { NETWORK_LABEL } from "@/lib/crypto/chains";

type Wallet = { id: string; asset: string; network: string; address: string; label: string | null; is_active: boolean };
const COMBOS = [
  { asset: "BTC", network: "bitcoin" }, { asset: "ETH", network: "ethereum" },
  { asset: "USDT", network: "ethereum" }, { asset: "USDT", network: "tron" }, { asset: "SOL", network: "solana" },
] as const;

export function WalletManager({ wallets }: { wallets: Wallet[] }) {
  const router = useRouter();
  const toast = useToast();
  const [combo, setCombo] = useState(0);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = COMBOS[combo];

  const check = useMemo(() => (address.trim() ? validateAddress(c.network, address) : null), [address, c.network]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !check?.ok || !confirmed) return;
    setBusy(true);
    const res = await fetch("/api/admin/wallets", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset: c.asset, network: c.network, address: address.trim(), label: label.trim() || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast("error", json?.error?.message ?? "Couldn't add the wallet."); return; }
    toast("success", "Wallet added");
    setAddress(""); setLabel(""); setConfirmed(false); router.refresh();
  }

  async function toggle(w: Wallet) {
    const { error } = await createClient().from("payment_wallets").update({ is_active: !w.is_active }).eq("id", w.id);
    if (error) { toast("error", "Couldn't update that wallet."); return; }
    toast("success", w.is_active ? "Wallet deactivated. Customers can no longer choose it." : "Wallet activated");
    router.refresh();
  }

  const group = (addr: string) => addr.replace(/(.{6})/g, "$1 ").trim();

  return (
    <Guard>
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Your payout wallets</h2>
        {wallets.length === 0 ? <div className="card text-sm text-ink-soft">No wallets yet. Customers can't pay until you add one.</div> : (
          <ul className="space-y-3">
            {wallets.map((w) => (
              <li key={w.id} className="card flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{w.asset} <span className="font-normal text-ink-soft">on {NETWORK_LABEL[w.network] ?? w.network}</span>{w.label ? <span className="ml-2 text-ink-mute">· {w.label}</span> : null}</p>
                  <p className="mt-1 break-all font-mono text-xs">{w.address}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${w.is_active ? "text-ok" : "text-ink-mute"}`}>{w.is_active ? "Active" : "Inactive"}</span>
                  <button className="btn btn-ghost min-h-[36px] px-3" onClick={() => toggle(w)}>{w.is_active ? "Deactivate" : "Activate"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-mute">An address can't be edited once added: to change where money goes, add the new wallet and deactivate the old one. Past payments keep pointing at the address the customer was shown.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Add a wallet</h2>
        <form onSubmit={add} noValidate className="card space-y-3">
          <div>
            <label htmlFor="combo" className="mb-1 block text-sm font-medium">Coin and network</label>
            <select id="combo" className="input" value={combo} onChange={(e) => { setCombo(Number(e.target.value)); setConfirmed(false); }}>
              {COMBOS.map((x, i) => <option key={i} value={i}>{x.asset} on {NETWORK_LABEL[x.network]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="addr" className="mb-1 block text-sm font-medium">Receiving address</label>
            <input id="addr" value={address} onChange={(e) => { setAddress(e.target.value); setConfirmed(false); }} autoComplete="off" spellCheck={false}
              aria-invalid={!!address && check?.ok === false} className={`input font-mono ${address && (check?.ok ? "border-ok" : "border-bad")}`} />
            <p className="mt-1 min-h-[1.25rem] text-xs" role={check && !check.ok ? "alert" : undefined}>
              {check?.ok === false && <span className="text-bad">{check.reason}</span>}
              {check?.ok && <span className="text-ok">✓ Checksum valid</span>}
              {check?.ok && check.warning && <span className="mt-1 block text-warn">{check.warning}</span>}
            </p>
            {check?.ok && <p className="mt-1 break-all rounded-2xl border border-paper-line bg-paper-dim p-2 font-mono text-xs">{group(check.address)}</p>}
          </div>
          <div>
            <label htmlFor="lbl" className="mb-1 block text-sm font-medium">Label <span className="font-normal text-ink-mute">(optional, only you see it)</span></label>
            <input id="lbl" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className="input" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} disabled={!check?.ok} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I copied this address from my own wallet, compared it character by character, and I control it. I understand customers will send real money here.</span>
          </label>
          <button className="btn" disabled={busy || !check?.ok || !confirmed}>{busy ? "Adding…" : "Add wallet"}</button>
        </form>
      </section>
    </div>
    </Guard>
  );
}
