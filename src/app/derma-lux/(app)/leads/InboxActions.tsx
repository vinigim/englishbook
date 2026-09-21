"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/**
 * Botões de "Analisar pendentes" e "Sincronizar histórico".
 *
 * O backfill responde em NDJSON, então lemos o stream linha a linha para
 * mostrar andamento em vez de deixar o usuário olhando para um botão travado
 * durante minutos.
 */
export function InboxActions({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<"analise" | "sync" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function analisar() {
    setOcupado("analise");
    setErro(null);
    setStatus("Analisando…");
    try {
      const res = await fetch("/api/leads/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErro(json.message ?? "Falha ao analisar.");
        setStatus(null);
        return;
      }

      const partes = [
        `${json.analisados} analisado(s)`,
        json.reaproveitados > 0
          ? `${json.reaproveitados} sem mudança (não custou nada)`
          : null,
        json.falhas > 0 ? `${json.falhas} falha(s)` : null,
        json.restantes > 0 ? `${json.restantes} na fila` : null,
        json.custoUsd > 0 ? `US$ ${json.custoUsd.toFixed(4)}` : null,
      ].filter(Boolean);

      setStatus(partes.join(" · "));
      router.refresh();
    } catch {
      setErro("Falha de rede ao analisar.");
      setStatus(null);
    } finally {
      setOcupado(null);
    }
  }

  async function sincronizar() {
    setOcupado("sync");
    setErro(null);
    setStatus("Conectando…");
    try {
      const res = await fetch("/api/whatsapp/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setErro(json.message ?? json.error ?? "Falha ao sincronizar.");
        setStatus(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chats = 0;

      // NDJSON: uma linha de progresso por chat.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";

        for (const linha of linhas) {
          if (!linha.trim()) continue;
          let evento: Record<string, unknown>;
          try {
            evento = JSON.parse(linha);
          } catch {
            continue;
          }

          if (evento.tipo === "inicio") {
            setStatus(`Sincronizando ${evento.totalChats} conversa(s)…`);
          } else if (evento.tipo === "chat") {
            chats += 1;
            setStatus(
              `${chats} conversa(s) · última: ${evento.nome ?? evento.telefone}`,
            );
          } else if (evento.tipo === "fim") {
            setStatus(
              `${evento.chatsProcessados} conversa(s) · ${evento.mensagensGravadas} mensagem(ns) nova(s) · ${evento.leadsNovos} lead(s) novo(s)`,
            );
          } else if (evento.tipo === "parcial") {
            setStatus(String(evento.mensagem));
          } else if (evento.tipo === "erro" && !evento.telefone) {
            setErro(String(evento.mensagem));
          }
        }
      }

      router.refresh();
    } catch {
      setErro("Falha de rede ao sincronizar.");
      setStatus(null);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={analisar}
          loading={ocupado === "analise"}
          disabled={ocupado !== null || pendentes === 0}
        >
          {pendentes > 0
            ? `Analisar ${Math.min(pendentes, 25)} pendente(s)`
            : "Nada pendente"}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={sincronizar}
          loading={ocupado === "sync"}
          disabled={ocupado !== null}
        >
          Sincronizar histórico
        </Button>
      </div>

      {status ? <p className="text-xs text-muted">{status}</p> : null}
      {erro ? (
        <Alert variant="danger" className="text-xs">
          {erro}
        </Alert>
      ) : null}
    </div>
  );
}
