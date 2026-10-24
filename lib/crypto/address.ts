import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58CheckDecode, base58Decode } from "./base58";
import { USDT_ETHEREUM, USDT_TRON } from "./chains";

// A typo in a payout address sends customers' money to a stranger forever, so every
// supported network gets a real CHECKSUM test, not just a format regex.

export type AddressCheck = { ok: true; address: string; warning?: string } | { ok: false; reason: string };

const bad = (reason: string): AddressCheck => ({ ok: false, reason });

// ---------------------------------------------------------------- Bitcoin
const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & max); }
  }
  if (bits >= from || ((acc << (to - bits)) & max)) return null; // non-zero padding
  return out;
}

function checkBech32(addr: string): AddressCheck {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return bad("Mixed upper and lower case is not a valid Bitcoin address.");
  const a = addr.toLowerCase();
  const sep = a.lastIndexOf("1");
  if (sep < 1 || a.length > 90 || a.length - sep - 1 < 7) return bad("That is not a valid Bitcoin address.");
  const hrp = a.slice(0, sep);
  if (hrp !== "bc") return bad("That is not a Bitcoin mainnet address (it must start with bc1).");
  const data: number[] = [];
  for (const ch of a.slice(sep + 1)) { const i = B32.indexOf(ch); if (i < 0) return bad("That address contains invalid characters."); data.push(i); }
  const hrpExp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const pm = polymod([...hrpExp, ...data]);
  const version = data[0];
  const expected = version === 0 ? 1 : 0x2bc830a3; // bech32 for v0, bech32m for v1+
  if (pm !== expected) return bad("The address checksum doesn't match. Check for a typo.");
  const prog = convertBits(data.slice(1, -6), 5, 8);
  if (!prog || prog.length < 2 || prog.length > 40) return bad("That is not a valid Bitcoin address.");
  if (version === 0 && prog.length !== 20 && prog.length !== 32) return bad("That is not a valid Bitcoin address.");
  if (version > 16) return bad("That is not a valid Bitcoin address.");
  return { ok: true, address: a };
}

function checkBitcoin(addr: string): AddressCheck {
  if (/^bc1/i.test(addr)) return checkBech32(addr);
  if (/^[13]/.test(addr)) {
    try {
      const p = base58CheckDecode(addr);
      if (p.length !== 21 || (p[0] !== 0x00 && p[0] !== 0x05)) return bad("That is not a Bitcoin mainnet address.");
      return { ok: true, address: addr };
    } catch { return bad("The address checksum doesn't match. Check for a typo."); }
  }
  if (/^(tb1|bcrt1|[mn2])/i.test(addr)) return bad("That is a Bitcoin testnet address, not mainnet (mainnet starts with bc1, 1 or 3).");
  return bad("Bitcoin addresses start with bc1, 1 or 3.");
}

// ------------------------------------------------------------ EVM (ETH/USDT)
function toChecksumAddress(lowerHex: string): string {
  const hash = bytesToHex(keccak_256(utf8ToBytes(lowerHex)));
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lowerHex[i].toUpperCase() : lowerHex[i];
  return out;
}

const EVM_FORBIDDEN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  USDT_ETHEREUM,
]);

function checkEvm(addr: string): AddressCheck {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return bad("Ethereum addresses are 0x followed by 40 letters and numbers.");
  const lower = addr.slice(2).toLowerCase();
  const normalized = toChecksumAddress(lower);
  if (EVM_FORBIDDEN.has(("0x" + lower))) return bad("That is a contract or burn address, not a wallet. Funds sent there would be lost.");
  const mixed = addr.slice(2) !== lower && addr.slice(2) !== addr.slice(2).toUpperCase();
  if (mixed && addr !== normalized) return bad("The address checksum doesn't match. Check for a typo.");
  if (!mixed) {
    // all-lowercase / all-uppercase carries no checksum, so a typo would go undetected
    return { ok: true, address: normalized, warning: "This address has no checksum casing, so typos can't be detected. Copy it again from your wallet and compare it carefully." };
  }
  return { ok: true, address: normalized };
}

// ------------------------------------------------------------------- TRON
function checkTron(addr: string): AddressCheck {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return bad("TRON addresses start with T and are 34 characters long.");
  try {
    const p = base58CheckDecode(addr);
    if (p.length !== 21 || p[0] !== 0x41) return bad("That is not a TRON address.");
  } catch { return bad("The address checksum doesn't match. Check for a typo."); }
  if (addr === USDT_TRON) return bad("That is the USDT contract address, not a wallet. Funds sent there would be lost.");
  return { ok: true, address: addr };
}

// ----------------------------------------------------------------- Solana
function checkSolana(addr: string): AddressCheck {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return bad("That is not a valid Solana address.");
  try { if (base58Decode(addr).length !== 32) return bad("That is not a valid Solana address."); }
  catch { return bad("That is not a valid Solana address."); }
  if (/^1{32}$/.test(addr)) return bad("That is the system program address, not a wallet.");
  return { ok: true, address: addr };
}

/** Validate (and normalise) a payout address for a network. */
export function validateAddress(network: string, raw: string): AddressCheck {
  const addr = raw.trim();
  if (!addr) return bad("Enter an address.");
  if (addr.length > 120) return bad("That address is too long.");
  switch (network) {
    case "bitcoin": return checkBitcoin(addr);
    case "ethereum": case "bsc": case "polygon": return checkEvm(addr);
    case "tron": return checkTron(addr);
    case "solana": return checkSolana(addr);
    default: return bad("Unsupported network.");
  }
}
