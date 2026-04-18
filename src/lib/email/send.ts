import { getResend, EMAIL_FROM } from "./client";
import { bookingConfirmedEmail } from "./templates/bookingConfirmed";
import { bookingCancelledEmail } from "./templates/bookingCancelled";

/**
 * Envia e-mails de notificação de booking. Nunca lança — erros são apenas
 * logados, porque o envio de e-mail não deve derrubar o webhook do Stripe
 * nem as funções SQL. A ausência de um e-mail é menos grave que um slot
 * travado por um webhook que falhou.
 */

type ConfirmedPayload = {
  studentEmail: string;
  studentName: string;
  teacherName: string;
  scheduledStartAt: string;
  priceCents: number;
  bookingId: string;
};

export async function sendBookingConfirmedEmail(
  payload: ConfirmedPayload
): Promise<void> {
  try {
    const { subject, html, text } = bookingConfirmedEmail({
      studentName: payload.studentName,
      teacherName: payload.teacherName,
      scheduledStartAt: payload.scheduledStartAt,
      priceCents: payload.priceCents,
      bookingId: payload.bookingId,
    });

    const resend = getResend();
    await resend.emails.send({
      from: EMAIL_FROM,
      to: payload.studentEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("[email/bookingConfirmed] failed:", err);
  }
}

type CancelledPayload = {
  studentEmail: string;
  studentName: string;
  teacherName: string;
  scheduledStartAt: string;
  reason: "payment_timeout" | "payment_failed" | "checkout_expired";
};

export async function sendBookingCancelledEmail(
  payload: CancelledPayload
): Promise<void> {
  try {
    const { subject, html, text } = bookingCancelledEmail({
      studentName: payload.studentName,
      teacherName: payload.teacherName,
      scheduledStartAt: payload.scheduledStartAt,
      reason: payload.reason,
    });

    const resend = getResend();
    await resend.emails.send({
      from: EMAIL_FROM,
      to: payload.studentEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("[email/bookingCancelled] failed:", err);
  }
}
