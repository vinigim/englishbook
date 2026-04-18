"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  savePreferencesAction,
  type PreferencesState,
} from "./actions";
import { Alert } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/utils";
import { Check } from "lucide-react";

export type TeacherOption = {
  id: string;
  full_name: string;
  hourly_price_cents: number;
};

type Props = {
  initialDailyEmail: boolean;
  initialPreferredIds: string[];
  teachers: TeacherOption[];
};

function SubmitButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className={cn(
        "h-12 px-8 bg-ink text-paper font-medium inline-flex items-center justify-center gap-2",
        "hover:bg-accent transition-colors",
        "disabled:bg-muted disabled:cursor-not-allowed"
      )}
    >
      {pending ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Salvando…
        </>
      ) : (
        "Salvar preferências"
      )}
    </button>
  );
}

export function PreferencesForm({
  initialDailyEmail,
  initialPreferredIds,
  teachers,
}: Props) {
  const [dailyEmail, setDailyEmail] = useState(initialDailyEmail);
  const [preferredIds, setPreferredIds] = useState<Set<string>>(
    new Set(initialPreferredIds)
  );

  const [state, formAction] = useActionState<PreferencesState, FormData>(
    savePreferencesAction,
    {}
  );

  const initialIdsKey = [...initialPreferredIds].sort().join(",");
  const currentIdsKey = [...preferredIds].sort().join(",");
  const dirty =
    dailyEmail !== initialDailyEmail || currentIdsKey !== initialIdsKey;

  function toggleTeacher(id: string) {
    const next = new Set(preferredIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setPreferredIds(next);
  }

  return (
    <form action={formAction} className="space-y-12">
      {/* Mensagens */}
      {state.error ? (
        <Alert variant="danger">{state.error}</Alert>
      ) : null}
      {state.ok ? (
        <Alert variant="info" title="Salvo">
          Suas preferências foram atualizadas.
        </Alert>
      ) : null}

      {/* ========================================================== */}
      {/* OPT-IN DE E-MAIL DIÁRIO */}
      {/* ========================================================== */}
      <section>
        <h2 className="font-display text-2xl tracking-tight mb-2">
          E-mail diário de disponibilidade
        </h2>
        <p className="text-muted mb-6 leading-relaxed max-w-2xl">
          Receba todas as manhãs um resumo dos novos horários abertos pelos
          seus professores favoritos. Você pode cancelar quando quiser.
        </p>

        <label className="flex items-start gap-4 cursor-pointer select-none border border-line p-5 hover:border-ink transition-colors">
          {/* Toggle visual custom */}
          <input
            type="checkbox"
            name="daily_availability_email"
            checked={dailyEmail}
            onChange={(e) => setDailyEmail(e.target.checked)}
            className="sr-only peer"
          />
          <span
            className={cn(
              "relative mt-0.5 inline-flex h-6 w-11 shrink-0 border border-ink transition-colors",
              dailyEmail ? "bg-ink" : "bg-paper"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-0 h-[22px] w-[22px] transition-transform",
                dailyEmail
                  ? "translate-x-[22px] bg-accent"
                  : "translate-x-0 bg-ink"
              )}
            />
          </span>
          <span>
            <span className="font-medium block">
              Quero receber o e-mail diário
            </span>
            <span className="text-sm text-muted block mt-0.5">
              Enviado por volta das 8h no seu fuso horário.
            </span>
          </span>
        </label>
      </section>

      {/* ========================================================== */}
      {/* PROFESSORES PREFERIDOS */}
      {/* ========================================================== */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-2xl tracking-tight">
            Professores favoritos
          </h2>
          <span className="text-sm text-muted">
            {preferredIds.size} selecionado{preferredIds.size === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-muted mb-6 leading-relaxed max-w-2xl">
          Se você marcar alguns professores como favoritos, o e-mail diário
          traz apenas os horários deles. Caso contrário, traz de todos.
        </p>

        {teachers.length === 0 ? (
          <p className="text-muted italic">
            Nenhum professor disponível no momento.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {teachers.map((t) => {
              const checked = preferredIds.has(t.id);
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center justify-between gap-3 p-4 cursor-pointer border transition-colors",
                    checked
                      ? "border-ink bg-ink text-paper"
                      : "border-line hover:border-ink"
                  )}
                >
                  {/* Input real escondido, enviado no submit */}
                  <input
                    type="checkbox"
                    name="preferred_teacher_ids"
                    value={t.id}
                    checked={checked}
                    onChange={() => toggleTeacher(t.id)}
                    className="sr-only"
                  />
                  <div>
                    <p className="font-medium">{t.full_name}</p>
                    <p
                      className={cn(
                        "text-xs mt-0.5",
                        checked ? "opacity-70" : "text-muted"
                      )}
                    >
                      {formatBRL(t.hourly_price_cents)} / aula
                    </p>
                  </div>
                  <span
                    className={cn(
                      "w-6 h-6 border inline-flex items-center justify-center shrink-0",
                      checked
                        ? "bg-accent border-accent text-paper"
                        : "bg-paper border-ink"
                    )}
                    aria-hidden
                  >
                    {checked ? <Check className="w-4 h-4" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================== */}
      {/* FOOTER STICKY DE AÇÕES */}
      {/* ========================================================== */}
      <div className="sticky bottom-0 -mx-6 md:-mx-10 px-6 md:px-10 py-4 bg-paper border-t border-line flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {dirty
            ? "Você tem alterações não salvas."
            : "Tudo salvo."}
        </p>
        <SubmitButton dirty={dirty} />
      </div>
    </form>
  );
}
