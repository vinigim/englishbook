import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({
  slot_id: z.string().uuid(),
  topic_id: z.string().uuid().optional(),
});

// Duração do hold deve bater com o PT do Stripe (cliente tem que pagar antes disso).
// 15 minutos é o default do schema; Stripe Checkout expira em 24h por padrão,
// então o hold manda.
const HOLD_MINUTES = 15;

export async function POST(request: NextRequest) {
  // ------------------------------------------------------------------
  // 1) Auth
  // ------------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "aluno") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ------------------------------------------------------------------
  // 2) Valida body
  // ------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 3) Chama hold_slot (atômico)
  // ------------------------------------------------------------------
  const { data: bookingId, error: holdError } = await supabase.rpc(
    "hold_slot",
    {
      p_slot_id: parsed.data.slot_id,
      p_student_id: user.id,
      p_hold_minutes: HOLD_MINUTES,
      p_topic_id: parsed.data.topic_id ?? null,
    }
  );

  if (holdError) {
    // Erros vindos do raise exception — mapeamos os códigos conhecidos
    const msg = holdError.message || "";
    const known = [
      "slot_not_found",
      "slot_not_available",
      "slot_in_past",
      "teacher_inactive",
    ];
    const code = known.find((k) => msg.includes(k));
    return NextResponse.json(
      { error: code ?? "hold_failed", message: msg },
      { status: code ? 409 : 500 }
    );
  }

  if (!bookingId || typeof bookingId !== "string") {
    return NextResponse.json({ error: "hold_failed" }, { status: 500 });
  }

  // ------------------------------------------------------------------
  // 4) Busca dados do booking pra montar a Checkout Session
  // ------------------------------------------------------------------
  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      `
      id, student_id, teacher_id, slot_id, price_cents, currency,
      scheduled_start_at, scheduled_end_at,
      profiles:teacher_id ( full_name )
    `
    )
    .eq("id", bookingId)
    .single<{
      id: string;
      student_id: string;
      teacher_id: string;
      slot_id: string;
      price_cents: number;
      currency: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
      profiles: { full_name: string } | null;
    }>();

  if (bookingError || !booking) {
    // Booking foi criado mas não conseguimos ler — rollback manual
    await admin.rpc("cancel_booking", {
      p_booking_id: bookingId,
      p_reason: "booking_fetch_failed",
    });
    return NextResponse.json(
      { error: "booking_fetch_failed" },
      { status: 500 }
    );
  }

  const teacherName = booking.profiles?.full_name ?? "Professor";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  // ------------------------------------------------------------------
  // 5) Cria Stripe Checkout Session
  // ------------------------------------------------------------------
  // Expira pouco antes do hold expirar, pra não prender o slot à toa.
  // Stripe exige min 30min no futuro, então usamos 30min aqui (o hold é 15min,
  // mas o usuário só passa da tela de pagamento uma vez).
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

  const scheduledDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(booking.scheduled_start_at));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: profile.email,
      expires_at: expiresAt,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: booking.price_cents,
            product_data: {
              name: `Aula de inglês com ${teacherName}`,
              description: `Agendada para ${scheduledDate}`,
            },
          },
        },
      ],
      metadata: {
        booking_id: booking.id,
        student_id: booking.student_id,
        teacher_id: booking.teacher_id,
        slot_id: booking.slot_id,
      },
      payment_intent_data: {
        metadata: {
          booking_id: booking.id,
        },
      },
      success_url: `${appUrl}/agendamento/sucesso?booking_id=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/agendamento/cancelado?booking_id=${booking.id}`,
    });

    // ----------------------------------------------------------------
    // 6) Cria payment record ligando session_id ao booking
    // ----------------------------------------------------------------
    const { error: paymentError } = await admin.from("payments").insert({
      booking_id: booking.id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      amount_cents: booking.price_cents,
      currency: booking.currency,
      status: "pending",
    });

    if (paymentError) {
      // Log mas não falha o fluxo — o webhook consegue criar depois via metadata
      console.error("[checkout] payment insert failed:", paymentError);
    }

    if (!session.url) {
      await admin.rpc("cancel_booking", {
        p_booking_id: booking.id,
        p_reason: "stripe_session_no_url",
      });
      return NextResponse.json(
        { error: "stripe_session_no_url" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
      booking_id: booking.id,
    });
  } catch (err) {
    // Algo falhou com o Stripe — libera o slot
    console.error("[checkout] stripe error:", err);
    await admin.rpc("cancel_booking", {
      p_booking_id: booking.id,
      p_reason: "stripe_error",
    });
    return NextResponse.json({ error: "stripe_error" }, { status: 500 });
  }
}
