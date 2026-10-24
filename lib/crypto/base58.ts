import { sha256 } from "@noble/hashes/sha2.js";

// Isomorphic (no node:crypto) so it can also run in the browser for instant feedback.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Uint8Array {
  if (!s) throw new Error("empty");
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const ch of s) { if (ch === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}

const checksum = (payload: Uint8Array) => sha256(sha256(payload)).subarray(0, 4);

/** Base58Check decode. Returns the payload without the 4-byte checksum. */
export function base58CheckDecode(s: string): Uint8Array {
  const raw = base58Decode(s);
  if (raw.length < 5) throw new Error("too short");
  const payload = raw.slice(0, -4);
  const check = raw.slice(-4);
  const expect = checksum(payload);
  if (!expect.every((b, i) => b === check[i])) throw new Error("bad checksum");
  return payload;
}

export function base58CheckEncode(payload: Uint8Array): string {
  const out = new Uint8Array(payload.length + 4);
  out.set(payload); out.set(checksum(payload), payload.length);
  return base58Encode(out);
}

/** TRON address (T...) -> its 20-byte account as lowercase hex (no 0x, no 41 prefix). */
export function tronAddressToHex(addr: string): string {
  const p = base58CheckDecode(addr);
  if (p.length !== 21 || p[0] !== 0x41) throw new Error("not a TRON address");
  return Buffer.from(p.subarray(1)).toString("hex");
}
