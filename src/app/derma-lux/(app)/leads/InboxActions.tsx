"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Etapa = { nome: string; ok: boolean; detalhe?: string };

type PreviaLimpeza = {
  invalidos: number;
  amostra: { phoneKey: string; nome: string | null; jid: string | null }[];
};

/**
 * Botões de "Analisar pendentes" e "Sincronizar histórico".
 *
 * O backfill responde em NDJSON, então lemos o stream linha a linha para
 * mostrar andamento em vez de deixar o usuário olhando para um botão travado
 * durante minutos.
 */
export function InboxActions({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<
    "analise" | "sync" | "teste" | "limpeza" | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<Etapa[] | null>(null);
  const [previa, setPrevia] = useState<PreviaLimpeza | null>(null);

  /**
   * Remove os leads cujo "telefone" não é telefone.
   *
   * A sincronização antiga tratava LID como número e criou um lead fantasma por
   * conversa. A origem está corrigida; isto limpa o que já entrou.
   *
   * São dois toques de propósito. O primeiro é dry-run e mostra a lista; só o
   * segundo apaga. Apagar lead é irreversível, e a conferência tem que estar na
   * tela de quem clica — não escondida no corpo de um request.
   */
  async function limpar(confirmar: boolean) {
    setOcupado("limpeza");
    setErro(null);
    setStatus(null);
    setDiagnostico(null);
    try {
      const res = await fetch("/api/leads/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(confirmar ? { confirmar: true } : {}),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(json.message ?? json.error ?? "Falha ao limpar.");
        return;
      }

      if (!confirmar) {
        setPrevia({ invalidos: json.invalidos ?? 0, amostra: json.amostra ?? [] });
        setStatus(json.mensagem ?? null);
        return;
      }

      setPrevia(null);
      setStatus(
        `${json.apagados} lead(s) apagado(s) · ${json.chatsLiberados ?? 0} conversa(s) liberada(s) para nova sincronização`,
      );
      router.refresh();
    } catch {
      setErro("Falha de rede ao limpar.");
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Checa a conexão com o WhatsApp e mostra em que passo ela quebra.
   *
   * São quatro coisas que podem estar erradas na configuração, e sem este
   * teste todas se parecem: o "Sincronizar histórico" simplesmente não traz
   * nada.
   */
  async function testarConexao() {
    setOcupado("teste");
    setErro(null);
    setStatus(null);
    setDiagnostico(null);
    try {
      const res = await fetch("/api/whatsapp/status");
      const json = (await res.json()) as {
        etapas?: Etapa[];
        resumo?: string;
        error?: string;
      };

      if (!res.ok) {
        setErro(json.error ?? "Não consegui checar a conexão.");
        return;
      }

      setDiagnostico(json.etapas ?? []);
      setStatus(json.resumo ?? null);
    } catch {
      setErro("Falha de rede ao checar a conexão.");
    } finally {
      setOcupado(null);
    }
  }

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

  /**
   * Máximo de rodadas encadeadas numa sincronização.
   *
   * Cada rodada do servidor para em 250s para não ser cortada pela plataforma,
   * e 287 conversas não cabem numa só. Encadear evita exigir um clique por
   * rodada — o que, além de chato, dava margem para o dono clicar em "Reler
   * tudo" de novo e reiniciar o trabalho em vez de continuá-lo.
   *
   * O teto existe para que um erro de servidor que devolva "parcial" sem
   * avançar não vire laço infinito.
   */
  const MAX_RODADAS = 12;

  /**
   * Importa o histórico.
   *
   * `force` manda o servidor desmarcar as conversas já concluídas, para reler
   * tudo. Só faz sentido depois de mudar algo do lado do Evolution (ligar o
   * Sync Full History, reler o QR) — no uso normal, `done` é o que impede
   * refazer trabalho a cada clique.
   *
   * Continua sozinho enquanto o servidor devolver "parcial", e das rodadas
   * seguintes em diante NUNCA manda force: a primeira já reabriu tudo, e
   * repetir faria cada rodada zerar a anterior.
   */
  async function sincronizar(force = false) {
    setOcupado("sync");
    setErro(null);
    setStatus(force ? "Relendo tudo…" : "Conectando…");
    try {
      let rodada = 0;
      let totalChats = 0;
      let totalMensagens = 0;
      let totalLeads = 0;
      let totalSemTelefone = 0;

      for (;;) {
        rodada += 1;
        const parcial = await umaRodada(rodada === 1 && force, {
          chatsAntes: totalChats,
        });

        if (!parcial.ok) return;

        totalChats += parcial.chats;
        totalMensagens += parcial.mensagens;
        totalLeads += parcial.leads;
        totalSemTelefone += parcial.semTelefone;

        const resumo = [
          `${totalChats} conversa(s)`,
          `${totalMensagens} mensagem(ns) nova(s)`,
          `${totalLeads} lead(s) novo(s)`,
          totalSemTelefone > 0
            ? `${totalSemTelefone} sem telefone identificável`
            : null,
        ].filter(Boolean);

        // Sem "parcial", ou sem avanço, ou teto atingido: acabou.
        if (!parcial.continuar || parcial.chats === 0 || rodada >= MAX_RODADAS) {
          if (parcial.continuar) {
            setStatus(
              `${resumo.join(" · ")} — ainda faltam conversas. Clique em Sincronizar histórico para continuar.`,
            );
          } else {
            setStatus(resumo.join(" · "));
          }
          router.refresh();
          return;
        }

        setStatus(`${resumo.join(" · ")} · continuando…`);
      }
    } finally {
      setOcupado(null);
    }
  }

  /** Uma passada no servidor. Devolve o que andou e se ficou coisa para trás. */
  async function umaRodada(
    force: boolean,
    ctx: { chatsAntes: number },
  ): Promise<{
    ok: boolean;
    continuar: boolean;
    chats: number;
    mensagens: number;
    leads: number;
    semTelefone: number;
  }> {
    const vazio = {
      ok: false,
      continuar: false,
      chats: 0,
      mensagens: 0,
      leads: 0,
      semTelefone: 0,
    };
    try {
      const res = await fetch("/api/whatsapp/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setErro(json.message ?? json.error ?? "Falha ao sincronizar.");
        setStatus(null);
        return vazio;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chats = 0;
      let mensagens = 0;
      let leads = 0;
      let semTelefone = 0;
      let continuar = false;

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
            // O acumulado entre rodadas, senão o contador zeraria a cada uma.
            setStatus(
              `${ctx.chatsAntes + chats} conversa(s) · última: ${evento.nome ?? evento.telefone}`,
            );
          } else if (evento.tipo === "fim") {
            mensagens = Number(evento.mensagensGravadas) || 0;
            leads = Number(evento.leadsNovos) || 0;
            semTelefone = Number(evento.semTelefone) || 0;
          } else if (evento.tipo === "parcial") {
            continuar = true;
            setStatus(String(evento.mensagem));
          } else if (evento.tipo === "erro" && !evento.telefone) {
            setErro(String(evento.mensagem));
          }
        }
      }

      return { ok: true, continuar, chats, mensagens, leads, semTelefone };
    } catch {
      setErro("Falha de rede ao sincronizar.");
      setStatus(null);
      return vazio;
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
          onClick={() => sincronizar(false)}
          loading={ocupado === "sync"}
          disabled={ocupado !== null}
        >
          Sincronizar histórico
        </Button>

        {/* Separado do botão normal de propósito: relê as 287 conversas, leva
            minutos e só faz sentido depois de mudar algo do lado do Evolution
            (ligar o Sync Full History, reler o QR). No uso do dia a dia o
            botão de cima é o certo.
            Mesmo assim vai de `secondary`, não `ghost`: neste fundo claro o
            ghost some e passa a parecer legenda — foi o que aconteceu com o
            "Testar conexão". Distinguir pelo texto funciona; por peso visual,
            não. */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => sincronizar(true)}
          loading={ocupado === "sync"}
          disabled={ocupado !== null}
          title="Relê todas as conversas, inclusive as já sincronizadas"
        >
          Reler tudo
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={testarConexao}
          loading={ocupado === "teste"}
          disabled={ocupado !== null}
        >
          Testar conexão
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => limpar(false)}
          loading={ocupado === "limpeza" && !previa}
          disabled={ocupado !== null}
        >
          Limpar leads inválidos
        </Button>
      </div>

      {previa && previa.invalidos > 0 ? (
        <div className="space-y-2 border border-accent p-3">
          <p className="text-xs">
            Seriam apagados <strong>{previa.invalidos}</strong> lead(s) sem
            telefone válido. Exemplos:
          </p>
          <ul className="text-xs text-muted space-y-0.5">
            {previa.amostra.map((l) => (
              <li key={l.phoneKey}>
                {l.nome ? `${l.nome} — ` : ""}
                {l.phoneKey}
                {/* O motivo, à vista: "@lid" é identificador interno do
                    WhatsApp, não telefone. Alguns validam por acaso como
                    número estrangeiro, então sem mostrar o JID a exclusão
                    pareceria arbitrária. */}
                {l.jid?.includes("@lid") ? (
                  <span className="text-accent"> · LID, não é telefone</span>
                ) : (
                  <span className="text-accent"> · telefone inválido</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            As mensagens deles saem junto. As conversas voltam na próxima
            sincronização, coladas no lead certo pelo telefone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => limpar(true)}
              loading={ocupado === "limpeza"}
              disabled={ocupado !== null}
            >
              Confirmar exclusão
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPrevia(null);
                setStatus(null);
              }}
              disabled={ocupado !== null}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {diagnostico ? (
        <ul className="text-xs space-y-0.5">
          {diagnostico.map((e) => (
            <li key={e.nome} className={e.ok ? "text-ink" : "text-accent"}>
              {e.ok ? "✓" : "✗"} {e.nome}
              {e.detalhe ? (
                <span className="text-muted"> — {e.detalhe}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {status ? <p className="text-xs text-muted">{status}</p> : null}
      {erro ? (
        <Alert variant="danger" className="text-xs">
          {erro}
        </Alert>
      ) : null}
    </div>
  );
}
