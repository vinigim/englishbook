"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  itemFeito,
  SECAO_DICA,
  SECAO_LABEL,
  SECOES,
  type FilaDoDia as Fila,
  type Secao,
} from "../../fila-do-dia";
import { leadDisplayName } from "../../leads-shared";
import type { LeadInboxRow } from "../../leads-types";
import { montarFilaDoDiaAgora } from "../../leads-actions";
import { marcarLeadAbertoDoRadar } from "./filtros-radar";

/**
 * Fila do dia, no topo do Radar. A lista vem pronta das 6h (`fila_do_dia`);
 * o "feito" é calculado aqui, com os leads ao vivo: mensagem nossa depois da
 * montagem, ou o lead tirado do jogo. Ver `itemFeito()`.
 */
export function FilaDoDia({
  fila,
  rows,
}: {
  fila: Fila | null;
  rows: LeadInboxRow[];
}) {
  const router = useRouter();
  const [montando, startMontar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const porId = useMemo(() => new Map(rows.map((r) => [r.lead.id, r])), [rows]);

  const secoes = useMemo(() => {
    if (!fila) return [];
    return SECOES.map((secao) => {
      const itens = (fila.secoes[secao] ?? []).map((item) => {
        const row = porId.get(item.leadId);
        return { ...item, row, feito: itemFeito(row, secao, fila.gerada_em) };
      });
      return { secao, itens, feitos: itens.filter((i) => i.feito).length };
    }).filter((s) => s.itens.length > 0);
  }, [fila, porId]);

  if (!fila) {
    return (
      <div className="mb-6 border border-line bg-paper p-4">
        <p className="font-display text-lg text-ink tracking-tight">Fila do dia</p>
        <p className="text-sm text-muted mt-1">
          A fila de hoje ainda não foi montada. Ela é montada sozinha às 6h.
        </p>
        <Button
          size="sm"
          className="mt-3"
          disabled={montando}
          onClick={() => {
            setErro(null);
            startMontar(async () => {
              const r = await montarFilaDoDiaAgora();
              if (!r.ok) setErro(r.error ?? "Não consegui montar a fila.");
              else router.refresh();
            });
          }}
        >
          {montando ? "Montando… (até 1 min)" : "Montar agora"}
        </Button>
        {erro ? <p className="text-sm text-accent font-medium mt-2">{erro}</p> : null}
      </div>
    );
  }

  const total = secoes.reduce((n, s) => n + s.itens.length, 0);
  const feitos = secoes.reduce((n, s) => n + s.feitos, 0);
  // A primeira seção com pendência abre sozinha: é por onde começar.
  const primeiraAberta = secoes.find((s) => s.feitos < s.itens.length)?.secao;

  return (
    <div className="mb-6 border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg text-ink tracking-tight">
          Fila do dia
        </p>
        <p className="text-sm text-muted">
          {feitos} de {total} feitos
        </p>
      </div>
      <div className="h-1 bg-line mt-2" aria-hidden>
        <div
          className="h-1 bg-ink transition-all"
          style={{ width: `${total ? Math.round((feitos / total) * 100) : 100}%` }}
        />
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted mt-3">Nada na fila hoje.</p>
      ) : (
        <div className="mt-3 divide-y divide-line">
          {secoes.map(({ secao, itens, feitos: f }) => (
            <SecaoFila
              key={secao}
              secao={secao}
              itens={itens}
              feitos={f}
              aberta={secao === primeiraAberta}
            />
          ))}
        </div>
      )}

      {fila.locacoes_7d > 0 ? (
        <p className="text-sm text-muted mt-3">
          {fila.locacoes_7d}{" "}
          {fila.locacoes_7d === 1 ? "locação" : "locações"} nos próximos 7 dias:{" "}
          <Link href="/derma-lux/leads/janelas" className="underline text-ink">
            ver Janelas da rota
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function SecaoFila({
  secao,
  itens,
  feitos,
  aberta,
}: {
  secao: Secao;
  itens: { leadId: string; etapa?: string; row?: LeadInboxRow; feito: boolean }[];
  feitos: number;
  aberta: boolean;
}) {
  const completa = feitos === itens.length;
  return (
    <details open={aberta} className="py-2 group">
      <summary className="flex items-baseline justify-between gap-2 cursor-pointer list-none">
        <span className={cn("text-sm font-medium", completa ? "text-muted" : "text-ink")}>
          {completa ? "✓ " : ""}
          {SECAO_LABEL[secao]}
        </span>
        <span className="text-sm text-muted shrink-0">
          {feitos}/{itens.length}
        </span>
      </summary>
      <p className="text-xs text-muted mt-1">{SECAO_DICA[secao]}</p>
      <ul className="mt-2 space-y-1">
        {itens.map((item) => (
          <li key={item.leadId} className="text-sm flex items-baseline gap-2">
            <span className="w-4 shrink-0 text-muted" aria-hidden>
              {item.feito ? "✓" : "·"}
            </span>
            {item.row ? (
              <Link
                href={`/derma-lux/leads/${item.leadId}`}
                onClick={() => marcarLeadAbertoDoRadar(item.leadId)}
                className={cn(
                  "truncate underline-offset-2 hover:underline",
                  item.feito ? "text-muted line-through" : "text-ink",
                )}
              >
                {leadDisplayName(item.row.lead)}
              </Link>
            ) : (
              <span className="text-muted line-through truncate">lead arquivado</span>
            )}
            {item.etapa && !item.feito ? (
              <span className="text-xs text-muted shrink-0">{item.etapa}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
