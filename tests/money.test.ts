import test from "node:test";
import assert from "node:assert/strict";
import { decimalToUnits, unitsToDecimal, usdStringToCents, usdToUnits } from "../lib/crypto/money";
import { tronAddressToHex } from "../lib/crypto/base58";

test("usdStringToCents", () => {
  assert.equal(usdStringToCents("29.99"), 2999n);
  assert.equal(usdStringToCents("50"), 5000n);
  assert.equal(usdStringToCents("0.5"), 50n);
  assert.throws(() => usdStringToCents("-1"));
  assert.throws(() => usdStringToCents("1.234"));
  assert.throws(() => usdStringToCents("abc"));
});

test("$50 in USDT at 1.00 is exactly 50 USDT", () => {
  assert.equal(usdToUnits(5000n, 1, 6), 50_000_000n);
});

test("$50 in BTC at $100,000 is 50,000 sats", () => {
  assert.equal(usdToUnits(5000n, 100_000, 8), 50_000n);
});

test("conversion rounds UP, never short-changes the store", () => {
  // $10 at $3 per coin = 3.3333... ; 6 decimals => 3.333334 (not 3.333333)
  assert.equal(usdToUnits(1000n, 3, 6), 3_333_334n);
});

test("ETH uses 18 decimals without precision loss", () => {
  const u = usdToUnits(5000n, 4000, 18); // $50 / $4000 = 0.0125 ETH
  assert.equal(u, 12_500_000_000_000_000n);
  assert.equal(unitsToDecimal(u, 18), "0.0125");
});

test("rejects nonsense rates", () => {
  for (const r of [0, -5, NaN, Infinity]) assert.throws(() => usdToUnits(5000n, r, 6));
});

test("decimal <-> units round trip, incl. Postgres numeric(36,18) padding", () => {
  assert.equal(decimalToUnits("0.0005", 8), 50_000n);
  assert.equal(decimalToUnits("50.000000000000000000", 6), 50_000_000n);
  assert.equal(unitsToDecimal(50_000_000n, 6), "50");
  assert.equal(unitsToDecimal(50_000_000n, 6, false), "50.000000");
  assert.throws(() => decimalToUnits("0.0000001", 6)); // finer than the asset allows
});

test("TRON base58 address decodes (USDT contract)", () => {
  // well-known USDT-TRC20 contract; hex form is a9... style 20 bytes
  const hex = tronAddressToHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  assert.equal(hex.length, 40);
  assert.equal(hex, "a614f803b6fd780986a42c78ec9c7f77e6ded13c");
  assert.throws(() => tronAddressToHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6x")); // bad checksum
});
