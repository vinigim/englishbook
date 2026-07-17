"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipment } from "../types";
import { PALETTE } from "../shared";
import { saveEquipment } from "../actions";

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: Equipment | null;
  defaultColor: string;
};

export function EquipModal({ open, onClose, initial, defaultColor }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [use, setUse] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setUse(initial?.use ?? "");
      setColor(initial?.color ?? defaultColor);
      setError(null);
      setSaving(false);
    }
  }, [open, initial, defaultColor]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await saveEquipment({
      id: initial?.id ?? null,
      name,
      use,
      color,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Não foi possível salvar.");
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
      <div className="bg-paper border border-line shadow-[6px_6px_0_0_rgba(26,26,26,0.12)] w-full max-w-md p-6 mt-12">
        <h2 className="font-display text-2xl tracking-tight mb-1">
          {initial ? "Editar equipamento" : "Novo equipamento"}
        </h2>
        <p className="text-sm text-muted mb-5">
          Dê um nome ao laser e escolha uma cor para identificá-lo na agenda.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Nome do equipamento *
            </span>
            <input
              className={inputCls}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Laser CO2 Fracionado"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Tipo / indicação (opcional)
            </span>
            <input
              className={inputCls}
              value={use}
              onChange={(e) => setUse(e.target.value)}
              placeholder="Ex.: Rejuvenescimento, depilação…"
            />
          </label>

          <div>
            <span className="block text-sm font-medium text-ink mb-1.5">
              Cor de identificação
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 border-2 ${
                    color.toLowerCase() === c.toLowerCase()
                      ? "border-ink"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 p-0.5 border border-line bg-paper cursor-pointer"
              />
            </div>
          </div>

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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full h-11 px-3 bg-paper border border-line text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors";
