"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipment, BlockPeriod } from "../types";
import { createBlock } from "../actions";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const inputCls =
  "w-full h-11 px-3 bg-paper border border-line text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors";

export function BlockModal({
  open,
  onClose,
  equipment,
  prefillDate,
}: {
  open: boolean;
  onClose: () => void;
  equipment: Equipment[];
  prefillDate?: string;
}) {
  const router = useRouter();
  const [equipId, setEquipId] = useState(equipment[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [period, setPeriod] = useState<BlockPeriod>("full");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEquipId(equipment[0]?.id ?? "");
      setDate(prefillDate ?? todayStr());
      setPeriod("full");
      setNote("");
      setError(null);
      setSaving(false);
    }
  }, [open, equipment, prefillDate]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await createBlock({ equip_id: equipId, date, period, note });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Não foi possível fechar a agenda.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-paper border border-line shadow-[6px_6px_0_0_rgba(26,26,26,0.12)] w-full max-w-md p-6 mt-10">
        <h2 className="font-display text-2xl tracking-tight mb-1">
          Fechar agenda
        </h2>
        <p className="text-sm text-muted mb-5">
          Bloqueie o equipamento num dia (mesmo sem aluguel) — por manutenção,
          folga, etc.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Equipamento (laser) *
            </span>
            <select
              className={inputCls}
              required
              value={equipId}
              onChange={(e) => setEquipId(e.target.value)}
            >
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Data *
            </span>
            <input
              type="date"
              className={inputCls}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <div>
            <span className="block text-sm font-medium text-ink mb-1.5">
              Período *
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { v: "full", label: "Dia todo" },
                  { v: "morning", label: "Manhã" },
                  { v: "afternoon", label: "Tarde" },
                ] as { v: BlockPeriod; label: string }[]
              ).map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setPeriod(opt.v)}
                  className={`h-11 border font-medium text-sm transition-colors ${
                    period === opt.v
                      ? "bg-ink text-paper border-ink"
                      : "bg-paper text-ink border-line hover:border-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Motivo (opcional)
            </span>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: Manutenção, folga…"
            />
          </label>

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
              Fechar agenda
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
