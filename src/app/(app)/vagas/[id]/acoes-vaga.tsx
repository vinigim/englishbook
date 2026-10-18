"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { arquivarVaga, marcarRelevante } from "@/app/actions";
import { Button } from "@/components/ui";

export function AcoesVaga({ id, arquivada, descartada }: { id: string; arquivada: boolean; descartada: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const rodar = (fn: () => Promise<unknown>) => iniciar(async () => { await fn(); router.refresh(); });

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      {descartada && (
        <Button variante="secundario" disabled={pendente} onClick={() => rodar(() => marcarRelevante(id))}>
          A triagem errou: marcar como relevante
        </Button>
      )}
      <Button variante="fantasma" disabled={pendente} onClick={() => rodar(() => arquivarVaga(id, !arquivada))}>
        {arquivada ? "Desarquivar" : "Arquivar (não me interessa)"}
      </Button>
    </div>
  );
}
