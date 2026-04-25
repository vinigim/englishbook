import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { groupBookingsByMonth } from "@/lib/bookings";
import { formatDateTime, formatBRL } from "@/lib/utils";
import { HistoryFilters, type HistoryFilter } from "./HistoryFilters";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type HistoryBooking = {
  id: string;
  status: string;
  price_cents: number;
  currency: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  profiles: { full_name: string } | null;
  topic: { name: string } | null;
};

function isHistoryFilter(v: string | undefined): v is HistoryFilter {
  return v === "all" || v === "upcoming" || v === "past" || v === "cancelled";
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { user, supabase } = await requireUser("aluno");
  const sp = await searchParams;

  const activeFilter: HistoryFilter = isHistoryFilter(sp.status)
    ? sp.status
    : "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const now = new Date().toISOString();

  // ------------------------------------------------------------------
  // Query com filtros
  // ------------------------------------------------------------------
  let query = supabase
    .from("bookings")
    .select(
      `
      id, status, price_cents, currency, scheduled_start_at, scheduled_end_at,
      cancelled_at, cancelled_reason,
      profiles:teacher_id (full_name),
      topic:topic_id (name)
    `,
      { count: "exact" }
    )
    .eq("student_id", user.id);

  switch (activeFilter) {
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
    default:
      // Esconde pending_payment (estado transitório, do checkout)
      query = query
        .in("status", ["confirmed", "completed", "cancelled"])
        .order("scheduled_start_at", { ascending: false });
      break;
  }

  const {
    data: bookings,
    count,
    error,
  } = await query
    .range(offset, offset + PAGE_SIZE - 1)
    .returns<HistoryBooking[]>();

  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const grouped = groupBookingsByMonth(bookings ?? []);

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-10 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
              Registro
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              Histórico de aulas
            </h1>
          </div>
          <Link
            href="/aluno/dashboard"
            className="text-sm text-muted hover:text-ink hidden sm:inline"
          >
            ← Voltar
          </Link>
        </header>

        <HistoryFilters active={activeFilter} />

        {error ? (
          <p className="text-accent">Erro ao carregar: {error.message}</p>
        ) : null}

        {!error && grouped.length === 0 ? (
          <div className="border border-dashed border-line p-10 text-center">
            <p className="text-muted italic mb-4">
              Nenhuma aula nesta categoria.
            </p>
            {activeFilter !== "all" ? (
              <Link
                href="/aluno/historico"
                className="text-ink link-underline"
              >
                Ver todas
              </Link>
            ) : (
              <Link
                href="/aluno/agendar"
                className="text-ink link-underline"
              >
                Agendar primeira aula
              </Link>
            )}
          </div>
        ) : null}

        <div className="space-y-12">
          {grouped.map((group) => (
            <section key={group.monthKey}>
              <h2 className="font-display text-2xl tracking-tight capitalize border-b border-ink pb-2 mb-4">
                {group.monthLabel}
              </h2>
              <ul className="divide-y divide-line">
                {group.items.map((b) => (
                  <HistoryRow key={b.id} booking={b} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* PAGINAÇÃO */}
        {totalPages > 1 ? (
          <nav className="mt-12 flex items-center justify-between border-t border-line pt-6">
            <PageLink
              href={buildPageHref(activeFilter, page - 1)}
              disabled={page === 1}
              direction="prev"
            >
              Anterior
            </PageLink>
            <span className="text-sm text-muted">
              Página {page} de {totalPages}
            </span>
            <PageLink
              href={buildPageHref(activeFilter, page + 1)}
              disabled={page >= totalPages}
              direction="next"
            >
              Próxima
            </PageLink>
          </nav>
        ) : null}
      </div>
    </Container>
  );
}

function HistoryRow({ booking }: { booking: HistoryBooking }) {
  const teacherName = booking.profiles?.full_name ?? "Professor";
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
    if (booking.status === "confirmed") {
      return <Badge variant="success">Confirmada</Badge>;
    }
    return <Badge variant="warning">{booking.status}</Badge>;
  })();

  return (
    <li className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 sm:items-center">
      <div className="sm:col-span-5">
        <p className="font-medium">{teacherName}</p>
        <p className="text-sm text-muted">
          {formatDateTime(booking.scheduled_start_at)}
        </p>
        {booking.topic?.name ? (
          <p className="text-xs text-muted mt-0.5">{booking.topic.name}</p>
        ) : null}
      </div>
      <div className="sm:col-span-3">{badge}</div>
      <div className="sm:col-span-2 text-sm text-muted">
        {booking.cancelled_reason ? (
          <span className="italic">
            {humanizeCancelReason(booking.cancelled_reason)}
          </span>
        ) : null}
      </div>
      <div className="sm:col-span-2 sm:text-right font-display text-muted">
        {formatBRL(booking.price_cents)}
      </div>
    </li>
  );
}

function humanizeCancelReason(reason: string): string {
  switch (reason) {
    case "user_cancelled_checkout":
      return "Pagamento cancelado";
    case "payment_timeout":
      return "Pagamento expirou";
    case "payment_failed":
      return "Pagamento recusado";
    case "checkout_expired":
      return "Checkout expirou";
    case "stripe_error":
      return "Erro no pagamento";
    default:
      return reason;
  }
}

function buildPageHref(filter: HistoryFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/aluno/historico?${qs}` : "/aluno/historico";
}

function PageLink({
  href,
  disabled,
  direction,
  children,
}: {
  href: string;
  disabled: boolean;
  direction: "prev" | "next";
  children: React.ReactNode;
}) {
  const content = (
    <span className="inline-flex items-center gap-2 text-sm">
      {direction === "prev" ? <ArrowLeft className="w-4 h-4" /> : null}
      {children}
      {direction === "next" ? <ArrowRight className="w-4 h-4" /> : null}
    </span>
  );

  if (disabled) {
    return <span className="text-muted opacity-50">{content}</span>;
  }
  return (
    <Link href={href} className="text-ink hover:text-accent transition-colors">
      {content}
    </Link>
  );
}
