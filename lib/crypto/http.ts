import "server-only";

/** fetch with a hard timeout; returns status + parsed JSON (or null). Never follows blind redirects to other hosts. */
export async function requestJson(
  url: string,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON body (e.g. plain-text 404) */ }
  return { status: res.status, body };
}
