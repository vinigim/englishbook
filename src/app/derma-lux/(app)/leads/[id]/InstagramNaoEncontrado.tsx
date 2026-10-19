"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { relativeDays } from "../../../leads-shared";
import { marcarInstagramNaoEncontrado } from "../../../leads-actions";

/**
 * "Instagram não encontrado", para lead sem @.
 *
 * Fica logo abaixo da busca: é o fim dela quando nem a IA nem os @ prováveis
 * deram em nada. Marcado, o lead sai de "Sem Instagram" e da fila da busca em
 * lote; "desfazer" o devolve.
 */
export function InstagramNaoEncontrado({
  leadId,
  marcadoEm,
}: {
  leadId: string;
  marcadoEm: string | null;
}) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function marcar(naoEncontrado: boolean) {
    setErro(null);
    startSalvar(async () => {
      const r = await marcarInstagramNaoEncontrado(leadId, naoEncontrado);
      if (!r.ok) setErro(r.error ?? "Não consegui salvar.");
      else router.refresh();
    });
  }

  return (
    <p className="text-xs text-muted">
      {marcadoEm ? (
        <>
          Instagram não encontrado — marcado {relativeDays(marcadoEm)}.{" "}
          <button
            type="button"
            onClick={() => marcar(false)}
            disabled={salvando}
            className="underline hover:text-ink"
          >
            desfazer
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => marcar(true)}
          disabled={salvando}
          className="underline hover:text-ink"
        >
          Não achei o Instagram — marcar como não encontrado
        </button>
      )}
      {erro ? <span className="block text-accent font-medium">{erro}</span> : null}
    </p>
  );
}
