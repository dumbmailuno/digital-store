/**
 * Turns what someone typed into a safe LIKE/ILIKE pattern for a search box.
 * The value is always sent as a bound parameter (never spliced into SQL), so this is not about
 * injection: it stops "%" and "_" from acting as wildcards and caps the length.
 */
export function likePattern(input: unknown, max = 60) {
  const s = String(input ?? "").trim().slice(0, max).replace(/[\\%_]/g, (c) => `\\${c}`);
  return s ? `%${s}%` : null;
}
