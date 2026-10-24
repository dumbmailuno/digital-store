import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Cheap tripwires that fail the build if someone introduces a classic injection pattern.
 * They don't replace review, but they catch the easy mistakes.
 */
const ROOTS = ["app", "components", "lib", "middleware.ts"];
function walk(p: string, out: string[] = []) {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), out);
  else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  return out;
}
const files = ROOTS.flatMap((r) => walk(r));
const hits = (re: RegExp) => files.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i: i + 1, l })).filter((x) => re.test(x.l))).map((x) => `${x.f}:${x.i}  ${x.l.trim()}`);

test("scans something", () => assert.ok(files.length > 50));

test("no PostgREST filter strings are built from variables (.or / .filter / .not with a template)", () => {
  assert.deepEqual(hits(/\.(or|filter|not|match)\(\s*`[^`]*\$\{/), []);
  assert.deepEqual(hits(/\.(or|filter)\(\s*[^"'`\s)][^)]*\+/), []);
});

test("every ilike/like search passes a pattern built by likePattern()", () => {
  const usage = hits(/\.(ilike|like)\(/);
  assert.ok(usage.length > 0);
  const bad = usage.filter((u) => {
    const file = u.split(":")[0];
    const okLine = /\.(ilike|like)\(\s*"[a-z_]+"\s*,\s*like\s*\)/.test(u);
    return !(okLine && /const like = likePattern\(/.test(readFileSync(file, "utf8")));
  });
  assert.deepEqual(bad, []);
});

test("no raw SQL entry points in app code", () => {
  assert.deepEqual(hits(/\b(pg|postgres|knex|sequelize|prisma)\b.*from ["']|\$queryRaw|\.query\(\s*`|\bsql`/), []);
});

test("no code-execution or HTML-injection sinks", () => {
  assert.deepEqual(hits(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(|document\.write\(/), []);
});

test("order() and rpc() names are literals, never user input", () => {
  assert.deepEqual(hits(/\.order\(\s*(?!["'`])/), []);
  assert.deepEqual(hits(/\.rpc\(\s*(?!["'])/), []);
});

test("the service-role key is only imported by server-only code", () => {
  const bad = files.filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, "utf8")) && !/lib\/supabase\/admin\.ts$/.test(f));
  assert.deepEqual(bad, []);
});
