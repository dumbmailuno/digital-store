import test from "node:test";
import assert from "node:assert/strict";
import { checkSvg } from "../lib/svg";
import { likePattern } from "../lib/search";

const wrap = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${attrs}>${inner}</svg>`;

test("a plain avatar passes", () => {
  assert.equal(checkSvg(wrap('<circle cx="32" cy="32" r="30" fill="#2b4a7d"/><path d="M10 50 Q32 20 54 50Z" fill="#fff"/>')).ok, true);
  assert.equal(checkSvg('<?xml version="1.0"?>' + wrap('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/>')).ok, true);
});

for (const [name, svg] of Object.entries({
  script: wrap('<script>alert(1)</script>'),
  "event handler": wrap('<circle r="5" onload="alert(1)"/>'),
  "event handler on root": wrap("", ' onload="x()"'),
  foreignObject: wrap('<foreignObject><div>hi</div></foreignObject>'),
  "external image": wrap('<image href="https://evil.test/x.png"/>'),
  "use + href": wrap('<use href="https://evil.test/x.svg#a"/>'),
  "xlink href": wrap('<a xlink:href="javascript:alert(1)"><circle r="5"/></a>'),
  "javascript url": wrap('<path d="M0 0" fill="javascript:alert(1)"/>'),
  "external css url": wrap('<rect fill="url(https://evil.test/a.svg#x)"/>'),
  "style attribute": wrap('<rect style="fill:url(//evil.test)"/>'),
  animate: wrap('<animate attributeName="href" values="javascript:alert(1)"/>'),
  doctype: '<!DOCTYPE svg [<!ENTITY x "y">]>' + wrap(""),
  comment: wrap("<!-- hi --><circle r='5'/>"),
  "not svg": "<html><body>hi</body></html>",
  empty: "",
  "too big": wrap("<path d='" + "M0 0 ".repeat(30000) + "'/>"),
})) {
  test(`rejects: ${name}`, () => assert.equal(checkSvg(svg as string).ok, false));
}

test("likePattern escapes wildcards, trims and caps length", () => {
  assert.equal(likePattern("  50%_off\\ "), "%50\\%\\_off\\\\%");
  assert.equal(likePattern("   "), null);
  assert.equal(likePattern(undefined), null);
  assert.equal(likePattern("x".repeat(500))!.length, 62);
  assert.equal(likePattern("a,b),c.eq.1"), "%a,b),c.eq.1%", "commas and brackets are harmless in a bound value");
});
