import test from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../lib/origin";

test("same host is accepted, even if the configured site URL is wrong", () => {
  assert.equal(isSameOrigin("https://shop.example.com", "shop.example.com", "http://localhost:3000"), true);
  assert.equal(isSameOrigin("https://my-app-git-main.vercel.app", "my-app-git-main.vercel.app", undefined), true);
});
test("the configured site URL is accepted too (www / proxy cases)", () => {
  assert.equal(isSameOrigin("https://www.example.com", "internal-host", "https://www.example.com"), true);
});
test("another website is refused", () => {
  assert.equal(isSameOrigin("https://evil.test", "shop.example.com", "https://shop.example.com"), false);
  assert.equal(isSameOrigin("https://shop.example.com.evil.test", "shop.example.com", "https://shop.example.com"), false);
  assert.equal(isSameOrigin("https://evil.test", "shop.example.com", undefined), false);
});
test("missing, null or malformed Origin is refused", () => {
  assert.equal(isSameOrigin(null, "shop.example.com", "https://shop.example.com"), false);
  assert.equal(isSameOrigin("null", "shop.example.com", "https://shop.example.com"), false);
  assert.equal(isSameOrigin("not a url", "x", "https://x"), false);
  assert.equal(isSameOrigin("file:///etc/passwd", "x", "https://x"), false);
});
