import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { TeacherProfileForm } from "./TeacherProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const { profile, supabase } = await requireUser("professor");

  const { data: teacher, error } = await supabase
    .from("teachers")
    .select("bio, hourly_price_cents, active")
    .eq("id", profile.id)
    .single<{ bio: string | null; hourly_price_cents: number; active: boolean }>();

  if (error || !teacher) {
    return (
      <Container>
        <div className="py-10">
          <Alert variant="danger" title="Erro">
            {error?.message ?? "Perfil não encontrado."}
          </Alert>
        </div>
      </Container>
    );
  }

  return (
    <Container size="md">
      <div className="py-10 md:py-16">
        <header className="mb-12">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Seu perfil público
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Como os alunos veem você
          </h1>
        </header>

        <TeacherProfileForm
          initialFullName={profile.full_name}
          initialBio={teacher.bio ?? ""}
          initialPriceCents={teacher.hourly_price_cents}
          initialActive={teacher.active}
        />
      </div>
    </Container>
  );
}
