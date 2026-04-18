import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronRequest } from "@/lib/cron";
import { getResend, EMAIL_FROM } from "@/lib/email/client";
import {
  dailyAvailabilityEmail,
  type DigestTeacherGroup,
} from "@/lib/email/templates/dailyAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel: permitir até 5min de execução (para lotes de alunos grandes)
export const maxDuration = 300;

type StudentRow = {
  id: string;
  preferred_teacher_ids: string[];
  profiles: { full_name: string; email: string } | null;
};

type SlotRow = {
  id: string;
  teacher_id: string;
  start_at: string;
  end_at: string;
  profiles: { full_name: string } | null;
};

/**
 * Digest diário de disponibilidade. Executa 1x por dia (ex: 11:00 UTC = 8h BRT).
 * Para cada aluno com opt-in:
 *  - Busca slots available dos próximos 7 dias
 *  - Filtra pelos professores favoritos (se houver)
 *  - Envia um e-mail se houver ao menos 1 slot
 */
export async function GET(request: NextRequest) {
  const authFail = validateCronRequest(request);
  if (authFail) return authFail;

  const admin = createAdminClient();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // --------------------------------------------------------------
  // 1) Alunos com opt-in
  // --------------------------------------------------------------
  const { data: students, error: studentsError } = await admin
    .from("students")
    .select(
      `
      id,
      preferred_teacher_ids,
      profiles!inner ( full_name, email )
    `
    )
    .eq("daily_availability_email", true)
    .returns<StudentRow[]>();

  if (studentsError) {
    console.error("[cron/daily-email] error fetching students:", studentsError);
    return NextResponse.json(
      { error: studentsError.message },
      { status: 500 }
    );
  }

  if (!students || students.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    });
  }

  // --------------------------------------------------------------
  // 2) Slots disponíveis nos próximos 7 dias (uma query só)
  // Reaproveitamos entre os alunos — apenas filtramos em memória.
  // --------------------------------------------------------------
  const { data: slots, error: slotsError } = await admin
    .from("availability_slots")
    .select(
      `
      id, teacher_id, start_at, end_at,
      profiles:teacher_id ( full_name )
    `
    )
    .eq("status", "available")
    .gte("start_at", now.toISOString())
    .lte("start_at", in7Days.toISOString())
    .order("start_at", { ascending: true })
    .returns<SlotRow[]>();

  if (slotsError) {
    console.error("[cron/daily-email] error fetching slots:", slotsError);
    return NextResponse.json({ error: slotsError.message }, { status: 500 });
  }

  if (!slots || slots.length === 0) {
    // Nenhum slot no sistema → não manda e-mail pra ninguém
    return NextResponse.json({
      ok: true,
      processed: students.length,
      sent: 0,
      skipped: students.length,
      errors: 0,
      note: "no_slots_available",
    });
  }

  // --------------------------------------------------------------
  // 3) Loop pelos alunos, monta digest individual e envia
  // --------------------------------------------------------------
  const resend = getResend();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const student of students) {
    if (!student.profiles?.email) {
      skipped++;
      continue;
    }

    // Filtra slots pelo gosto do aluno
    const preferred = new Set(student.preferred_teacher_ids);
    const relevantSlots = preferred.size > 0
      ? slots.filter((s) => preferred.has(s.teacher_id))
      : slots;

    if (relevantSlots.length === 0) {
      skipped++;
      continue;
    }

    // Agrupa por professor
    const byTeacher = new Map<
      string,
      { name: string; slots: { startAt: string; endAt: string }[] }
    >();
    for (const s of relevantSlots) {
      const teacherName = s.profiles?.full_name ?? "Professor";
      const existing = byTeacher.get(s.teacher_id);
      if (existing) {
        existing.slots.push({ startAt: s.start_at, endAt: s.end_at });
      } else {
        byTeacher.set(s.teacher_id, {
          name: teacherName,
          slots: [{ startAt: s.start_at, endAt: s.end_at }],
        });
      }
    }

    // Ordena professores alfabeticamente, limita a 8 professores no e-mail
    const groups: DigestTeacherGroup[] = Array.from(byTeacher.values())
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 8)
      .map((g) => ({ teacherName: g.name, slots: g.slots }));

    const { subject, html, text } = dailyAvailabilityEmail({
      studentName: student.profiles.full_name,
      groups,
      totalSlots: relevantSlots.length,
    });

    try {
      const { error: sendError } = await resend.emails.send({
        from: EMAIL_FROM,
        to: student.profiles.email,
        subject,
        html,
        text,
        headers: {
          // Link pra desinscrever — ajuda muito na reputação de envio
          "List-Unsubscribe": `<${process.env.NEXT_PUBLIC_APP_URL}/aluno/preferencias>`,
        },
      });

      if (sendError) {
        console.error(
          `[cron/daily-email] failed to send to ${student.profiles.email}:`,
          sendError
        );
        errors++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(
        `[cron/daily-email] exception sending to ${student.profiles.email}:`,
        err
      );
      errors++;
    }

    // Rate limit defensivo (Resend free tier: 2 req/s; pago: 10/s)
    await new Promise((r) => setTimeout(r, 150));
  }

  return NextResponse.json({
    ok: true,
    processed: students.length,
    sent,
    skipped,
    errors,
  });
}
