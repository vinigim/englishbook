import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { X } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CanceladoPage({
  searchParams,
}: {
  searchParams: Promise<{ booking_id?: string }>;
}) {
  const { booking_id } = await searchParams;

  // Se temos booking_id, aproveita e libera o slot imediatamente
  // (sem esperar expirar). O usuário cancelou o checkout explicitamente.
  if (booking_id) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // RLS: aluno vê o próprio booking via policy bookings_read_student
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, status, student_id")
        .eq("id", booking_id)
        .single();

      // Dupla checagem de dono (belt-and-suspenders)
      if (
        booking &&
        booking.student_id === user.id &&
        booking.status === "pending_payment"
      ) {
        // cancel_booking é SECURITY DEFINER, roda com permissão do owner
        await supabase.rpc("cancel_booking", {
          p_booking_id: booking.id,
          p_reason: "user_cancelled_checkout",
        });
      }
    }
  }

  return (
    <Container size="sm">
      <div className="py-20 md:py-28 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-paper border border-ink mb-8">
          <X className="w-6 h-6" />
        </div>
        <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
          Pagamento não finalizado
        </p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
          Nenhuma cobrança{" "}
          <span className="italic">feita.</span>
        </h1>
        <p className="text-muted mt-6 max-w-md mx-auto leading-relaxed">
          O horário foi liberado e você pode escolher outro quando quiser.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/aluno/agendar"
            className="inline-flex items-center justify-center bg-ink text-paper h-12 px-6 hover:bg-accent transition-colors"
          >
            Ver horários disponíveis
          </Link>
          <Link
            href="/aluno/dashboard"
            className="inline-flex items-center justify-center h-12 px-6 border border-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </Container>
  );
}
