import { NextResponse } from "next/server";
import { handleError, requireUser } from "@/lib/http";
import { listPaymentMethods } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ methods: await listPaymentMethods() });
  } catch (e) { return handleError(e); }
}
