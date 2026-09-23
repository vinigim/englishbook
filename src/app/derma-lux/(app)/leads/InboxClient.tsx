"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  ACTION_LABEL,
  EFFECTIVE_TEMPERATURES,
  isConfirmada,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  type EffectiveTemperature,
  type LeadStatus,
} from "@/lib/leads/taxonomy";
import {
  estadoContato,
  instagramDoLead,
  leadDisplayName,
  messagePreview,
  relativeDays,
  situacaoEfetiva,
  temperaturaEfetiva,
} from "../../leads-shared";
import type { LeadInboxRow } from "../../leads-types";
import { guardarFiltrosDoRadar } from "./filtros-radar";

const TEMPERATURE_VARIANT: Record<
  EffectiveTemperature,
  "danger" | "info" | "neutral"
> = {
  quente: "danger",
  morno: "info",
  frio: "neutral",
  quente_confirmado: "danger",
  frio_confirmado: "neutral",
};

type Filtro =
  | "todos"
  | EffectiveTemperature
  | "sem_analise"
  | "aguardando_resposta"
  | "nunca_abordado"
  | "aguardando_ele";

// Os confirmados ficam ao lado da temperatura correspondente, não no fim: a
// leitura natural da barra é do mais quente para o mais frio.
//
// Os três últimos não são temperatura: são de quem é a bola. Ficam nesta mesma
// linha porque a alternativa era uma terceira fila de chips, e a barra já tem
// duas. "Devo responder" chamava-se "Esperando resposta", nome que dizia o
// contrário do que faz — ele marca quem FALOU por último, não quem está
// esperando a resposta dele.
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "quente", label: "Quentes" },
  { id: "quente_confirmado", label: "Quente confirmado" },
  { id: "morno", label: "Mornos" },
  { id: "frio", label: "Frios" },
  { id: "frio_confirmado", label: "Frio confirmado" },
  { id: "aguardando_resposta", label: "Devo responder" },
  { id: "nunca_abordado", label: "Nunca abordado" },
  { id: "aguardando_ele", label: "Aguardando ele" },
  { id: "sem_analise", label: "Sem análise" },
];

/**
 * Situação é uma dimensão INDEPENDENTE da temperatura.
 *
 * Por isso duas linhas de filtro em vez de uma fila só: com 13 chips exclusivos
 * a barra viraria rolagem infinita no celular, e — mais importante — não daria
 * para pedir "cliente ativo E quente", que é a pergunta que interessa.
 */
type FiltroSituacao = "todas" | LeadStatus;

const FILTROS_SITUACAO: { id: FiltroSituacao; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "cliente", label: "Cliente ativo" },
  { id: "inativo", label: "Cliente inativo" },
  { id: "em_conversa", label: "Em conversa" },
  { id: "novo", label: "Novo" },
  { id: "descartado", label: "Descartado" },
];

function instagramArroba(lead: LeadInboxRow["lead"]): string | null {
  const handle = instagramDoLead(lead);
  return handle ? `@${handle}` : null;
}

const CANAL_LABEL = { whatsapp: "WhatsApp", instagram: "Instagram" } as const;

/** O chip e o estado têm nomes diferentes porque o chip é mais antigo que o estado. */
const ESTADO_DO_FILTRO = {
  aguardando_resposta: "devo_responder",
  nunca_abordado: "nunca_abordado",
  aguardando_ele: "aguardando_ele",
} as const;

function lerFiltro(v: string | null): Filtro {
  return FILTROS.some((f) => f.id === v) ? (v as Filtro) : "todos";
}

function lerSituacao(v: string | null): FiltroSituacao {
  return FILTROS_SITUACAO.some((f) => f.id === v)
    ? (v as FiltroSituacao)
    : "todas";
}

/**
 * Frio confirmado sai de "Devo responder".
 *
 * O dono já decidiu que não vai investir nesse contato; mantê-lo na fila de
 * resposta só empurrava para baixo quem de fato espera retorno. O estado
 * continua "devo responder" — é um fato, e a IA e a tela do lead o usam —,
 * só não entra na fila. Por isso a soma dos três chips de contato pode ficar
 * abaixo do total: a diferença são esses leads.
 */
function foraDoDevoResponder(row: LeadInboxRow): boolean {
  return temperaturaEfetiva(row.lead, row.analysis) === "frio_confirmado";
}

