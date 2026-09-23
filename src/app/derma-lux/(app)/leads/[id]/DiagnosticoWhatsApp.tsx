"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DiagnosticoTelefone } from "@/lib/whatsapp/provider";

type Resultado = DiagnosticoTelefone & {
  lead?: {
    phone_e164: string;
    phone_key: string | null;
    chaveDoIngest: string | null;
    chavesBatem: boolean;
  };
  vinculos?: { lid: string }[] | { erro: string };
  noBanco?: { id: string; leadId: string; esteLead: boolean }[];
};

/**
 * Botão de diagnóstico: o que o WhatsApp sabe sobre o telefone deste lead.
 *
 * Temporário. Serve para confirmar se a Evolution devolve o LID a partir do
 * telefone — é disso que depende a correção dos leads de planilha que
 * receberam mensagem e aparecem sem conversa.
 */
export function DiagnosticoWhatsApp({ leadId }: { leadId: string }) {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar() {
    setRodando(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await fetch("/api/whatsapp/diagnostico", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
      } else {
        setResultado(json as Resultado);
      }
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setRodando(false);
    }
  }

  const r = resultado;

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <Button size="sm" variant="secondary" loading={rodando} onClick={rodar}>
        Diagnosticar WhatsApp
      </Button>
      {rodando ? (
        <p className="text-xs text-muted mt-2">
          Lendo o histórico do WhatsApp — pode levar até um minuto.
        </p>
      ) : null}
      {erro ? <p className="text-sm text-accent mt-2">{erro}</p> : null}

      {r ? (
        <div className="mt-3 text-sm space-y-1">
          <p>
            <strong>Número testado:</strong> {r.variantes.join(" e ")}
          </p>
          <p>
            <strong>Consulta do número:</strong>{" "}
            {r.numeros.ok ? "respondeu" : `falhou (${r.numeros.erro})`}
          </p>
          <p>
            <strong>Contato na agenda do WhatsApp:</strong>{" "}
            {r.contatos.ok
              ? `${r.contatos.encontrados?.length ?? 0} encontrado(s)`
              : `falhou (${r.contatos.erro})`}
          </p>
          <p>
            <strong>Código interno (LID):</strong>{" "}
            {r.lids.length > 0 ? r.lids.join(", ") : "nenhum encontrado"}
          </p>
          <p>
            <strong>Mensagens no histórico:</strong> {r.mensagens.pelotelefone}{" "}
            pelo telefone, {r.mensagens.peloLid} pelo código interno
            <span className="text-muted">
              {" "}
              ({r.mensagens.mensagensLidas} lidas em {r.mensagens.paginasLidas}{" "}
              página(s)
              {r.mensagens.chegouAoFim ? ", histórico inteiro" : ", parou pelo tempo"}
              {r.mensagens.ok ? "" : `; erro: ${r.mensagens.erro}`})
            </span>
          </p>
          <p>
            <strong>Vínculo manual:</strong>{" "}
            {!r.vinculos
              ? "—"
              : "erro" in r.vinculos
                ? `falhou (${r.vinculos.erro})`
                : r.vinculos.length > 0
                  ? r.vinculos.map((v) => v.lid).join(", ")
                  : "nenhum"}
          </p>
          <p>
            <strong>Chave do telefone:</strong>{" "}
            {r.lead
              ? r.lead.chavesBatem
                ? `ok (${r.lead.phone_key})`
                : `DIFERENTE — lead ${r.lead.phone_key}, conversa ${r.lead.chaveDoIngest}`
              : "—"}
          </p>
          <p>
            <strong>Já gravadas no banco:</strong>{" "}
            {r.noBanco
              ? `${r.noBanco.length} de ${r.mensagens.amostra.length} da amostra` +
                (r.noBanco.length > 0
                  ? `, ${r.noBanco.filter((m) => m.esteLead).length} neste lead`
                  : "")
              : "—"}
          </p>
          <details className="mt-2">
            <summary className="text-xs text-muted cursor-pointer">
              Detalhes técnicos (mande print disto)
            </summary>
            <pre className="text-[11px] leading-snug whitespace-pre-wrap break-all bg-line/40 p-2 mt-1 max-h-96 overflow-auto">
              {JSON.stringify(r, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
