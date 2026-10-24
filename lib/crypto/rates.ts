import "server-only";
import { COINGECKO_ID } from "./chains";
import type { Asset } from "./money";
import { requestJson } from "./http";

const TTL_MS = 60_000;
const cache = new Map<Asset, { rate: number; at: number }>();

/**
 * USD price of one whole coin. Fails CLOSED: if the price source is down or
 * returns something implausible, checkout is refused rather than mispriced.
 */
export async function getUsdRate(asset: Asset): Promise<number> {
  const hit = cache.get(asset);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;

  const id = COINGECKO_ID[asset];
  const key = process.env.COINGECKO_API_KEY;
  const { status, body } = await requestJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { headers: key ? { "x-cg-demo-api-key": key } : {} },
  );
  const rate = body?.[id]?.usd;
  if (status !== 200 || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("rate_unavailable");
  }
  // a stablecoin far from $1 means a depeg or bad data: do not sell against it
  if (asset === "USDT" && (rate < 0.95 || rate > 1.05)) throw new Error("rate_unreasonable");

  cache.set(asset, { rate, at: Date.now() });
  return rate;
}
