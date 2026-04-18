import { Container } from "@/components/ui/Container";
import { SignupForm } from "./SignupForm";
import type { UserRole } from "@/lib/types";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const initialRole: UserRole = role === "professor" ? "professor" : "aluno";

  return (
    <Container size="sm">
      <div className="max-w-md mx-auto w-full">
        <div className="mb-10">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Começe agora
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Criar sua conta
          </h1>
          <p className="text-muted mt-3">
            Leva menos de um minuto. Sem cartão de crédito.
          </p>
        </div>
        <SignupForm initialRole={initialRole} />
      </div>
    </Container>
  );
}
