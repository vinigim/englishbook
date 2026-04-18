import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronRequest } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transição automática confirmed → completed para bookings cuja data
 * já passou. A função SQL complete_past_bookings faz o update atômico
 * e retorna a contagem. Agendar 1x por hora.
 */
export async function GET(request: NextRequest) {
  const authFail = validateCronRequest(request);
  if (authFail) return authFail;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_past_bookings");

  if (error) {
    console.error("[cron/complete-past-bookings] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const completed = typeof data === "number" ? data : 0;
  if (completed > 0) {
    console.log(`[cron/complete-past-bookings] completed ${completed} bookings`);
  }

  return NextResponse.json({ ok: true, completed });
}
