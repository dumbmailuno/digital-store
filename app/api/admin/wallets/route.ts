import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOriginJson, handleError, HttpError, readJson, requireAdmin } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { isSupported } from "@/lib/crypto/chains";
import { validateAddress } from "@/lib/crypto/address";

const body = z.object({
  asset: z.enum(["BTC", "ETH", "USDT", "SOL"]),
  network: z.enum(["bitcoin", "ethereum", "tron", "solana"]),
  address: z.string().trim().min(10).max(120),
  label: z.string().trim().max(60).optional(),
});

/**
 * Adds a payout wallet. The address is checksum-validated here (a typo would send
 * customers' money to a stranger). The insert runs as the signed-in user, so
 * row-level security still decides who may add wallets (store admin only).
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOriginJson(req);
    const { user, supabase } = await requireAdmin();
    await rateLimit("admin-wallet", user.id, 20, 600);
    const parsed = body.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", "Choose a coin and network and enter an address.");
    const { asset, network, address, label } = parsed.data;
    if (!isSupported(asset, network)) throw new HttpError(400, "unsupported", `${asset} on ${network} isn't supported yet.`);

    const check = validateAddress(network, address);
    if (!check.ok) throw new HttpError(422, "bad_address", check.reason);

    const { data, error } = await supabase.from("payment_wallets")
      .insert({ asset, network, address: check.address, label: label || null }).select("id").single();
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "duplicate", "That wallet is already in your list.");
      if (error.code === "42501" || /row-level security/i.test(error.message)) throw new HttpError(403, "forbidden", "Only the store admin can change wallets, and only while the store is active.");
      throw error;
    }
    return NextResponse.json({ id: data.id, address: check.address, warning: check.warning ?? null }, { status: 201 });
  } catch (e) { return handleError(e); }
}
