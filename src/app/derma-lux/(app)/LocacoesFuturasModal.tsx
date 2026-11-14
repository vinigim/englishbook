"use client";

import { useEffect, useMemo, useState } from "react";
import type { Equipment, Rental } from "../types";
import { resumoLocacoesFuturas, todayStr } from "../shared";

/**
 * Todas as locações de hoje em diante, com todos os dados, em texto pronto
 * para o WhatsApp (o app pede o contato). Os valores podem sair do texto
 * quando a mensagem vai para quem não deve vê-los.
 */
export function LocacoesFuturasModal({
  open,
  onClose,
  rentals,
  equipment,
}: {
  open: boolean;
  onClose: () => void;
  rentals: Rental[];
  equipment: Equipment[];
}) {
  const [valores, setValores] = useState(true);
  const gerado = useMemo(
    () =>
      resumoLocacoesFuturas(
        rentals,
        new Map(equipment.map((e) => [e.id, e.name])),
        todayStr(),
        { valores }
      ),
    [rentals, equipment, valores]
  );
  const [texto, setTexto] = useState(gerado.texto);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTexto(gerado.texto);
      setCopiado(false);
      setErro(null);
    }
  }, [open, gerado]);

  if (!open) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione o texto e copie à mão.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-paper border border-line shadow-[6px_6px_0_0_rgba(26,26,26,0.12)] w-full max-w-xl p-6 mt-8">
        <h2 className="font-display text-2xl tracking-tight mb-1">
          Locações futuras
        </h2>
        <p className="text-sm text-muted mb-4">
          {gerado.total === 0
            ? "Nenhuma locação marcada de hoje em diante."
            : `${gerado.total} ${
                gerado.total === 1 ? "locação" : "locações"
              } de hoje em diante. Dá para ajustar o texto antes de mandar.`}
        </p>

        <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={valores}
            onChange={(e) => setValores(e.target.checked)}
            className="w-4 h-4 accent-[#1c3d31]"
          />
          Incluir valor da técnica especializada
        </label>

        {/* text-base no celular: abaixo de 16px o Safari dá zoom no foco. */}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={16}
          className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none resize-y"
        />

        {erro ? <p className="text-sm text-accent font-medium mt-2">{erro}</p> : null}

        <div className="flex flex-wrap justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 text-ink hover:bg-line transition-colors font-medium"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={copiar}
            className="h-11 px-5 bg-paper text-ink border border-ink font-medium hover:bg-ink hover:text-paper transition-colors"
          >
            {copiado ? "Copiado!" : "Copiar"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors inline-flex items-center"
          >
            Enviar no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
