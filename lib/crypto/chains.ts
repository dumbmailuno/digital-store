import type { Asset } from "./money";

export type Network = "bitcoin" | "ethereum" | "tron" | "solana" | "bsc" | "polygon";

/**
 * Only combinations that have a verified on-chain adapter can be sold.
 * Anything else is refused at checkout rather than silently trusted.
 */
const SUPPORTED = new Set(["BTC:bitcoin", "ETH:ethereum", "USDT:ethereum", "USDT:tron", "SOL:solana"]);

export const isSupported = (asset: string, network: string) => SUPPORTED.has(`${asset}:${network}`);

export const COINGECKO_ID: Record<Asset, string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", SOL: "solana",
};

export const USDT_ETHEREUM = "0xdac17f958d2ee523a2206206994597c13d831ec7";
export const USDT_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const HASH_FORMATS: Record<string, RegExp> = {
  bitcoin: /^[0-9a-fA-F]{64}$/,
  ethereum: /^0x[0-9a-fA-F]{64}$/,
  tron: /^[0-9a-fA-F]{64}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{80,90}$/,
};

/** Returns the canonical form of a tx hash, or null if it is malformed. */
export function normalizeTxHash(network: string, raw: string): string | null {
  const s = raw.trim();
  const re = HASH_FORMATS[network];
  if (!re || !re.test(s)) return null;
  return network === "solana" ? s : s.toLowerCase();
}

export const NETWORK_LABEL: Record<string, string> = {
  bitcoin: "Bitcoin", ethereum: "Ethereum (ERC-20)", tron: "TRON (TRC-20)", solana: "Solana",
};

/** Block-explorer link for a transaction. The hash is URL-encoded; the host is fixed. */
export function explorerUrl(network: string, hash: string): string | null {
  const h = encodeURIComponent(hash);
  switch (network) {
    case "bitcoin": return `https://mempool.space/tx/${h}`;
    case "ethereum": return `https://etherscan.io/tx/${h}`;
    case "tron": return `https://tronscan.org/#/transaction/${h}`;
    case "solana": return `https://solscan.io/tx/${h}`;
    default: return null;
  }
}
