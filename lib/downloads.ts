import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token; only its SHA-256 is stored, so a database leak yields no usable links. */
export function newDownloadToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
