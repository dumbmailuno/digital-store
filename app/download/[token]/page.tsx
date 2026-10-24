import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { hashToken, isTokenShape } from "@/lib/downloads";

export const metadata: Metadata = { title: "Your download", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Viewing this page changes nothing. The download itself is a POST button below.
export default async function DownloadPage({ params }: { params: { token: string } }) {
  let info: { product_name: string; downloads_left: number | null; expires_at: string | null } | null = null;
  if (isTokenShape(params.token)) {
    const { data } = await createServiceClient().rpc("peek_download", { p_token_hash: hashToken(params.token) });
    info = (Array.isArray(data) ? data[0] : data) ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="card text-center">
        {info ? (
          <>
            <h1 className="text-xl font-semibold">{info.product_name}</h1>
            <p className="mt-2 text-sm text-ink-soft">
              {info.downloads_left === null ? "Unlimited downloads" : `${info.downloads_left} download${info.downloads_left === 1 ? "" : "s"} left`}
              {info.expires_at ? ` · valid until ${new Date(info.expires_at).toLocaleString()}` : ""}
            </p>
            <form method="post" action={`/api/download/${params.token}`} className="mt-6">
              <button className="btn w-full">Download ZIP</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Link unavailable</h1>
            <p className="mt-2 text-sm text-ink-soft">This download link is invalid, has expired, or has no downloads left. Contact support if you need a new one.</p>
          </>
        )}
      </div>
    </main>
  );
}
