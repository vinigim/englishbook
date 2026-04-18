import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
} from "@/lib/email/send";

export const runtime = "nodejs";
// Stripe exige o raw body — nunca deixe o Next parsear isso
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  // Lê o body como texto pra preservar a assinatura
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid_signature";
    console.error("[webhook] signature verification failed:", msg);
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // --------------------------------------------------------------------
  // Idempotência: inserimos o event.id na tabela ANTES de processar.
  // Se já existe (PK), ignoramos o evento.
  // --------------------------------------------------------------------
  const { error: insertError } = await admin
    .from("stripe_webhook_events")
    .insert({
      id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError) {
    // Código do Postgres pra duplicate key: 23505
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[webhook] failed to insert event:", insertError);
    // Não falhe o webhook — deixe o Stripe re-tentar
    return NextResponse.json(
      { error: "db_insert_failed" },
      { status: 500 }
    );
  }

  // --------------------------------------------------------------------
  // Dispatcher
  // --------------------------------------------------------------------
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
          admin
        );
        break;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleCheckoutExpired(
          event.data.object as Stripe.Checkout.Session,
          event.id,
          admin
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(
          event.data.object as Stripe.PaymentIntent,
          event.id,
          admin
        );
        break;

      default:
        // Eventos que não nos interessam — só confirmamos o recebimento
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler error for ${event.type}:`, err);
    // Retorna 500 pra que o Stripe re-tente (ele vai detectar via idempotência
    // que já registramos). Mas isso é arriscado porque registramos ANTES.
    // Alternativa: apagar o registro em stripe_webhook_events no catch.
    await admin.from("stripe_webhook_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ====================================================================
// HANDLERS
// ====================================================================

type Admin = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  admin: Admin
) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) {
    console.warn("[webhook] checkout.session.completed sem booking_id");
    return;
  }

  // Só confirmamos se o pagamento foi pago (pode ser async processing)
  // Para card comum, payment_status === "paid" chega aqui.
  // "no_payment_required" é improvável mas tecnicamente válido.
  const okStatuses: Stripe.Checkout.Session.PaymentStatus[] = [
    "paid",
    "no_payment_required",
  ];
  if (!okStatuses.includes(session.payment_status)) {
    console.log(
      `[webhook] session ${session.id} not paid yet (${session.payment_status}) — esperando async_payment_succeeded`
    );
    return;
  }

  // 1) Confirma o booking (move slot -> booked, booking -> confirmed)
  const { error: confirmError } = await admin.rpc("confirm_booking", {
    p_booking_id: bookingId,
  });

  if (confirmError) {
    // Se já foi confirmado, o update é idempotente — ignoramos.
    // Se booking_not_found, algo muito estranho — logamos.
    if (!confirmError.message?.includes("booking_not_found")) {
      console.error("[webhook] confirm_booking error:", confirmError);
      throw confirmError;
    }
  }

  // 2) Atualiza o payment record (se existir, senão cria)
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Usa upsert via onConflict no checkout_session_id
  const { error: upsertError } = await admin.from("payments").upsert(
    {
      booking_id: bookingId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      amount_cents: session.amount_total ?? 0,
      currency: (session.currency ?? "brl").toUpperCase(),
      status: "succeeded",
      stripe_event_ids: [eventId],
    },
    { onConflict: "stripe_checkout_session_id" }
  );

  if (upsertError) {
    console.error("[webhook] payment upsert error:", upsertError);
    // Não falha — booking já foi confirmado
  }

  // 3) Busca dados para o e-mail (student + teacher)
  await sendBookingConfirmationFor(admin, bookingId);
}

/**
 * Busca dados do booking confirmado e dispara e-mail de confirmação
 * para o aluno. Silencioso em caso de erro.
 */
async function sendBookingConfirmationFor(admin: Admin, bookingId: string) {
  type BookingDetails = {
    id: string;
    price_cents: number;
    scheduled_start_at: string;
    student: { full_name: string; email: string } | null;
    teacher: { full_name: string } | null;
  };

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      `
      id, price_cents, scheduled_start_at,
      student:student_id ( full_name, email ),
      teacher:teacher_id ( full_name )
    `
    )
    .eq("id", bookingId)
    .single<BookingDetails>();

  if (error || !booking?.student?.email || !booking?.teacher) {
    console.error("[webhook] could not fetch booking for email:", error);
    return;
  }

  await sendBookingConfirmedEmail({
    studentEmail: booking.student.email,
    studentName: booking.student.full_name,
    teacherName: booking.teacher.full_name,
    scheduledStartAt: booking.scheduled_start_at,
    priceCents: booking.price_cents,
    bookingId: booking.id,
  });
}

async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  eventId: string,
  admin: Admin
) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;

  // Antes de cancelar, verifica se o booking ainda está em pending_payment.
  // Se já foi confirmado por algum motivo, não mexemos.
  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();

  if (!booking || booking.status !== "pending_payment") {
    return;
  }

  await admin.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: "checkout_expired",
  });

  await admin
    .from("payments")
    .update({
      status: "failed",
      stripe_event_ids: [eventId],
    })
    .eq("stripe_checkout_session_id", session.id);

  await sendBookingCancellationFor(admin, bookingId, "checkout_expired");
}

async function handlePaymentFailed(
  pi: Stripe.PaymentIntent,
  eventId: string,
  admin: Admin
) {
  const bookingId = pi.metadata?.booking_id;
  if (!bookingId) return;

  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();

  if (!booking || booking.status !== "pending_payment") {
    return;
  }

  await admin.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: "payment_failed",
  });

  await admin
    .from("payments")
    .update({
      status: "failed",
      stripe_payment_intent_id: pi.id,
      stripe_event_ids: [eventId],
    })
    .eq("booking_id", bookingId);

  await sendBookingCancellationFor(admin, bookingId, "payment_failed");
}

/**
 * Busca dados do booking cancelado e dispara e-mail de notificação
 * para o aluno. Silencioso em caso de erro.
 *
 * Importante: só chamamos isso em cancelamentos automáticos (expired,
 * payment_failed). Cancelamentos voluntários pelo aluno (via página de
 * "cancelado") NÃO disparam e-mail — reforçar isso seria redundante.
 */
async function sendBookingCancellationFor(
  admin: Admin,
  bookingId: string,
  reason: "payment_timeout" | "payment_failed" | "checkout_expired"
) {
  type BookingDetails = {
    id: string;
    scheduled_start_at: string;
    student: { full_name: string; email: string } | null;
    teacher: { full_name: string } | null;
  };

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      `
      id, scheduled_start_at,
      student:student_id ( full_name, email ),
      teacher:teacher_id ( full_name )
    `
    )
    .eq("id", bookingId)
    .single<BookingDetails>();

  if (error || !booking?.student?.email || !booking?.teacher) {
    console.error("[webhook] could not fetch booking for cancellation email:", error);
    return;
  }

  await sendBookingCancelledEmail({
    studentEmail: booking.student.email,
    studentName: booking.student.full_name,
    teacherName: booking.teacher.full_name,
    scheduledStartAt: booking.scheduled_start_at,
    reason,
  });
}
