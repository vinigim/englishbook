"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  ACTION_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  type Temperature,
} from "@/lib/leads/taxonomy";
import {
  leadDisplayName,
  messagePreview,
  relativeDays,
} from "../../leads-shared";
import type { LeadInboxRow } from "../../leads-types";

const TEMPERATURE_VARIANT: Record<
  Temperature,
  "danger" | "info" | "neutral"
> = {
  quente: "danger",
  morno: "info",
  frio: "neutral",
};

type Filtro = "todos" | Temperature | "sem_analise" | "aguardando_resposta";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "quente", label: "Quentes" },
  { id: "morno", label: "Mornos" },
  { id: "frio", label: "Frios" },
  { id: "aguardando_resposta", label: "Esperando resposta" },
  { id: "sem_analise", label: "Sem análise" },
];

function aguardandoResposta(row: LeadInboxRow): boolean {
  const { last_inbound_at, last_outbound_at } = row.lead;
  if (!last_inbound_at) return false;
  if (!last_outbound_at) return true;
  return new Date(last_inbound_at) > new Date(last_outbound_at);
}

export function InboxClient({ rows }: { rows: LeadInboxRow[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return rows.filter((row) => {
      if (filtro === "sem_analise" && row.analysis) return false;
      if (filtro === "aguardando_resposta" && !aguardandoResposta(row)) {
        return false;
      }
      if (
        (filtro === "quente" || filtro === "morno" || filtro === "frio") &&
        row.analysis?.temperature !== filtro
      ) {
        return false;
      }

      if (!termo) return true;
      const alvo = [
        leadDisplayName(row.lead),
        row.lead.clinic_name,
        row.lead.specialty,
        row.lead.city,
        row.lead.phone_e164,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [rows, filtro, busca]);

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: rows.length,
      quente: 0,
      morno: 0,
      frio: 0,
      sem_analise: 0,
      aguardando_resposta: 0,
    };
    for (const row of rows) {
      if (row.analysis?.temperature) c[row.analysis.temperature] += 1;
      else c.sem_analise += 1;
      if (aguardandoResposta(row)) c.aguardando_resposta += 1;
    }
    return c;
  }, [rows]);

  return (
    <div>
      <div className="mb-4 space-y-2">
        {/*
          No celular os chips rolam na horizontal em vez de quebrar em três
          linhas — senão o primeiro lead só apareceria abaixo da dobra.
        */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-sm font-medium border whitespace-nowrap transition-colors",
                filtro === f.id
                  ? "bg-ink text-paper border-ink"
                  : "bg-paper text-ink border-line hover:border-ink",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{contagem[f.id]}</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome, clínica, cidade ou telefone"
          className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none"
        />
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">
          Nenhum lead corresponde a este filtro.
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((row) => (
            <LeadRow key={row.lead.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadRow({ row }: { row: LeadInboxRow }) {
  const { lead, analysis, lastMessage } = row;
  const esperando = aguardandoResposta(row);

  return (
    <li>
      <Link
        href={`/derma-lux/leads/${lead.id}`}
        className="block bg-paper border border-line hover:border-ink transition-colors p-4"
      >
        {/*
          Layout empilhado, e não duas colunas: em 390px a coluna da direita
          espremia o nome a ponto de virar "Clínica B…" e a prévia da mensagem
          a "Ele: Noss…". Aqui cada informação tem a largura inteira.
        */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-lg text-ink tracking-tight truncate">
            {leadDisplayName(lead)}
          </span>
          <span className="text-xs text-muted shrink-0">
            {relativeDays(lead.last_message_at)}
          </span>
        </div>

        {analysis?.recommended_action ? (
          <p className="text-sm font-semibold text-accent tracking-tight mt-0.5">
            {ACTION_LABEL[analysis.recommended_action]}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {analysis ? (
            <>
              <Badge
                variant={TEMPERATURE_VARIANT[analysis.temperature]}
                className="whitespace-nowrap"
              >
                {TEMPERATURE_LABEL[analysis.temperature]}
              </Badge>
              <Badge variant="neutral" className="whitespace-nowrap">
                {STAGE_LABEL[analysis.stage]}
              </Badge>
            </>
          ) : (
            <Badge variant="neutral" className="whitespace-nowrap">
              sem análise
            </Badge>
          )}

          {esperando ? (
            <Badge variant="warning" className="whitespace-nowrap">
              esperando resposta
            </Badge>
          ) : null}
        </div>

        <p className="text-sm text-muted mt-1.5 truncate">
          {lastMessage ? (
            <>
              <span className="font-medium text-ink/70">
                {lastMessage.direction === "in" ? "Ele: " : "Nós: "}
              </span>
              {messagePreview({ ...lastMessage, caption: null }, 140)}
            </>
          ) : (
            [lead.clinic_name, lead.specialty, lead.city]
              .filter(Boolean)
              .join(" · ") || "Sem conversa registrada"
          )}
        </p>
      </Link>
    </li>
  );
}
