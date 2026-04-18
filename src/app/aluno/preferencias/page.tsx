import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { PreferencesForm, type TeacherOption } from "./PreferencesForm";

export const dynamic = "force-dynamic";

type TeacherRow = {
  id: string;
  hourly_price_cents: number;
  profiles: { full_name: string };
};

export default async function PreferenciasPage() {
  const { user, supabase } = await requireUser("aluno");

  // ------------------------------------------------------------------
  // Carrega preferências atuais do student
  // ------------------------------------------------------------------
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("daily_availability_email, preferred_teacher_ids")
    .eq("id", user.id)
    .single<{
      daily_availability_email: boolean;
      preferred_teacher_ids: string[];
    }>();

  if (studentError || !student) {
    return (
      <Container>
        <div className="py-10">
          <Alert variant="danger" title="Não foi possível carregar">
            {studentError?.message ?? "Perfil de aluno não encontrado."}
          </Alert>
        </div>
      </Container>
    );
  }

  // ------------------------------------------------------------------
  // Carrega professores ativos (para o seletor de favoritos)
  // ------------------------------------------------------------------
  const { data: teachersRaw } = await supabase
    .from("teachers")
    .select(`id, hourly_price_cents, profiles!inner(full_name)`)
    .eq("active", true)
    .returns<TeacherRow[]>();

  const teachers: TeacherOption[] = (teachersRaw ?? [])
    .map((t) => ({
      id: t.id,
      full_name: t.profiles.full_name,
      hourly_price_cents: t.hourly_price_cents,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));

  return (
    <Container size="md">
      <div className="py-10 md:py-16">
        <header className="mb-12">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Configurações
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Preferências
          </h1>
          <p className="text-muted mt-3 max-w-xl leading-relaxed">
            Controle o que aparece no seu e-mail e como você descobre novos
            horários.
          </p>
        </header>

        <PreferencesForm
          initialDailyEmail={student.daily_availability_email}
          initialPreferredIds={student.preferred_teacher_ids}
          teachers={teachers}
        />
      </div>
    </Container>
  );
}
