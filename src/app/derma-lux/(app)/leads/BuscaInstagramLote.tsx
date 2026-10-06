"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { instagramProfileUrl } from "@/lib/leads/instagram";
import { gravarRejeitados, lerRejeitados } from "@/lib/leads/instagram-rejeitados";
import { definirInstagram } from "../../leads-actions";
import { instagramDoLead, leadDisplayName } from "../../leads-shared";
import type { LeadInboxRow } from "../../leads-types";

type Candidato = {
  handle: string;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
  fonte: string | null;
};

/** O que a busca achou para um lead, guardado até o dono conferir. */
type Achado = { em: string; candidatos: Candidato[]; observacao: string | null };

/**
 * Leads buscados em lote, por id.
 *
 * No navegador (localStorage), como os rejeitados: cada busca é paga, e sem
 * isto fechar a tela jogaria fora o que a IA achou — e o próximo lote
 * pesquisaria os mesmos leads de novo. Lead buscado sem resultado também fica
 * aqui, para o lote seguinte pular para os próximos.
 */
const CHAVE = "radar:ig-lote";

function lerAchados(): Record<string, Achado> {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const mapa: unknown = bruto ? JSON.parse(bruto) : {};
    return mapa && typeof mapa === "object" ? (mapa as Record<string, Achado>) : {};
  } catch {
    return {};
  }
}

function gravarAchados(mapa: Record<string, Achado>) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(mapa));
  } catch {
    // Sem armazenamento: vale enquanto a tela está aberta.
  }
}

/**
 * Leads por clique. Cada busca leva de 20 a 40 segundos e é paga; dez por vez
 * deixa o dono ver o resultado e decidir se continua.
 */
const LOTE = 10;

/**
 * Espera antes de repetir uma busca barrada pelo limite da IA.
 *
 * Cada busca lê dezenas de milhares de tokens de resultado, e o limite da
 * conta é por minuto: duas buscas simultâneas falharam as dez num teste real.
 * Por isso também o lote vai uma de cada vez.
 */
const ESPERA_LIMITE_MS = 60_000;

