import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Mail } from "lucide-react";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <Container size="sm">
      <div className="max-w-md mx-auto w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-ink text-paper mb-8">
          <Mail className="w-7 h-7" />
        </div>
        <h1 className="font-display text-4xl tracking-tight mb-4">
          Confira seu e-mail
        </h1>
        <p className="text-muted leading-relaxed">
          Enviamos um link de confirmação para{" "}
          {email ? (
            <span className="text-ink font-medium">{email}</span>
          ) : (
            "o seu endereço"
          )}
          . Clique no link para ativar sua conta e começar.
        </p>
        <p className="text-sm text-muted mt-8">
          Não recebeu?{" "}
          <Link href="/signup" className="text-ink link-underline">
            Tentar novamente
          </Link>
        </p>
      </div>
    </Container>
  );
}
