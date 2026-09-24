"use client";

import { useState, useTransition } from "react";
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
  observacao: string | null;
  pesquisas: number;
  custoUsd: number;
};

const CONFIANCA_LABEL: Record<Candidato["confianca"], string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

/**
 * "Buscar Instagram com IA", para lead sem Instagram.
 *
 * Nada é salvo sem o toque em "Usar este": a IA acha candidatos, o dono abre
 * o perfil, confere e escolhe.
 */
export function BuscarInstagram({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  async function buscar() {
    setBuscando(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/buscar-instagram`, { method: "POST" });
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
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 pt-1">
      <Button
        size="sm"
        variant="secondary"
        onClick={buscar}
        loading={buscando}
        disabled={buscando || salvando}
      >
        {resultado ? "Buscar de novo" : "Buscar Instagram com IA"}
      </Button>

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
            {resultado.candidatos.length > 0 && resultado.observacao
              ? ` · ${resultado.observacao}`
              : ""}
          </p>
        </div>
      ) : null}

      {erro ? (
        <Alert variant="danger" className="text-xs">
          {erro}
        </Alert>
      ) : null}
    </div>
  );
}
