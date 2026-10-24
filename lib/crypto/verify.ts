import "server-only";
import type { ChainTx } from "@/lib/payments/decision";
import { requestJson } from "./http";
import { tronAddressToHex } from "./base58";
import { USDT_ETHEREUM, USDT_TRON } from "./chains";

/**
 * Read-only chain lookups. Contract for every adapter:
 *  - returns a ChainTx describing what actually happened on-chain
 *  - THROWS on any infrastructure problem (timeout, 5xx, malformed reply).
 *    Callers treat a throw as "could not check", which never approves and never rejects.
 */
export type VerifyArgs = { asset: string; network: string; txHash: string; wallet: string };

export async function verifyOnChain(a: VerifyArgs): Promise<ChainTx> {
  const k = `${a.asset}:${a.network}`;
  switch (k) {
    case "BTC:bitcoin": return verifyBitcoin(a);
    case "ETH:ethereum": return verifyEthNative(a);
    case "USDT:ethereum": return verifyErc20(a, USDT_ETHEREUM);
    case "USDT:tron": return verifyTronUsdt(a);
    case "SOL:solana": return verifySolana(a);
    default: throw new Error(`no verifier for ${k}`);
  }
}

// ------------------------------------------------------------------ Bitcoin
async function verifyBitcoin({ txHash, wallet }: VerifyArgs): Promise<ChainTx> {
  const base = process.env.BTC_EXPLORER_URL || "https://mempool.space/api";
  const tx = await requestJson(`${base}/tx/${txHash}`);
  if (tx.status === 404) return { state: "not_found" };
  if (tx.status !== 200 || !Array.isArray(tx.body?.vout)) throw new Error("btc: bad reply");

  const sats = (tx.body.vout as any[])
    .filter((o) => o.scriptpubkey_address === wallet)
    .reduce((s, o) => s + BigInt(o.value), 0n);

  let confirmations = 0;
  let occurredAt: Date | null = null;
  if (tx.body.status?.confirmed) {
    const tip = await requestJson(`${base}/blocks/tip/height`);
    if (tip.status !== 200 || typeof tip.body !== "number") throw new Error("btc: no tip");
    confirmations = tip.body - tx.body.status.block_height + 1;
    occurredAt = new Date(tx.body.status.block_time * 1000);
  }
  return { state: "ok", recipientOk: sats > 0n, amountUnits: sats, confirmations, occurredAt };
}

// ----------------------------------------------------------------- Ethereum
const ETH_RPC = () => process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function evmRpc(method: string, params: unknown[]): Promise<any> {
  const r = await requestJson(ETH_RPC(), { method: "POST", body: { jsonrpc: "2.0", id: 1, method, params } });
  if (r.status !== 200 || r.body?.error) throw new Error(`eth rpc ${method} failed`);
  return r.body.result;
}

async function evmFinality(blockHex: string): Promise<{ confirmations: number; occurredAt: Date }> {
  const [latest, block] = await Promise.all([evmRpc("eth_blockNumber", []), evmRpc("eth_getBlockByNumber", [blockHex, false])]);
  if (!block) throw new Error("eth: block missing");
  return {
    confirmations: Number(BigInt(latest) - BigInt(blockHex) + 1n),
    occurredAt: new Date(Number(BigInt(block.timestamp)) * 1000),
  };
}

