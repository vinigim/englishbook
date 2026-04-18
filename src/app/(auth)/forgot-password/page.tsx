import { Container } from "@/components/ui/Container";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <Container size="sm">
      <div className="max-w-md mx-auto w-full">
        <div className="mb-10">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Recuperar acesso
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Redefinir senha
          </h1>
          <p className="text-muted mt-3">
            Digite o e-mail da sua conta. Vamos enviar um link pra você criar
            uma nova senha.
          </p>
        </div>
        <ForgotForm />
      </div>
    </Container>
  );
}
