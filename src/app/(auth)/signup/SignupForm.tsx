"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { signupAction, type AuthState } from "../actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

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
          Criando conta…
        </>
      ) : (
        "Criar conta"
      )}
    </button>
  );
}

export function SignupForm({ initialRole }: { initialRole: UserRole }) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [state, formAction] = useActionState<AuthState, FormData>(
    signupAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="role" value={role} />

      {state.error ? (
        <Alert variant="danger" title="Erro ao criar conta">
          {state.error}
        </Alert>
      ) : null}

      {/* Toggle de role */}
      <div>
        <Label>Eu quero…</Label>
        <div className="grid grid-cols-2 gap-0 border border-ink">
          <RoleOption
            active={role === "aluno"}
            label="Ter aulas"
            sublabel="Sou aluno"
            onClick={() => setRole("aluno")}
          />
          <RoleOption
            active={role === "professor"}
            label="Dar aulas"
            sublabel="Sou professor"
            onClick={() => setRole("professor")}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="full_name">Nome completo</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          error={state.fieldErrors?.full_name}
        />
      </div>

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
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          error={state.fieldErrors?.password}
        />
        <p className="text-xs text-muted mt-1">Mínimo 6 caracteres.</p>
      </div>

      <SubmitButton />

      <p className="text-xs text-muted text-center leading-relaxed">
        Ao criar uma conta, você concorda com nossos{" "}
        <Link href="/termos" className="underline">
          Termos
        </Link>{" "}
        e com a{" "}
        <Link href="/privacidade" className="underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <p className="text-center text-sm text-muted border-t border-line pt-5">
        Já tem conta?{" "}
        <Link href="/login" className="text-ink link-underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

function RoleOption({
  active,
  label,
  sublabel,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-4 text-left transition-colors",
        active
          ? "bg-ink text-paper"
          : "bg-paper text-ink hover:bg-line"
      )}
    >
      <p className="font-display text-xl tracking-tight">{label}</p>
      <p
        className={cn(
          "text-xs tracking-wide uppercase mt-1",
          active ? "opacity-70" : "text-muted"
        )}
      >
        {sublabel}
      </p>
    </button>
  );
}
