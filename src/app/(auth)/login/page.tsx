import { Container } from "@/components/ui/Container";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Container size="sm">
      <div className="max-w-md mx-auto w-full">
        <div className="mb-10">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Bem-vindo de volta
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Entrar na sua conta
          </h1>
        </div>
        <LoginForm next={next} />
      </div>
    </Container>
  );
}
