import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentPanel } from "@/components/payments/payment-panel";
import type { Asset } from "@/lib/crypto/money";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: { id: string } }) {
  if (!/^PAY-[0-9A-F]{6}$/.test(params.id)) notFound();
  // Runs as the signed-in user: RLS guarantees they can only load their own payment.
  const supabase = createClient();
  const { data } = await supabase.from("payments")
    .select("public_id, status, asset, network, address_snap, payment_quotes(amount_crypto, expires_at), orders(public_id, total_usd)")
    .eq("public_id", params.id).maybeSingle();
  const p: any = data;
  if (!p?.payment_quotes?.[0] || !p.orders) notFound();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <PaymentPanel
        paymentId={p.public_id} orderId={p.orders.public_id} status={p.status}
        asset={p.asset as Asset} network={p.network} address={p.address_snap}
        amountCrypto={String(p.payment_quotes[0].amount_crypto)} totalUsd={String(p.orders.total_usd)}
        expiresAt={p.payment_quotes[0].expires_at}
      />
    </main>
  );
}
