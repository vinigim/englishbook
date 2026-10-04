"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { instagramProfileUrl } from "@/lib/leads/instagram";
import { definirInstagram } from "../../../leads-actions";

type Candidato = {
  handle: string;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
  fonte: string | null;
};

type Resultado = {
  candidatos: Candidato[];
  descartados: number;
  inexistentes: number;
  conferidos: { total: number; responderam: number };
  consultas: string[];
  observacao: string | null;
  pesquisas: number;
  custoUsd: number;
};

/**
 * Perfis que o dono marcou como "não existe" neste lead.
 *
 * O índice da pesquisa guarda perfil apagado ou renomeado, e sem isto o mesmo
 * @ voltava a cada "Buscar de novo". Fica no navegador (localStorage), por
 * lead: é conveniência de quem está conferindo, não dado do lead — e não pede
 * migração. Em outro aparelho a lista começa vazia.
 */
const chaveRejeitados = (leadId: string) => `radar:ig-rejeitados:${leadId}`;

function lerRejeitados(leadId: string): string[] {
  try {
    const bruto = window.localStorage.getItem(chaveRejeitados(leadId));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((h): h is string => typeof h === "string") : [];
  } catch {
    return [];
  }
}

function gravarRejeitados(leadId: string, lista: string[]) {
  try {
    if (lista.length) {
      window.localStorage.setItem(chaveRejeitados(leadId), JSON.stringify(lista));
    } else {
      window.localStorage.removeItem(chaveRejeitados(leadId));
    }
  } catch {
    // Sem armazenamento (aba anônima): vale só enquanto a ficha está aberta.
  }
}

const CONFIANCA_LABEL: Record<Candidato["confianca"], string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

/**
 * "Buscar Instagram com IA", para lead sem Instagram — ou com um @ que o
 * dono marcou como errado (`atual`), que a busca então evita.
 *
 * Nada é salvo sem o toque em "Usar este": a IA acha candidatos, o dono abre
 * o perfil, confere e escolhe.
 */
export function BuscarInstagram({
  leadId,
  atual = null,
  onSalvo,
}: {
  leadId: string;
  /** @ que o lead já tem e que o dono diz estar errado. A busca o evita. */
  atual?: string | null;
  /** Chamado depois de salvar, para quem abriu o painel poder fechá-lo. */
  onSalvo?: () => void;
}) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [manual, setManual] = useState("");
  const [rejeitados, setRejeitados] = useState<string[]>([]);

  // Lido depois de montar: no servidor não há localStorage.
  useEffect(() => setRejeitados(lerRejeitados(leadId)), [leadId]);

  function rejeitar(handle: string) {
    const lista = [...new Set([...rejeitados, handle])].slice(-20);
    setRejeitados(lista);
    gravarRejeitados(leadId, lista);
    setResultado((r) =>
      r ? { ...r, candidatos: r.candidatos.filter((c) => c.handle !== handle) } : r,
    );
  }

  function limparRejeitados() {
    setRejeitados([]);
    gravarRejeitados(leadId, []);
  }

  async function buscar() {
    setBuscando(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/buscar-instagram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          excluir: [...new Set([...(atual ? [atual] : []), ...rejeitados])].slice(-20),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json.message ?? json.error ?? "A busca falhou.");
        return;
      }
      setResultado(json as Resultado);
    } catch {
      setErro("Falha de rede na busca.");
    } finally {
      setBuscando(false);
    }
  }

  function usar(handle: string) {
    setErro(null);
    startSalvar(async () => {
      const r = await definirInstagram(leadId, handle);
      if (!r.ok) {
        setErro(r.error ?? "Não consegui salvar.");
        return;
      }
      onSalvo?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={buscar}
          loading={buscando}
          disabled={buscando || salvando}
        >
          {resultado ? "Buscar de novo" : "Buscar Instagram com IA"}
        </Button>
      </div>

      {/* Quando o dono já sabe o perfil — a IA não acha todos. Aceita o @, o
          nome solto ou o link inteiro: o toInstagramHandle da action limpa. */}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) usar(manual.trim());
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="ou cole o @ / link do perfil"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 border border-line bg-paper px-2 py-1 text-base sm:text-sm"
        />
        <Button
          size="sm"
          type="submit"
          loading={salvando}
          disabled={salvando || !manual.trim()}
        >
          Salvar
        </Button>
      </form>

      {buscando ? (
        <p className="text-xs text-muted">Pesquisando na internet… leva uns 20 segundos.</p>
      ) : null}

      {resultado ? (
        <div className="space-y-2">
          {resultado.candidatos.length === 0 ? (
            <p className="text-xs text-muted">
              Nenhum perfil confiável encontrado.
              {resultado.observacao ? ` ${resultado.observacao}` : ""}
            </p>
          ) : (
            <ul className="space-y-2">
              {resultado.candidatos.map((c) => (
                <li key={c.handle} className="border border-line p-2 text-xs space-y-1">
                  <p>
                    <a
                      href={instagramProfileUrl(c.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium text-sm"
                    >
                      @{c.handle}
                    </a>
                    <span className="text-muted"> · {CONFIANCA_LABEL[c.confianca]}</span>
                  </p>
                  {c.motivo ? <p className="text-muted">{c.motivo}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={instagramProfileUrl(c.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
                    >
                      Abrir perfil
                    </a>
                    <Button
                      size="sm"
                      onClick={() => usar(c.handle)}
                      loading={salvando}
                      disabled={salvando}
                    >
                      Usar este
                    </Button>
                    <button
                      type="button"
                      onClick={() => rejeitar(c.handle)}
                      disabled={salvando}
                      className="px-2 py-1 text-muted underline hover:text-ink"
                    >
                      Não existe / não é ele
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted">
            {resultado.pesquisas} pesquisa(s) · US$ {resultado.custoUsd.toFixed(4)}
            {resultado.descartados > 0
              ? ` · ${resultado.descartados} sugestão(ões) descartada(s) por não aparecer nos resultados`
              : ""}
            {resultado.inexistentes > 0
              ? ` · ${resultado.inexistentes} perfil(is) tirado(s) porque não existe(m) mais`
              : ""}
            {resultado.conferidos.total > 0
              ? ` · Instagram conferido: ${resultado.conferidos.responderam} de ${resultado.conferidos.total} @ responderam`
              : ""}
            {resultado.candidatos.length > 0 && resultado.observacao
              ? ` · ${resultado.observacao}`
              : ""}
          </p>
          {resultado.consultas.length > 0 ? (
            <p className="text-[11px] text-muted">
              Pesquisou: {resultado.consultas.map((q) => `“${q}”`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {rejeitados.length > 0 ? (
        <p className="text-[11px] text-muted">
          Não voltam na busca: {rejeitados.map((h) => `@${h}`).join(", ")} ·{" "}
          <button type="button" onClick={limparRejeitados} className="underline hover:text-ink">
            limpar
          </button>
        </p>
      ) : null}

      {erro ? (
        <Alert variant="danger" className="text-xs">
          {erro}
        </Alert>
      ) : null}
    </div>
  );
}