/** Resposta que vale esperar e repetir: limite da IA ou tempo esgotado. */
function passageira(status: number): boolean {
  return status === 429 || status === 504;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CONFIANCA_LABEL: Record<Candidato["confianca"], string> = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

/**
 * "Buscar Instagram em lote", nos chips de "Nunca abordado".
 *
 * Roda a mesma busca da ficha, lead a lead, na ordem da lista. Nada é salvo
 * sozinho: a IA já propôs com confiança alta perfil que não existia, então cada
 * achado espera o dono abrir o perfil e tocar em "Usar".
 */
export function BuscaInstagramLote({
  fila,
  todos,
}: {
  /** Os leads visíveis, na ordem da tela. */
  fila: LeadInboxRow[];
  /** Todos os leads, para mostrar os achados de quem saiu do filtro. */
  todos: LeadInboxRow[];
}) {
  const router = useRouter();
  const [achados, setAchados] = useState<Record<string, Achado>>({});
  const [rodando, setRodando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const parar = useRef(false);

  // Lido depois de montar: no servidor não há localStorage.
  useEffect(() => setAchados(lerAchados()), []);

  function atualizar(fn: (m: Record<string, Achado>) => Record<string, Achado>) {
    setAchados((atual) => {
      const novo = fn(atual);
      gravarAchados(novo);
      return novo;
    });
  }

  const pendentes = useMemo(
    () => fila.filter((r) => !instagramDoLead(r.lead) && !achados[r.lead.id]),
    [fila, achados],
  );

  // Achados a conferir: lead ainda sem Instagram e com candidato de pé.
  const aConferir = useMemo(
    () =>
      todos.filter((r) => {
        const a = achados[r.lead.id];
        return a && a.candidatos.length > 0 && !instagramDoLead(r.lead);
      }),
    [todos, achados],
  );

  const semResultado = useMemo(
    () =>
      todos.filter((r) => {
        const a = achados[r.lead.id];
        return a && a.candidatos.length === 0 && !instagramDoLead(r.lead);
      }).length,
    [todos, achados],
  );

  async function buscarLote() {
    const lote = pendentes.slice(0, LOTE);
    if (!lote.length) return;

    parar.current = false;
    setRodando(true);
    setErro(null);

    let feitos = 0;
    let achou = 0;
    let falhas = 0;
    let custo = 0;
    const resumo = () =>
      [
        `${feitos} de ${lote.length} buscado(s)`,
        `${achou} com perfil`,
        falhas > 0 ? `${falhas} falha(s)` : null,
        custo > 0 ? `US$ ${custo.toFixed(3)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    setStatus(`Buscando… ${resumo()}`);

    /** Uma busca. Devolve o erro, ou null se deu certo. */
    async function buscarUm(id: string): Promise<{ status: number; msg: string } | null> {
      let res: Response;
      try {
        res = await fetch(`/api/leads/${id}/buscar-instagram`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ excluir: lerRejeitados(id).slice(-20) }),
        });
      } catch {
        return { status: 0, msg: "Falha de rede." };
      }
      // Tempo esgotado na Vercel volta em HTML, não JSON.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          status: res.status,
          msg:
            json.message ??
            (res.status === 504
              ? "A busca passou do tempo máximo (60s)."
              : `${json.error ?? "erro"} (HTTP ${res.status})`),
        };
      }
      const candidatos = (json.candidatos ?? []) as Candidato[];
      custo += Number(json.custoUsd) || 0;
      if (candidatos.length) achou += 1;
      atualizar((m) => ({
        ...m,
        [id]: {
          em: new Date().toISOString(),
          candidatos,
          observacao: json.observacao ?? null,
        },
      }));
      return null;
    }

    let seguidas = 0;
    for (const row of lote) {
      if (parar.current) break;
      let falha = await buscarUm(row.lead.id);
      if (falha && passageira(falha.status) && !parar.current) {
        setStatus(`${falha.msg} Esperando 1 minuto… ${resumo()}`);
        await esperar(ESPERA_LIMITE_MS);
        if (!parar.current) falha = await buscarUm(row.lead.id);
      }
      feitos += 1;
      if (falha) {
        falhas += 1;
        seguidas += 1;
        // O motivo na tela: "10 falha(s)" sozinho não dizia o que fazer.
        setErro(falha.msg);
        // Chave ausente, pesquisa desligada, ou falhas em série: os próximos
        // falhariam igual, e cada tentativa pode custar.
        if (falha.status === 500 || /desligada/.test(falha.msg) || seguidas >= 3) {
          parar.current = true;
        }
      } else {
        seguidas = 0;
      }
      setStatus(`Buscando… ${resumo()}`);
    }

    setStatus(`${parar.current ? "Parado" : "Pronto"}: ${resumo()}`);
    setRodando(false);
  }

  function rejeitar(leadId: string, handle: string) {
    gravarRejeitados(leadId, [...new Set([...lerRejeitados(leadId), handle])].slice(-20));
    atualizar((m) => {
      const a = m[leadId];
      if (!a) return m;
      return {
        ...m,
        [leadId]: { ...a, candidatos: a.candidatos.filter((c) => c.handle !== handle) },
      };
    });
  }

  async function usar(leadId: string, handle: string) {
    setSalvando(leadId);
    setErro(null);
    const r = await definirInstagram(leadId, handle);
    setSalvando(null);
    if (!r.ok) {
      setErro(r.error ?? "Não consegui salvar.");
      return;
    }
    atualizar((m) => {
      const resto = { ...m };
      delete resto[leadId];
      return resto;
    });
    router.refresh();
  }

  function rebuscarSemResultado() {
    atualizar((m) =>
      Object.fromEntries(Object.entries(m).filter(([, a]) => a.candidatos.length > 0)),
    );
  }

  return (
    <div className="mb-4 space-y-2 border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={buscarLote}
          loading={rodando}
          disabled={rodando || pendentes.length === 0}
        >
          {pendentes.length > 0
            ? `Buscar Instagram de ${Math.min(pendentes.length, LOTE)} com IA`
            : "Ninguém sem Instagram para buscar"}
        </Button>
        {rodando ? (
          <Button size="sm" variant="secondary" onClick={() => (parar.current = true)}>
            Parar
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Busca os leads desta lista sem Instagram, um por vez, de cima para baixo
        {pendentes.length > LOTE ? ` (${pendentes.length} na fila)` : ""}. Mantenha esta
        tela aberta enquanto busca. Nada é salvo sem você conferir.
        {semResultado > 0 ? (
          <>
            {" "}
            {semResultado} buscado(s) sem resultado ficam de fora ·{" "}
            <button
              type="button"
              onClick={rebuscarSemResultado}
              disabled={rodando}
              className="underline"
            >
              incluir de novo
            </button>
          </>
        ) : null}
      </p>

      {status ? <p className="text-xs text-muted">{status}</p> : null}
      {erro ? (
        <Alert variant="danger" className="text-xs">
          {erro}
        </Alert>
      ) : null}

      {aConferir.length > 0 ? (
        <div className="space-y-2 pt-1">
          <p className="text-sm font-medium text-ink">
            Para conferir ({aConferir.length})
          </p>
          <ul className="space-y-2">
            {aConferir.map((row) => {
              const id = row.lead.id;
              return (
                <li key={id} className="border border-line p-2 space-y-1">
                  <Link
                    href={`/derma-lux/leads/${id}`}
                    className="text-sm font-medium text-ink underline"
                  >
                    {leadDisplayName(row.lead)}
                  </Link>
                  {achados[id].candidatos.map((c) => (
                    <div key={c.handle} className="text-xs space-y-1">
                      <p>
                        <a
                          href={instagramProfileUrl(c.handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-ink underline"
                        >
                          @{c.handle}
                        </a>{" "}
                        <span className="text-muted">
                          · confiança {CONFIANCA_LABEL[c.confianca]} · {c.motivo}
                        </span>
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => usar(id, c.handle)}
                          loading={salvando === id}
                          disabled={salvando !== null}
                        >
                          Usar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => rejeitar(id, c.handle)}
                          disabled={salvando !== null}
                        >
                          Não é ele
                        </Button>
                      </div>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
