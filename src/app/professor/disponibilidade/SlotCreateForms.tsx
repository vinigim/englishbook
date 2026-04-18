"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSingleSlotAction,
  createBulkSlotsAction,
  type AvailabilityState,
} from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const WEEKDAYS: { idx: string; label: string; short: string }[] = [
  { idx: "1", label: "Segunda", short: "Seg" },
  { idx: "2", label: "Terça", short: "Ter" },
  { idx: "3", label: "Quarta", short: "Qua" },
  { idx: "4", label: "Quinta", short: "Qui" },
  { idx: "5", label: "Sexta", short: "Sex" },
  { idx: "6", label: "Sábado", short: "Sáb" },
  { idx: "0", label: "Domingo", short: "Dom" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted inline-flex items-center gap-2"
    >
      {pending ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Criando…
        </>
      ) : (
        label
      )}
    </button>
  );
}

// =================================================================
// FORM ÚNICO
// =================================================================
function SingleSlotForm() {
  const [state, formAction] = useActionState<AvailabilityState, FormData>(
    createSingleSlotAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert variant="info">Horário criado com sucesso.</Alert>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="single-date">Data</Label>
          <Input
            id="single-date"
            name="date"
            type="date"
            min={todayISO()}
            required
            error={state.fieldErrors?.date}
          />
        </div>
        <div>
          <Label htmlFor="single-time">Hora de início</Label>
          <Input
            id="single-time"
            name="time"
            type="time"
            step={300}
            required
            error={state.fieldErrors?.time}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="single-duration">Duração</Label>
        <select
          id="single-duration"
          name="duration_minutes"
          defaultValue="60"
          className="w-full h-11 px-4 bg-paper border border-line text-ink focus:outline-none focus:border-ink"
        >
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">60 minutos</option>
          <option value="90">90 minutos</option>
          <option value="120">120 minutos</option>
        </select>
      </div>

      <Submit label="Criar horário" />
    </form>
  );
}

// =================================================================
// FORM RECORRENTE
// =================================================================
function BulkSlotForm() {
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [state, formAction] = useActionState<AvailabilityState, FormData>(
    createBulkSlotsAction,
    {}
  );

  function toggleDay(idx: string) {
    const next = new Set(selectedDays);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedDays(next);
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok && state.created !== undefined ? (
        <Alert variant="info" title="Horários criados">
          {state.created === 0
            ? "Nenhum horário novo foi adicionado (todos já existiam)."
            : `${state.created} horário${state.created === 1 ? "" : "s"} adicionado${state.created === 1 ? "" : "s"} à sua agenda.`}
        </Alert>
      ) : null}

      {/* Dias da semana */}
      <div>
        <Label>Dias da semana</Label>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => {
            const active = selectedDays.has(d.idx);
            return (
              <label key={d.idx} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="days_of_week"
                  value={d.idx}
                  checked={active}
                  onChange={() => toggleDay(d.idx)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex items-center justify-center h-11 text-sm border transition-colors",
                    active
                      ? "bg-ink text-paper border-ink"
                      : "bg-paper text-ink border-line hover:border-ink"
                  )}
                >
                  {d.short}
                </span>
              </label>
            );
          })}
        </div>
        {state.fieldErrors?.days_of_week ? (
          <p className="text-accent text-sm mt-1">
            {state.fieldErrors.days_of_week}
          </p>
        ) : null}
      </div>

      {/* Hora + duração */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="bulk-time">Hora de início</Label>
          <Input
            id="bulk-time"
            name="time"
            type="time"
            step={300}
            required
            error={state.fieldErrors?.time}
          />
        </div>
        <div>
          <Label htmlFor="bulk-duration">Duração</Label>
          <select
            id="bulk-duration"
            name="duration_minutes"
            defaultValue="60"
            className="w-full h-11 px-4 bg-paper border border-line text-ink focus:outline-none focus:border-ink"
          >
            <option value="30">30 minutos</option>
            <option value="45">45 minutos</option>
            <option value="60">60 minutos</option>
            <option value="90">90 minutos</option>
            <option value="120">120 minutos</option>
          </select>
        </div>
      </div>

      {/* Janela */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="bulk-start">A partir de</Label>
          <Input
            id="bulk-start"
            name="start_date"
            type="date"
            defaultValue={todayISO()}
            min={todayISO()}
            required
            error={state.fieldErrors?.start_date}
          />
        </div>
        <div>
          <Label htmlFor="bulk-weeks">Por quantas semanas</Label>
          <select
            id="bulk-weeks"
            name="weeks"
            defaultValue="4"
            className="w-full h-11 px-4 bg-paper border border-line text-ink focus:outline-none focus:border-ink"
          >
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "semana" : "semanas"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Submit label={`Criar ${selectedDays.size > 0 ? `× ${selectedDays.size} por semana` : "horários"}`} />
    </form>
  );
}

// =================================================================
// WRAPPER COM TABS
// =================================================================
export function SlotCreateForms() {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  return (
    <div className="border border-line">
      {/* Tabs */}
      <div className="grid grid-cols-2 border-b border-line">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={cn(
            "p-4 text-center transition-colors text-sm",
            mode === "single"
              ? "bg-ink text-paper"
              : "bg-paper text-muted hover:text-ink"
          )}
        >
          <span className="block font-display text-lg tracking-tight">
            Um horário
          </span>
          <span className="text-xs opacity-70">Pontual</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={cn(
            "p-4 text-center transition-colors text-sm",
            mode === "bulk"
              ? "bg-ink text-paper"
              : "bg-paper text-muted hover:text-ink"
          )}
        >
          <span className="block font-display text-lg tracking-tight">
            Em lote
          </span>
          <span className="text-xs opacity-70">Recorrente semanal</span>
        </button>
      </div>

      <div className="p-6">
        {mode === "single" ? <SingleSlotForm /> : <BulkSlotForm />}
      </div>
    </div>
  );
}
