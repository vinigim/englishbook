import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, formatBRL } from "@/lib/utils";
import { groupBookingsByMonth } from "@/lib/bookings";
import { AgendaFilters, type AgendaFilter } from "./AgendaFilters";

export const dynamic = "force-dynamic";

type AgendaBooking = {
  id: string;
  status: string;
  price_cents: number;
  scheduled_start_at: string;
  scheduled_end_at: string;
  cancelled_reason: string | null;
  profiles: { full_name: string; email: string } | null;
  topic: { name: string } | null;
};

function isFilter(v: string | undefined): v is AgendaFilter {
  return v === "upcoming" || v === "past" || v === "cancelled" || v === "all";
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user, supabase } = await requireUser("professor");
  const sp = await searchParams;
  const filter: AgendaFilter = isFilter(sp.filter) ? sp.filter : "upcoming";
  const now = new Date().toISOString();

  let query = supabase
    .from("bookings")
    .select(
      `
      id, status, price_cents, scheduled_start_at, scheduled_end_at,
      cancelled_reason,
      profiles:student_id ( full_name, email ),
      topic:topic_id ( name )
    `
    )
    .eq("teacher_id", user.id);

  switch (filter) {
    case "upcoming":
      query = query
        .eq("status", "confirmed")
        .gte("scheduled_start_at", now)
        .order("scheduled_start_at", { ascending: true });
      break;
    case "past":
      query = query
        .in("status", ["confirmed", "completed"])
        .lt("scheduled_start_at", now)
        .order("scheduled_start_at", { ascending: false });
      break;
    case "cancelled":
      query = query
        .eq("status", "cancelled")
        .order("scheduled_start_at", { ascending: false });
      break;
    case "all":
      query = query
        .in("status", ["confirmed", "completed", "cancelled"])
        .order("scheduled_start_at", { ascending: false });
      break;
  }

  const { data: bookings } = await query.limit(100).returns<AgendaBooking[]>();
  const grouped = groupBookingsByMonth(bookings ?? []);

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-10">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Suas aulas
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Agenda
          </h1>
        </header>

        <AgendaFilters active={filter} />

        {grouped.length === 0 ? (
          <div className="border border-dashed border-line p-10 text-center">
            <p className="text-muted italic mb-4">
              {filter === "upcoming"
                ? "Nenhuma aula agendada no momento."
                : "Nenhuma aula nesta categoria."}
            </p>
            {filter === "upcoming" ? (
              <Link
                href="/professor/disponibilidade"
                className="text-ink link-underline"
              >
                Cadastrar mais horários
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-12">
            {grouped.map((group) => (
              <section key={group.monthKey}>
                <h2 className="font-display text-2xl tracking-tight capitalize border-b border-ink pb-2 mb-4">
                  {group.monthLabel}
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((b) => (
                    <AgendaRow key={b.id} booking={b} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

function AgendaRow({ booking }: { booking: AgendaBooking }) {
  const studentName = booking.profiles?.full_name ?? "Aluno";
  const studentEmail = booking.profiles?.email;
  const isPast =
    new Date(booking.scheduled_start_at) < new Date() &&
    booking.status === "confirmed";

  const badge = (() => {
    if (booking.status === "cancelled") {
      return <Badge variant="danger">Cancelada</Badge>;
    }
    if (booking.status === "completed" || isPast) {
      return <Badge variant="neutral">Concluída</Badge>;
    }
    return <Badge variant="success">Confirmada</Badge>;
  })();

  return (
    <li className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 sm:items-center">
      <div className="sm:col-span-5">
        <p className="font-medium">{studentName}</p>
        {studentEmail ? (
          <p className="text-xs text-muted">{studentEmail}</p>
        ) : null}
      </div>
      <div className="sm:col-span-3 text-sm text-muted">
        {formatDateTime(booking.scheduled_start_at)}
        {booking.topic?.name ? (
          <p className="text-xs mt-0.5">{booking.topic.name}</p>
        ) : null}
      </div>
      <div className="sm:col-span-2">{badge}</div>
      <div className="sm:col-span-2 sm:text-right font-display text-muted">
        {formatBRL(booking.price_cents)}
      </div>
    </li>
  );
}
