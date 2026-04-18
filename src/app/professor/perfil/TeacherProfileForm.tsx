"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveTeacherProfileAction, type ProfileState } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type Props = {
  initialFullName: string;
  initialBio: string;
  initialPriceCents: number;
  initialActive: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 px-8 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted inline-flex items-center gap-2"
    >
      {pending ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Salvando…
        </>
      ) : (
        "Salvar perfil"
      )}
    </button>
  );
}

export function TeacherProfileForm({
  initialFullName,
  initialBio,
  initialPriceCents,
  initialActive,
}: Props) {
  const [active, setActive] = useState(initialActive);
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveTeacherProfileAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-10 max-w-2xl">
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert variant="info" title="Perfil atualizado">
          As mudanças já estão valendo.
        </Alert>
      ) : null}

      {/* Nome */}
      <div>
        <Label htmlFor="full_name">Nome público</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={initialFullName}
          required
          error={state.fieldErrors?.full_name}
        />
        <p className="text-xs text-muted mt-1">
          É assim que os alunos verão você.
        </p>
      </div>

      {/* Bio */}
      <div>
        <Label htmlFor="bio">Sobre você</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={initialBio}
          rows={5}
          maxLength={1000}
          placeholder="Experiência, metodologia, especialidades…"
          className={cn(
            "w-full px-4 py-3 bg-paper border border-line text-ink",
            "placeholder:text-muted resize-y",
            "focus:outline-none focus:border-ink transition-colors",
            state.fieldErrors?.bio && "border-accent"
          )}
        />
        <p className="text-xs text-muted mt-1">
          Máximo 1000 caracteres. Aparece na página de agendar.
        </p>
      </div>

      {/* Preço */}
      <div>
        <Label htmlFor="hourly_price_brl">Preço por aula (R$)</Label>
        <div className="relative max-w-xs">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            R$
          </span>
          <Input
            id="hourly_price_brl"
            name="hourly_price_brl"
            type="number"
            step="5"
            min="10"
            max="2000"
            defaultValue={(initialPriceCents / 100).toFixed(0)}
            className="pl-12"
            required
            error={state.fieldErrors?.hourly_price_brl}
          />
        </div>
        <p className="text-xs text-muted mt-1">
          Valor cobrado por aula de 60 minutos.
        </p>
      </div>

      {/* Active */}
      <div>
        <Label>Status</Label>
        <label className="flex items-start gap-4 cursor-pointer select-none border border-line p-5 hover:border-ink transition-colors">
          <input
            type="checkbox"
            name="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="sr-only"
          />
          <span
            className={cn(
              "relative mt-0.5 inline-flex h-6 w-11 shrink-0 border border-ink transition-colors",
              active ? "bg-ink" : "bg-paper"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-0 h-[22px] w-[22px] transition-transform",
                active ? "translate-x-[22px] bg-accent" : "translate-x-0 bg-ink"
              )}
            />
          </span>
          <span>
            <span className="font-medium block">
              {active ? "Aceitando novos agendamentos" : "Pausado"}
            </span>
            <span className="text-sm text-muted block mt-0.5">
              {active
                ? "Seu perfil aparece na página de agendar."
                : "Seu perfil fica oculto. Aulas já agendadas continuam válidas."}
            </span>
          </span>
        </label>
      </div>

      <div className="pt-4 border-t border-line">
        <SubmitButton />
      </div>
    </form>
  );
}
