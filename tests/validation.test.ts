import test from "node:test";
import assert from "node:assert/strict";

import { passwordSchema } from "../lib/validation";

test("passwords only require at least eight characters", () => {
  assert.equal(passwordSchema.safeParse("password").success, true);
  assert.equal(passwordSchema.safeParse("short7!").success, false);
  assert.equal(passwordSchema.safeParse("a".repeat(129)).success, false);
});
