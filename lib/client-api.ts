/** Small fetch helper for our own JSON routes. Never throws; network failures come back as ok:false. */
export async function postJson<T = any>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null; message: string | null; retryAfter: number | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok, status: res.status, data: res.ok ? (json as T) : null,
      message: res.ok ? null : json?.error?.message ?? "Something went wrong. Please try again.",
      retryAfter: Number(res.headers.get("retry-after")) || null,
    };
  } catch {
    return { ok: false, status: 0, data: null, message: "Can't reach the server. Check your connection and try again.", retryAfter: null };
  }
}
