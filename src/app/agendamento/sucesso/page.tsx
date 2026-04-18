import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { BookingStatusRefresher } from "./BookingStatusRefresher";
import { formatBRL, formatDateTime } from "@/lib/utils";
import { Check, Clock, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

type BookingDetails = {
  id: string;
  status: string;
  price_cents: number;
  scheduled_start_at: string;
  scheduled_end_at: string;
  profiles: { full_name: string } | null;
};

export default async function SucessoPage({
  searchParams,
}: {
  searchParams: Promise<{ booking_id?: string; session_id?: string }>;
}) {
  const { booking_id } = await searchParams;

  if (!booking_id) {
    redirect("/aluno/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/agendamento/sucesso?booking_id=${booking_id}`);
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      id, status, price_cents, scheduled_start_at, scheduled_end_at,
      profiles:teacher_id ( full_name )
    `
    )
    .eq("id", booking_id)
    .eq("student_id", user.id)
    .single<BookingDetails>();

  if (!booking) {
    return (
      <Container size="sm">
        <div className="py-20 text-center">
          <h1 className="font-display text-3xl tracking-tight mb-4">
            Agendamento não encontrado
          </h1>
          <p className="text-muted mb-8">
            Não conseguimos localizar esse agendamento.
          </p>
          <Link href="/aluno/dashboard" className="link-underline text-ink">
            Ir para o início
          </Link>
        </div>
      </Container>
    );
  }

  const teacherName = booking.profiles?.full_name ?? "seu professor";
  const stillPending = booking.status === "pending_payment";
  const isConfirmed = booking.status === "confirmed";
  const isCancelled = booking.status === "cancelled";

  return (
    <Container size="sm">
      <BookingStatusRefresher stillPending={stillPending} />
      <div className="py-16 md:py-24">
        {/* Estado: confirmado */}
        {isConfirmed ? (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 bg-ink text-paper mb-8">
              <Check className="w-6 h-6" />
            </div>
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
              Tudo certo
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
              Sua aula está{" "}
              <span className="italic text-accent">confirmada.</span>
            </h1>
            <p className="text-muted mt-4 leading-relaxed">
              Enviamos os detalhes pro seu e-mail. Você também pode ver tudo no
              seu dashboard.
            </p>
          </>
        ) : null}

        {/* Estado: ainda pendente (webhook ainda não chegou) */}
        {stillPending ? (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 bg-paper border border-ink mb-8">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
              Processando
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
              Confirmando seu{" "}
              <span className="italic">pagamento…</span>
            </h1>
            <p className="text-muted mt-4 leading-relaxed">
              Estamos finalizando com a operadora. Isso costuma levar só alguns
              segundos — a página vai atualizar automaticamente.
            </p>
          </>
        ) : null}

        {/* Estado: cancelado */}
        {isCancelled ? (
          <>
            <p className="text-sm text-accent tracking-[0.2em] uppercase mb-3">
              Algo não deu certo
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
              Esse agendamento foi cancelado.
            </h1>
            <p className="text-muted mt-4 leading-relaxed">
              Se você foi cobrado, o valor será estornado automaticamente em
              alguns dias úteis.
            </p>
            <div className="mt-8">
              <Alert variant="danger" title="Precisa de ajuda?">
                Entre em contato com o suporte se tiver dúvidas sobre a cobrança.
              </Alert>
            </div>
          </>
        ) : null}

        {/* Card de detalhes */}
        <div className="mt-12 bg-ink text-paper p-8 relative">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase opacity-70">
                EnglishBook
              </p>
              <p className="font-display text-2xl mt-1">Lesson Pass</p>
            </div>
            <span className="text-xs tracking-widest opacity-70">
              № {booking.id.slice(0, 6).toUpperCase()}
            </span>
          </div>
          <div className="border-t border-paper/20 pt-6 space-y-3">
            <Row label="Professor" value={teacherName} />
            <Row
              label="Início"
              value={formatDateTime(booking.scheduled_start_at)}
            />
            <Row
              label="Fim"
              value={formatDateTime(booking.scheduled_end_at)}
            />
            <div className="pt-3 border-t border-paper/20">
              <Row
                label="Total"
                value={formatBRL(booking.price_cents)}
                big
              />
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link
            href="/aluno/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-ink text-paper h-12 px-6 hover:bg-accent transition-colors"
          >
            Ir para o início
            <ArrowRight className="w-4 h-4" />
          </Link>
          {!isCancelled ? (
            <Link
              href="/aluno/agendar"
              className="inline-flex items-center justify-center h-12 px-6 border border-ink hover:bg-ink hover:text-paper transition-colors"
            >
              Agendar outra aula
            </Link>
          ) : null}
        </div>
      </div>
    </Container>
  );
}

function Row({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline text-sm">
      <span className="opacity-70">{label}</span>
      <span className={big ? "font-display text-xl" : ""}>{value}</span>
    </div>
  );
}
