import test from "node:test";
import assert from "node:assert/strict";
import { validateAddress } from "../lib/crypto/address";
import { base58CheckEncode } from "../lib/crypto/base58";

const ok = (n: string, a: string) => { const r = validateAddress(n, a); assert.equal(r.ok, true, `${a}: ${!r.ok ? r.reason : ""}`); return r as Extract<ReturnType<typeof validateAddress>, { ok: true }>; };
const no = (n: string, a: string, re?: RegExp) => { const r = validateAddress(n, a); assert.equal(r.ok, false, `${a} should be rejected`); if (re && !r.ok) assert.match(r.reason, re); };

test("bitcoin: known-valid bech32, bech32 upper-case, taproot, legacy P2PKH, P2SH", () => {
  ok("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  assert.equal(ok("bitcoin", "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4").address, "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
  ok("bitcoin", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0");
  ok("bitcoin", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  ok("bitcoin", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy");
});

test("bitcoin: typos, wrong network and mixed case are rejected", () => {
  no("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp", /checksum/);       // last char changed
  no("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdQ", /case|checksum/);   // mixed case
  no("bitcoin", "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", /mainnet/);          // testnet
  no("bitcoin", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", /checksum/);
  no("bitcoin", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jjq", /checksum/);
  no("bitcoin", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  no("bitcoin", "");
});

test("ethereum: EIP-55 checksummed address accepted; one flipped letter-case rejected", () => {
  const good = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
  assert.equal(ok("ethereum", good).warning, undefined);
  no("ethereum", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD", /checksum/);
  no("ethereum", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe", /40/);
  no("ethereum", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
});

test("ethereum: all-lowercase is accepted, normalised, and flagged as unchecked", () => {
  const r = ok("ethereum", "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
  assert.equal(r.address, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.match(r.warning ?? "", /no checksum/);
});

test("ethereum: contract, zero and burn addresses are refused (funds would be lost)", () => {
  no("ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7", /contract/);     // USDT contract
  no("ethereum", "0x0000000000000000000000000000000000000000", /contract|burn/);
  no("ethereum", "0x000000000000000000000000000000000000dEaD", /contract|burn/);
});

test("tron: round-trips a constructed address; typo and wrong prefix rejected; USDT contract refused", () => {
  const payload = new Uint8Array(21); payload[0] = 0x41; for (let i = 1; i < 21; i++) payload[i] = (i * 37) & 0xff;
  const addr = base58CheckEncode(payload);
  assert.match(addr, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  ok("tron", addr);
  const typo = addr.slice(0, -1) + (addr.endsWith("a") ? "b" : "a");
  no("tron", typo, /checksum/);
  no("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", /contract/);
  const wrong = new Uint8Array(21); wrong[0] = 0x00; wrong.fill(7, 1);
  no("tron", base58CheckEncode(wrong));
  no("tron", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", /start with T/);
});

test("solana: 32-byte base58 accepted; bad characters, short and system-program rejected", () => {
  ok("solana", "So11111111111111111111111111111111111111112");
  ok("solana", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  no("solana", "So1111111111111111111111111111111111111111O");   // 'O' is not base58
  no("solana", "abc");
  no("solana", "11111111111111111111111111111111", /system/);
});

test("unsupported network and absurd input", () => {
  no("dogecoin", "D5abc", /Unsupported/);
  no("ethereum", "0x" + "a".repeat(200), /too long/);
  ok("bitcoin", "  bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq  "); // trims whitespace
});
