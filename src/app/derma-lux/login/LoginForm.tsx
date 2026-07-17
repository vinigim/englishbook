"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { dlLogin, type LoginState } from "../auth-actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-12 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Entrando…
        </>
      ) : (
        "Entrar"
      )}
    </button>
  );
}

export function DlLoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(dlLogin, {});

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <Alert variant="danger" title="Não foi possível entrar">
          {state.error}
        </Alert>
      ) : null}

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-muted pt-1">
        Os acessos são criados pelo administrador no painel do Supabase.
      </p>
    </form>
  );
}