async function verifyEthNative({ txHash, wallet }: VerifyArgs): Promise<ChainTx> {
  const tx = await evmRpc("eth_getTransactionByHash", [txHash]);
  if (!tx) return { state: "not_found" };
  if (!tx.blockNumber) return { state: "not_found" }; // still in the mempool
  const receipt = await evmRpc("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { state: "not_found" };
  if (receipt.status !== "0x1") return { state: "failed", reason: "reverted" };

  const toUs = typeof tx.to === "string" && tx.to.toLowerCase() === wallet.toLowerCase();
  const { confirmations, occurredAt } = await evmFinality(tx.blockNumber);
  return {
    state: "ok", recipientOk: toUs, amountUnits: toUs ? BigInt(tx.value) : 0n, confirmations, occurredAt,
  };
}

async function verifyErc20({ txHash, wallet }: VerifyArgs, contract: string): Promise<ChainTx> {
  const receipt = await evmRpc("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { state: "not_found" };
  if (receipt.status !== "0x1") return { state: "failed", reason: "reverted" };

  const me = wallet.toLowerCase().replace(/^0x/, "");
  let total = 0n;
  for (const log of receipt.logs as any[]) {
    if (String(log.address).toLowerCase() !== contract) continue;
    if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (String(log.topics[2]).toLowerCase().slice(-40) !== me) continue;
    total += BigInt(log.data);
  }
  const { confirmations, occurredAt } = await evmFinality(receipt.blockNumber);
  return { state: "ok", recipientOk: total > 0n, amountUnits: total, confirmations, occurredAt };
}

// --------------------------------------------------------------------- TRON
async function verifyTronUsdt({ txHash, wallet }: VerifyArgs): Promise<ChainTx> {
  const base = process.env.TRON_API_URL || "https://api.trongrid.io";
  const headers: Record<string, string> = process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {};

  const info = await requestJson(`${base}/wallet/gettransactioninfobyid`, { method: "POST", body: { value: txHash }, headers });
  if (info.status !== 200 || typeof info.body !== "object") throw new Error("tron: bad reply");
  if (!info.body.blockNumber) return { state: "not_found" };
  if (info.body.receipt?.result && info.body.receipt.result !== "SUCCESS") {
    return { state: "failed", reason: String(info.body.receipt.result) };
  }

  const ev = await requestJson(`${base}/v1/transactions/${txHash}/events`, { headers });
  if (ev.status !== 200 || !Array.isArray(ev.body?.data)) throw new Error("tron: no events");

  const me = tronAddressToHex(wallet);
  let total = 0n;
  for (const e of ev.body.data as any[]) {
    if (e.event_name !== "Transfer" || e.contract_address !== USDT_TRON) continue;
    const to = String(e.result?.to ?? "");
    const toHex = to.startsWith("T") ? tronAddressToHex(to) : to.replace(/^0x/, "").replace(/^41(?=[0-9a-f]{40}$)/i, "").toLowerCase();
    if (toHex === me) total += BigInt(e.result.value);
  }

  const now = await requestJson(`${base}/wallet/getnowblock`, { method: "POST", body: {}, headers });
  const head = now.body?.block_header?.raw_data?.number;
  if (typeof head !== "number") throw new Error("tron: no head");
  return {
    state: "ok", recipientOk: total > 0n, amountUnits: total,
    confirmations: head - info.body.blockNumber + 1,
    occurredAt: info.body.blockTimeStamp ? new Date(info.body.blockTimeStamp) : null,
  };
}

// ------------------------------------------------------------------- Solana
async function verifySolana({ txHash, wallet }: VerifyArgs): Promise<ChainTx> {
  const url = process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com";
  const r = await requestJson(url, {
    method: "POST",
    body: {
      jsonrpc: "2.0", id: 1, method: "getTransaction",
      params: [txHash, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
    },
  });
  if (r.status !== 200 || r.body?.error) throw new Error("sol: rpc error");
  const tx = r.body.result;
  if (!tx) return { state: "not_found" }; // not finalized yet (or unknown)
  if (tx.meta?.err) return { state: "failed", reason: "transaction error" };

  const keys = tx.transaction?.message?.accountKeys as any[] | undefined;
  const idx = keys?.findIndex((k) => (typeof k === "string" ? k : k.pubkey) === wallet) ?? -1;
  const delta = idx >= 0 ? BigInt(tx.meta.postBalances[idx]) - BigInt(tx.meta.preBalances[idx]) : 0n;
  return {
    state: "ok", recipientOk: delta > 0n, amountUnits: delta > 0n ? delta : 0n,
    confirmations: 32, // "finalized" commitment; treated as final
    occurredAt: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
  };
}
