import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hashToken, isTokenShape } from "@/lib/downloads";
import { limitIp } from "@/lib/ratelimit";
import { assertSameOrigin, handleError, HttpError } from "@/lib/http";

// POST only: email scanners and link previewers issue GETs, so they cannot burn a download.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    assertSameOrigin(req);
    await limitIp(req, "download", 30, 600);
    if (!isTokenShape(params.token)) throw new HttpError(404, "invalid_link", "This link is not valid.");
    const sb = createServiceClient();

    const { data, error } = await sb.rpc("consume_download", { p_token_hash: hashToken(params.token) });
    if (error) throw error;
    const path = (Array.isArray(data) ? data[0] : data)?.file_path as string | undefined;
    if (!path) throw new HttpError(410, "link_unusable", "This link has expired or has no downloads left.");

    const { data: signed, error: signErr } = await sb.storage.from("product-files").createSignedUrl(path, 60, { download: true });
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("no signed url");
    return NextResponse.redirect(signed.signedUrl, 303);
  } catch (e) { return handleError(e); }
}
