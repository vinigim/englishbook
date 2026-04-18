import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, formatBRL, monthLabel } from "@/lib/utils";
import { Calendar, BookOpen, ArrowRight, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

type UpcomingBooking = {
  id: string;
  status: string;
  price_cents: number;
  scheduled_start_at: string;
  profiles: { full_name: string } | null;
};

type MonthlyRow = {
  student_id: string;
  teacher_id: string;
  teacher_name: string;
  month: string;
  lessons_count: number;
  total_spent_cents: number;
};

export default async function AlunoDashboard() {
  const { user, profile, supabase } = await requireUser("aluno");
  const firstName = profile.full_name.split(" ")[0];
  const now = new Date().toISOString();

  // ------------------------------------------------------------------
  // Próximas aulas confirmadas
  // ------------------------------------------------------------------
  const { data: upcoming } = await supabase
    .from("bookings")
    .select(
      `id, status, price_cents, scheduled_start_at, profiles:teacher_id(full_name)`
    )
    .eq("status", "confirmed")
    .gte("scheduled_start_at", now)
    .order("scheduled_start_at", { ascending: true })
    .limit(5)
    .returns<UpcomingBooking[]>();

  // ------------------------------------------------------------------
  // Breakdown mensal por professor (usa a view student_monthly_lessons)
  // Filtramos explicitamente por student_id — defesa em profundidade
  // mesmo com security_invoker aplicado.
  // ------------------------------------------------------------------
  const { data: monthlyRaw } = await supabase
    .from("student_monthly_lessons")
    .select("*")
    .eq("student_id", user.id)
    .order("month", { ascending: false })
    .returns<MonthlyRow[]>();

  // Agrupa por mês (cada mês pode ter múltiplos professores)
  const byMonth = new Map<
    string,
    { label: string; rows: MonthlyRow[]; total: number; lessons: number }
  >();

  for (const row of monthlyRaw ?? []) {
    const existing = byMonth.get(row.month);
    if (existing) {
      existing.rows.push(row);
      existing.total += row.total_spent_cents;
      existing.lessons += row.lessons_count;
    } else {
      byMonth.set(row.month, {
        label: monthLabel(row.month),
        rows: [row],
        total: row.total_spent_cents,
        lessons: row.lessons_count,
      });
    }
  }

  const totalLessons = (monthlyRaw ?? []).reduce(
    (sum, r) => sum + r.lessons_count,
    0
  );
  const totalSpent = (monthlyRaw ?? []).reduce(
    (sum, r) => sum + r.total_spent_cents,
    0
  );

  return (
    <Container>
      <div className="py-10 md:py-16">
        {/* HEADER */}
        <header className="mb-12">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Olá, {firstName}
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Seu canto de estudos.
          </h1>
        </header>

        {/* LINHA DE CTAS */}
        <div className="grid md:grid-cols-3 gap-px bg-line mb-16">
          <CtaCard
            href="/aluno/agendar"
            icon={<Calendar className="w-5 h-5" />}
            title="Agendar aula"
            subtitle="Escolha horário"
            primary
          />
          <CtaCard
            href="/aluno/historico"
            icon={<BookOpen className="w-5 h-5" />}
            title="Histórico"
            subtitle={`${totalLessons} ${
              totalLessons === 1 ? "aula concluída" : "aulas concluídas"
            }`}
          />
          <CtaCard
            href="/aluno/preferencias"
            icon={<Settings className="w-5 h-5" />}
            title="Preferências"
            subtitle="E-mail diário, professores favoritos"
          />
        </div>

        <div className="grid lg:grid-cols-5 gap-10">
          {/* PRÓXIMAS AULAS */}
          <section className="lg:col-span-2">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl tracking-tight">
                Próximas aulas
              </h2>
              <Link
                href="/aluno/historico"
                className="text-sm text-muted hover:text-ink"
              >
                Ver tudo
              </Link>
            </div>
            {!upcoming || upcoming.length === 0 ? (
              <div className="border border-dashed border-line p-6">
                <p className="text-muted italic mb-4">
                  Nenhuma aula agendada por enquanto.
                </p>
                <Link
                  href="/aluno/agendar"
                  className="inline-flex items-center gap-2 text-ink link-underline"
                >
                  Agendar primeira aula
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <ul className="space-y-0 border-t border-line">
                {upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="py-5 border-b border-line flex justify-between items-start gap-4"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {b.profiles?.full_name ?? "Professor"}
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        {formatDateTime(b.scheduled_start_at)}
                      </p>
                    </div>
                    <Badge variant="success">Confirmada</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* BREAKDOWN MENSAL */}
          <section className="lg:col-span-3">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl tracking-tight">
                Por mês, por professor
              </h2>
              {totalSpent > 0 ? (
                <p className="text-sm text-muted">
                  Total investido:{" "}
                  <span className="text-ink font-medium">
                    {formatBRL(totalSpent)}
                  </span>
                </p>
              ) : null}
            </div>

            {byMonth.size === 0 ? (
              <div className="border border-dashed border-line p-6">
                <p className="text-muted italic">
                  Seu histórico aparece aqui assim que você concluir sua
                  primeira aula.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {Array.from(byMonth.entries()).map(([monthKey, data]) => (
                  <div key={monthKey}>
                    <div className="flex items-baseline justify-between mb-3 border-b border-ink pb-2">
                      <h3 className="font-display text-xl tracking-tight capitalize">
                        {data.label}
                      </h3>
                      <span className="text-sm text-muted">
                        {data.lessons}{" "}
                        {data.lessons === 1 ? "aula" : "aulas"} ·{" "}
                        <span className="text-ink">
                          {formatBRL(data.total)}
                        </span>
                      </span>
                    </div>
                    <ul className="divide-y divide-line">
                      {data.rows
                        .sort((a, b) => b.lessons_count - a.lessons_count)
                        .map((row) => (
                          <li
                            key={`${monthKey}-${row.teacher_id}`}
                            className="py-3 flex justify-between items-center"
                          >
                            <div>
                              <p className="font-medium">{row.teacher_name}</p>
                              <p className="text-xs text-muted mt-0.5">
                                {row.lessons_count}{" "}
                                {row.lessons_count === 1 ? "aula" : "aulas"}
                              </p>
                            </div>
                            <span className="font-display text-muted">
                              {formatBRL(row.total_spent_cents)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Container>
  );
}

function CtaCard({
  href,
  icon,
  title,
  subtitle,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "bg-ink text-paper p-6 group hover:bg-accent transition-colors"
          : "bg-paper p-6 group hover:bg-line transition-colors"
      }
    >
      <div className="flex items-center justify-between mb-6">
        {icon}
        <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
      </div>
      <h3 className="font-display text-xl tracking-tight">{title}</h3>
      <p
        className={
          primary ? "text-sm opacity-70 mt-1" : "text-sm text-muted mt-1"
        }
      >
        {subtitle}
      </p>
    </Link>
  );
}
