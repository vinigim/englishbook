"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipment, Rental } from "../types";
import { checkConflict, minutes, parseBRL, fmtBRL } from "../shared";
import { saveRental } from "../actions";

export type RentalPrefill = {
  date?: string;
  equip_id?: string;
  start_time?: string;
  end_time?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  equipment: Equipment[];
  rentals: Rental[];
  initial?: Rental | null;
  prefill?: RentalPrefill;
};

type FormState = {
  client: string;
  address: string;
  phone: string;
  equip_id: string;
  date: string;
  start_time: string;
  end_time: string;
  price: string;
  notes: string;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function buildInitial(
  equipment: Equipment[],
  initial?: Rental | null,
  prefill?: RentalPrefill
): FormState {
  if (initial) {
    return {
      client: initial.client,
      address: initial.address,
      phone: initial.phone ?? "",
      equip_id: initial.equip_id ?? "",
      date: initial.date,
      start_time: initial.start_time,
      end_time: initial.end_time,
      price: initial.price != null ? String(initial.price).replace(".", ",") : "",
      notes: initial.notes ?? "",
    };
  }
  return {
    client: "",
    address: "",
    phone: "",
    equip_id: prefill?.equip_id ?? equipment[0]?.id ?? "",
    date: prefill?.date ?? todayStr(),
    start_time: prefill?.start_time ?? "",
    end_time: prefill?.end_time ?? "",
    price: "",
    notes: "",
  };
}

export function RentalModal({
  open,
  onClose,
  equipment,
  rentals,
  initial,
  prefill,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    buildInitial(equipment, initial, prefill)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitial(equipment, initial, prefill));
      setError(null);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, prefill]);

  if (!open) return null;

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const conflict =
    form.equip_id &&
    form.date &&
    form.start_time &&
    form.end_time &&
    minutes(form.end_time) > minutes(form.start_time) &&
    checkConflict(
      rentals,
      form.equip_id,
      form.date,
      form.start_time,
      form.end_time,
      initial?.id
    );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (minutes(form.end_time) <= minutes(form.start_time)) {
      setError("O horário de término deve ser depois do início.");
      return;
    }
    if (
      conflict &&
      !confirm(
        "Este horário conflita com outro aluguel do mesmo equipamento. Deseja salvar mesmo assim?"
      )
    ) {
      return;
    }

    setSaving(true);
    const res = await saveRental({
      id: initial?.id ?? null,
      client: form.client,
      address: form.address,
      phone: form.phone,
      equip_id: form.equip_id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      price: parseBRL(form.price),
      notes: form.notes,
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.error ?? "Não foi possível salvar.");
      return;
    }
    router.refresh();
    onClose();
  }

  const priceNumber = parseBRL(form.price);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-paper border border-line shadow-[6px_6px_0_0_rgba(26,26,26,0.12)] w-full max-w-xl p-6 mt-8">
        <h2 className="font-display text-2xl tracking-tight mb-1">
          {initial ? "Editar aluguel" : "Novo aluguel"}
        </h2>
        <p className="text-sm text-muted mb-5">
          Preencha os dados do aluguel do laser.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome do cliente *">
            <input
              className={inputCls}
              required
              value={form.client}
              onChange={(e) => set("client", e.target.value)}
              placeholder="Dr. João Silva / Clínica Estética…"
            />
          </Field>

          <Field label="Endereço *">
            <input
              className={inputCls}
              required
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Rua, número, bairro, cidade"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Telefone / contato">
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </Field>
            <Field label="Equipamento (laser) *">
              <select
                className={inputCls}
                required
                value={form.equip_id}
                onChange={(e) => set("equip_id", e.target.value)}
              >
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Data *">
              <input
                type="date"
                className={inputCls}
                required
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="Início *">
              <input
                type="time"
                className={inputCls}
                required
                value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)}
              />
            </Field>
            <Field label="Término *">
              <input
                type="time"
                className={inputCls}
                required
                value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Valor do aluguel (R$)">
              <input
                className={inputCls}
                inputMode="decimal"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="Ex.: 850,00"
              />
              {priceNumber != null ? (
                <p className="text-xs text-muted mt-1">{fmtBRL(priceNumber)}</p>
              ) : null}
            </Field>
            <Field label="Observações">
              <input
                className={inputCls}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Opcional"
              />
            </Field>
          </div>

          {conflict ? (
            <p className="text-sm text-accent font-medium">
              ⚠️ Atenção: este horário conflita com outro aluguel deste equipamento.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-accent font-medium">{error}</p>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 text-ink hover:bg-line transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted inline-flex items-center gap-2"
            >
              {saving ? (
                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : null}
              Salvar aluguel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full h-11 px-3 bg-paper border border-line text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1.5 tracking-tight">
        {label}
      </span>
      {children}
    </label>
  );
}
