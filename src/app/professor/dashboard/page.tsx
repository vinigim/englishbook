import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime, formatBRL } from "@/lib/utils";
import { Calendar, Clock, ArrowRight, DollarSign } from "lucide-react";

export const dynamic = "force-dynamic";

type UpcomingBooking = {
  id: string;
  price_cents: number;
  scheduled_start_at: string;
  profiles: { full_name: string } | null;
};

type MonthBooking = {
  id: string;
  price_cents: number;
  scheduled_start_at: string;
};

export default async function ProfessorDashboard() {
  const { user, profile, supabase } = await requireUser("professor");
  const firstName = profile.full_name.split(" ")[0];
  const now = new Date();
  const nowIso = now.toISOString();

  // ------------------------------------------------------------------
  // Dados do teacher (preço, active)
  // ------------------------------------------------------------------
  const { data: teacher } = await supabase
    .from("teachers")
    .select("hourly_price_cents, active, bio")
    .eq("id", user.id)
    .single<{ hourly_price_cents: number; active: boolean; bio: string | null }>();

  // ------------------------------------------------------------------
  // Próximas 5 aulas
  // ------------------------------------------------------------------
  const { data: upcoming } = await supabase
    .from("bookings")
    .select(`id, price_cents, scheduled_start_at, profiles:student_id(full_name)`)
    .eq("teacher_id", user.id)
    .eq("status", "confirmed")
    .gte("scheduled_start_at", nowIso)
    .order("scheduled_start_at", { ascending: true })
    .limit(5)
    .returns<UpcomingBooking[]>();

  // ------------------------------------------------------------------
  // Ganhos do mês corrente (soma de confirmed+completed no mês)
  // ------------------------------------------------------------------
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  ).toISOString();

  const { data: thisMonth } = await supabase
    .from("bookings")
    .select("id, price_cents, scheduled_start_at")
    .eq("teacher_id", user.id)
    .in("status", ["confirmed", "completed"])
    .gte("scheduled_start_at", startOfMonth)
    .lt("scheduled_start_at", startOfNextMonth)
    .returns<MonthBooking[]>();

  const monthEarnings = (thisMonth ?? []).reduce(
    (sum, b) => sum + b.price_cents,
    0
  );
  const monthLessons = (thisMonth ?? []).length;

  // ------------------------------------------------------------------
  // Slots livres nos próximos 7 dias (ajuda a ver se precisa abrir mais)
  // ------------------------------------------------------------------
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: freeSlotsNext7 } = await supabase
    .from("availability_slots")
    .select("*", { count: "exact", head: true })
    .eq("teacher_id", user.id)
    .eq("status", "available")
    .gte("start_at", nowIso)
    .lte("start_at", in7Days);

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-12 flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
              Bem-vindo, {firstName}
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              Seu painel.
            </h1>
          </div>
          {teacher && !teacher.active ? (
            <Badge variant="warning">Perfil pausado</Badge>
          ) : null}
        </header>

        {/* Aviso de perfil incompleto */}
        {teacher && !teacher.bio ? (
          <div className="mb-10 p-5 border-l-4 border-accent bg-paper">
            <p className="font-medium">Seu perfil ainda não tem uma bio.</p>
            <p className="text-sm text-muted mt-1">
              Uma boa bio triplica as chances de um aluno te escolher.{" "}
              <Link
                href="/professor/perfil"
                className="text-ink link-underline"
              >
                Preencher agora
              </Link>
            </p>
          </div>
        ) : null}

        {/* MÉTRICAS */}
        <div className="grid sm:grid-cols-3 gap-px bg-line mb-16">
          <MetricCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Ganhos do mês"
            value={formatBRL(monthEarnings)}
            sublabel={`${monthLessons} ${monthLessons === 1 ? "aula agendada" : "aulas agendadas"}`}
          />
          <MetricCard
            icon={<Calendar className="w-5 h-5" />}
            label="Próximas aulas"
            value={String(upcoming?.length ?? 0)}
            sublabel="confirmadas"
          />
          <MetricCard
            icon={<Clock className="w-5 h-5" />}
            label="Horários livres"
            value={String(freeSlotsNext7 ?? 0)}
            sublabel="próximos 7 dias"
            cta={
              (freeSlotsNext7 ?? 0) < 3
                ? {
                    href: "/professor/disponibilidade",
                    label: "Adicionar mais",
                  }
                : undefined
            }
          />
        </div>

        <div className="grid lg:grid-cols-5 gap-10">
          {/* PRÓXIMAS AULAS */}
          <section className="lg:col-span-3">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl tracking-tight">
                Próximas aulas
              </h2>
              <Link
                href="/professor/agenda"
                className="text-sm text-muted hover:text-ink"
              >
                Ver agenda completa
              </Link>
            </div>
            {!upcoming || upcoming.length === 0 ? (
              <div className="border border-dashed border-line p-6">
                <p className="text-muted italic mb-4">
                  Nenhuma aula agendada por enquanto.
                </p>
                <Link
                  href="/professor/disponibilidade"
                  className="inline-flex items-center gap-2 text-ink link-underline"
                >
                  Abrir mais horários
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {upcoming.map((b) => (
                  <li key={b.id} className="py-4 flex justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {b.profiles?.full_name ?? "Aluno"}
                      </p>
                      <p className="text-sm text-muted mt-0.5">
                        {formatDateTime(b.scheduled_start_at)}
                      </p>
                    </div>
                    <span className="font-display text-muted">
                      {formatBRL(b.price_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* CTAS */}
          <section className="lg:col-span-2 space-y-px bg-line">
            <CtaBlock
              href="/professor/disponibilidade"
              title="Abrir horários"
              description="Adicione disponibilidade pontual ou recorrente"
              primary
            />
            <CtaBlock
              href="/professor/agenda"
              title="Ver agenda"
              description="Todas as aulas passadas e futuras"
            />
            <CtaBlock
              href="/professor/perfil"
              title="Editar perfil"
              description={
                teacher
                  ? `Preço atual: ${formatBRL(teacher.hourly_price_cents)}`
                  : "Bio, preço e status"
              }
            />
          </section>
        </div>
      </div>
    </Container>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sublabel,
  cta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="bg-paper p-6">
      <div className="flex items-center gap-2 text-muted mb-4">
        {icon}
        <span className="text-xs tracking-[0.2em] uppercase">{label}</span>
      </div>
      <p className="font-display text-4xl tracking-tight">{value}</p>
      {sublabel ? (
        <p className="text-sm text-muted mt-1">{sublabel}</p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          className="text-sm text-accent link-underline mt-3 inline-block"
        >
          {cta.label} →
        </Link>
      ) : null}
    </div>
  );
}

function CtaBlock({
  href,
  title,
  description,
  primary = false,
}: {
  href: string;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "block p-5 bg-ink text-paper hover:bg-accent transition-colors group"
          : "block p-5 bg-paper hover:bg-line transition-colors group"
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-lg tracking-tight">{title}</p>
          <p
            className={
              primary ? "text-sm opacity-70 mt-1" : "text-sm text-muted mt-1"
            }
          >
            {description}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
      </div>
    </Link>
  );
}
