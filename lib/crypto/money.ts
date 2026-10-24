// Money is NEVER handled as floating point. Everything is integer "units"
// (satoshi, wei, 1e-6 USDT, lamport) held in BigInt.

export const ASSET_DECIMALS = { BTC: 8, ETH: 18, USDT: 6, SOL: 9 } as const;
export type Asset = keyof typeof ASSET_DECIMALS;

const RATE_SCALE = 8n; // rates are converted to integers with 8 decimal places

/** "29.99" -> 2999n. Rejects anything that is not a plain non-negative decimal. */
export function usdStringToCents(s: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`bad usd amount: ${s}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

/**
 * USD cents -> smallest crypto units, rounded UP so the customer never
 * under-pays by a rounding error.
 */
export function usdToUnits(usdCents: bigint, rateUsd: number, decimals: number): bigint {
  const scaled = Math.round(rateUsd * 1e8);
  if (!Number.isFinite(rateUsd) || rateUsd <= 0 || !Number.isSafeInteger(scaled) || scaled <= 0) {
    throw new Error("invalid rate");
  }
  const num = usdCents * 10n ** RATE_SCALE * 10n ** BigInt(decimals);
  const den = 100n * BigInt(scaled);
  return (num + den - 1n) / den;
}

/** 50000n, 8 -> "0.0005" (trailing zeros trimmed) or exact-width when trim=false */
export function unitsToDecimal(units: bigint, decimals: number, trim = true): string {
  if (units < 0n) throw new Error("negative units");
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals);
  const out = decimals === 0 ? whole : `${whole}.${frac}`;
  if (!trim || decimals === 0) return out;
  return out.replace(/\.?0+$/, "") || "0";
}

/** "0.0005", 8 -> 50000n. Tolerates trailing zeros beyond `decimals` (Postgres numeric padding). */
export function decimalToUnits(s: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`bad decimal: ${s}`);
  const [whole, rawFrac = ""] = s.split(".");
  const frac = rawFrac.replace(/0+$/, "");
  if (frac.length > decimals) throw new Error("too many decimal places");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}
