"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { loginAction, type AuthState } from "../actions";
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

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    loginAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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
          error={state.fieldErrors?.email}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="password" className="mb-0">
            Senha
          </Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted hover:text-ink"
          >
            Esqueci
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-muted pt-2">
        Não tem conta ainda?{" "}
        <Link href="/signup" className="text-ink link-underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
