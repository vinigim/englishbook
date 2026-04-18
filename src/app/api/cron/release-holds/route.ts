import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronRequest } from "@/lib/cron";
import { sendBookingCancelledEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpiredBooking = {
  id: string;
  scheduled_start_at: string;
  student: { full_name: string; email: string } | null;
  teacher: { full_name: string } | null;
};

/**
 * Libera slots que ficaram presos em "pending" (aluno abriu o checkout
 * mas não pagou). Agendar a cada ~5 min.
 *
 * Sequência:
 * 1. Captura os bookings que VÃO ser cancelados pelo release (pra mandar e-mail)
 * 2. Chama release_expired_holds (função SQL atômica)
 * 3. Envia e-mails de cancelamento com reason "payment_timeout"
 */
export async function GET(request: NextRequest) {
  const authFail = validateCronRequest(request);
  if (authFail) return authFail;

  const admin = createAdminClient();

  // ------------------------------------------------------------------
  // 1) Captura bookings pending_payment cujo slot associado tem hold
  // expirado. Fazemos em duas etapas pra evitar complexidade de join
  // filter no PostgREST: primeiro achamos os slot_ids expirados, depois
  // buscamos os bookings que dependem deles.
  // ------------------------------------------------------------------
  const nowIso = new Date().toISOString();

  const { data: expiredSlots } = await admin
    .from("availability_slots")
    .select("id")
    .eq("status", "pending")
    .lt("held_until", nowIso);

  const expiredSlotIds = (expiredSlots ?? []).map((s) => s.id);

  let expiredBookings: ExpiredBooking[] = [];
  if (expiredSlotIds.length > 0) {
    const { data } = await admin
      .from("bookings")
      .select(
        `
        id, scheduled_start_at,
        student:student_id ( full_name, email ),
        teacher:teacher_id ( full_name )
      `
      )
      .eq("status", "pending_payment")
      .in("slot_id", expiredSlotIds)
      .returns<ExpiredBooking[]>();
    expiredBookings = data ?? [];
  }

  // ------------------------------------------------------------------
  // 2) Chama a função SQL (atômica, faz o trabalho real)
  // ------------------------------------------------------------------
  const { data, error } = await admin.rpc("release_expired_holds");

  if (error) {
    console.error("[cron/release-holds] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const released = typeof data === "number" ? data : 0;

  // ------------------------------------------------------------------
  // 3) Envia e-mails em paralelo (sendBookingCancelledEmail nunca lança)
  // ------------------------------------------------------------------
  let emailsSent = 0;
  if (expiredBookings && expiredBookings.length > 0) {
    await Promise.all(
      expiredBookings.map(async (b) => {
        if (!b.student?.email || !b.teacher) return;
        await sendBookingCancelledEmail({
          studentEmail: b.student.email,
          studentName: b.student.full_name,
          teacherName: b.teacher.full_name,
          scheduledStartAt: b.scheduled_start_at,
          reason: "payment_timeout",
        });
        emailsSent++;
      })
    );
  }

  if (released > 0 || emailsSent > 0) {
    console.log(
      `[cron/release-holds] released ${released} slots, sent ${emailsSent} emails`
    );
  }

  return NextResponse.json({ ok: true, released, emails_sent: emailsSent });
}
