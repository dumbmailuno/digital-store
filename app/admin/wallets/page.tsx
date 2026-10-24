import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { WalletManager } from "@/components/admin/wallet-manager";

export const metadata: Metadata = { title: "Wallets" };

export default async function Wallets() {
  const supabase = createClient();
  const { data } = await supabase.from("payment_wallets").select("id, asset, network, address, label, is_active").order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Payout wallets</h1>
      <p className="text-sm text-ink-soft">These are the addresses customers pay to. Double-check every address: crypto sent to a wrong address cannot be recovered.</p>
      <WalletManager wallets={(data ?? []) as any} />
    </div>
  );
}
