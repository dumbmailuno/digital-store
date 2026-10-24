import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { fail, handleError } from "@/lib/http";
import { runMaintenance } from "@/lib/payments/service";

// Call every 5 minutes with:  Authorization: Bearer $CRON_SECRET
function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  try {
    if (!authorised(req)) return fail(401, "unauthorised", "Unauthorised.");
    return NextResponse.json(await runMaintenance());
  } catch (e) { return handleError(e); }
}
export const GET = run;
export const POST = run;