/** Desde quando ele espera resposta, para ordenar a fila. */
function desdeMs(row: LeadInboxRow): number {
  const desde = estadoContato(row.lead).desde;
  const t = desde ? new Date(desde).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function InboxClient({ rows }: { rows: LeadInboxRow[] }) {
  // Os filtros moram na URL. Antes moravam só no estado do componente, e abrir
  // um lead e voltar zerava tudo — o dono refazia a mesma filtragem a cada
  // lead que conferia. Na URL, o "Voltar" do navegador já traz de volta, e o
  // "← Voltar ao radar" usa a cópia guardada em guardarFiltrosDoRadar().
  const params = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>(() => lerFiltro(params.get("filtro")));
  const [situacao, setSituacao] = useState<FiltroSituacao>(() =>
    lerSituacao(params.get("situacao")),
  );
  const [busca, setBusca] = useState(() => params.get("busca") ?? "");

  useEffect(() => {
    const q = new URLSearchParams();
    if (filtro !== "todos") q.set("filtro", filtro);
    if (situacao !== "todas") q.set("situacao", situacao);
    if (busca.trim()) q.set("busca", busca);
    const query = q.toString();
    // replaceState, e não router.replace: cada tecla da busca viraria uma
    // navegação do Next, com nova renderização no servidor. O Next 15 escuta
    // o history nativo, então useSearchParams continua em dia.
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
    guardarFiltrosDoRadar(query);
  }, [filtro, situacao, busca]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const filtrados = rows.filter((row) => {
      // As duas linhas se COMBINAM: interseção, não união.
      if (
        situacao !== "todas" &&
        situacaoEfetiva(row.lead, row.rentals) !== situacao
      ) {
        return false;
      }

      if (filtro === "sem_analise" && row.analysis) return false;
      // Os três estados de contato são excludentes, então um `switch` de
      // igualdade basta. A soma dos chips só não fecha com o total por causa
      // dos frios confirmados tirados de "Devo responder".
      if (
        (filtro === "aguardando_resposta" ||
          filtro === "nunca_abordado" ||
          filtro === "aguardando_ele") &&
        ESTADO_DO_FILTRO[filtro] !== estadoContato(row.lead).estado
      ) {
        return false;
      }
      if (filtro === "aguardando_resposta" && foraDoDevoResponder(row)) {
        return false;
      }
      // O filtro de temperatura usa a EFETIVA: se o dono marcou à mão, é essa
      // que vale — senão o lead sumiria do chip que ele mesmo escolheu.
      if (
        EFFECTIVE_TEMPERATURES.includes(filtro as EffectiveTemperature) &&
        temperaturaEfetiva(row.lead, row.analysis) !== filtro
      ) {
        return false;
      }

      if (!termo) return true;
      const alvo = [
        leadDisplayName(row.lead),
        // Os nomes alternativos entram SEMPRE, não só quando são o exibido.
        // Se o display_name vier ruim — e já veio, quando o pushName do
        // WhatsApp era o próprio LID — o nome da planilha continua achável.
        row.lead.sheet_name,
        row.lead.display_name,
        row.lead.clinic_name,
        row.lead.specialty,
        row.lead.city,
        row.lead.phone_e164,
        // Às vezes o @ é a única coisa que se lembra do lead. Com o arroba
        // junto porque é assim que se digita o nome de um perfil.
        instagramArroba(row.lead),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });

    // "Devo responder" é uma fila: quem está esperando há mais tempo vem
    // primeiro. Nos outros filtros vale a ordem de prioridade do servidor.
    if (filtro === "aguardando_resposta") {
      return filtrados
        .slice()
        .sort((a, b) => desdeMs(a) - desdeMs(b));
    }
    return filtrados;
  }, [rows, filtro, situacao, busca]);

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: rows.length,
      quente: 0,
      morno: 0,
      frio: 0,
      quente_confirmado: 0,
      frio_confirmado: 0,
      sem_analise: 0,
      aguardando_resposta: 0,
      nunca_abordado: 0,
      aguardando_ele: 0,
    };
    for (const row of rows) {
      const t = temperaturaEfetiva(row.lead, row.analysis);
      if (t) c[t] += 1;
      // "Sem análise" continua significando o que a IA ainda não leu, mesmo
      // que o dono já tenha marcado a temperatura à mão.
      if (!row.analysis) c.sem_analise += 1;

      const { estado } = estadoContato(row.lead);
      if (estado === "devo_responder") {
        if (!foraDoDevoResponder(row)) c.aguardando_resposta += 1;
      }
      else if (estado === "nunca_abordado") c.nunca_abordado += 1;
      else c.aguardando_ele += 1;
    }
    return c;
  }, [rows]);

  const contagemSituacao = useMemo(() => {
    const c: Record<FiltroSituacao, number> = {
      todas: rows.length,
      novo: 0,
      em_conversa: 0,
      cliente: 0,
      inativo: 0,
      descartado: 0,
    };
    for (const row of rows) c[situacaoEfetiva(row.lead, row.rentals)] += 1;
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

        {/* Segunda linha: situação. Dimensão independente da temperatura —
            combinar as duas é o que permite "cliente ativo e quente". */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {FILTROS_SITUACAO.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSituacao(f.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-sm font-medium border whitespace-nowrap transition-colors",
                situacao === f.id
                  ? "bg-ink text-paper border-ink"
                  : "bg-paper text-ink border-line hover:border-ink",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{contagemSituacao[f.id]}</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome, clínica, cidade, telefone ou @"
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
  const temperatura = temperaturaEfetiva(lead, analysis);
  const contato = estadoContato(lead);

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
          {temperatura ? (
            <Badge
              variant={TEMPERATURE_VARIANT[temperatura]}
              className="whitespace-nowrap"
            >
              {/* O ✓ diz que foi o dono quem marcou, não a IA. */}
              {isConfirmada(temperatura) ? "✓ " : ""}
              {TEMPERATURE_LABEL[temperatura]}
            </Badge>
          ) : null}
          {analysis ? (
            <>
              <Badge variant="neutral" className="whitespace-nowrap">
                {STAGE_LABEL[analysis.stage]}
              </Badge>
            </>
          ) : (
            <Badge variant="neutral" className="whitespace-nowrap">
              sem análise
            </Badge>
          )}

          {/*
            De quem é a bola. "Nunca abordado" não ganha selo: são a maioria da
            carteira, e um selo repetido em centenas de cards vira ruído — a
            ausência já diz o que é. Saber isso sem abrir a ficha é o ponto:
            abrir um por um é justamente o trabalho que o selo deveria poupar.
          */}
          {contato.estado === "devo_responder" ? (
            <Badge variant="warning" className="whitespace-nowrap">
              responder ele
            </Badge>
          ) : contato.estado === "aguardando_ele" && contato.canal ? (
            <Badge variant="success" className="whitespace-nowrap">
              ✓ mandei no {CANAL_LABEL[contato.canal]} {relativeDays(contato.desde)}
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
