"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  requestPasswordResetAction,
  type ForgotState,
} from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-12 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted"
    >
      {pending ? "Enviando…" : "Enviar link de recuperação"}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState<ForgotState, FormData>(
    requestPasswordResetAction,
    {}
  );

  if (state.ok) {
    return (
      <Alert variant="info" title="Link enviado">
        Se existir uma conta com esse e-mail, você receberá um link para
        redefinir sua senha nos próximos minutos.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-ink link-underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
