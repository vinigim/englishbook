"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import {
  ACTION_LABEL,
  OBJECTION_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  type Objection,
  type Temperature,
} from "@/lib/leads/taxonomy";
import { cn } from "@/lib/utils";
import { toWhatsAppNumber } from "../../../shared";
import {
  formatPhoneBR,
  leadDisplayName,
  relativeDays,
} from "../../../leads-shared";
import { registerDraftCopied, reanalyzeLead } from "../../../leads-actions";
import type { LeadDetail, WaMessage } from "../../../leads-types";

const TEMPERATURE_VARIANT: Record<Temperature, "danger" | "info" | "neutral"> = {
  quente: "danger",
  morno: "info",
  frio: "neutral",
};

const MEDIA_LABEL: Record<string, string> = {
  image: "🖼️ imagem",
  audio: "🎤 áudio",
  video: "🎬 vídeo",
  document: "📄 documento",
  sticker: "🙂 figurinha",
  location: "📍 localização",
  contact: "👤 contato",
  other: "anexo",
};

export function LeadDetailClient({ detail }: { detail: LeadDetail }) {
  const { lead, messages, analysis, rentals } = detail;
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState(analysis?.draft_message ?? "");
  const [copiado, setCopiado] = useState(false);

  const numero = toWhatsAppNumber(lead.phone_e164);
  const linkWhatsApp =
    numero && rascunho.trim()
      ? `https://wa.me/${numero}?text=${encodeURIComponent(rascunho)}`
      : numero
        ? `https://wa.me/${numero}`
        : null;

  function analisar(gerarRascunho: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await reanalyzeLead(lead.id, { force: true, gerarRascunho });
      if (!r.ok) setErro(r.error ?? "Falha na análise.");
      else router.refresh();
    });
  }

  async function copiar() {
    if (!rascunho.trim()) return;
    try {
      await navigator.clipboard.writeText(rascunho);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      if (analysis) {
        void registerDraftCopied(lead.id, analysis.id, rascunho);
      }
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione o texto e copie à mão.");
    }
  }

  return (
    <div className="space-y-4">
      {erro ? (
        <Alert variant="danger" title="Deu problema">
          {erro}
        </Alert>
      ) : null}

      {/* ---------------------------------------------------- identificação */}
      <Card variant="bordered">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm text-ink space-y-0.5">
            <p className="font-medium">{formatPhoneBR(lead.phone_e164)}</p>
            {lead.clinic_name ? <p>{lead.clinic_name}</p> : null}
            <p className="text-muted">
              {[lead.specialty, lead.city].filter(Boolean).join(" · ") ||
                "Especialidade e cidade não informadas"}
            </p>
            <p className="text-muted text-xs">
              Origem: {lead.source} · última mensagem{" "}
              {relativeDays(lead.last_message_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {analysis ? (
              <>
                <Badge variant={TEMPERATURE_VARIANT[analysis.temperature]}>
                  {TEMPERATURE_LABEL[analysis.temperature]}
                </Badge>
                <Badge variant="neutral">{STAGE_LABEL[analysis.stage]}</Badge>
              </>
            ) : (
              <Badge variant="neutral">sem análise</Badge>
            )}
            {lead.needs_analysis ? (
              <Badge variant="warning">análise desatualizada</Badge>
            ) : null}
          </div>
        </div>

        {rentals.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-xs uppercase tracking-wide text-muted mb-1.5">
              Histórico na agenda
            </p>
            <ul className="text-sm text-ink space-y-0.5">
              {rentals.map((r) => (
                <li key={r.id}>
                  {r.date} · {r.equipmentName ?? "equipamento não informado"}
                  {r.price != null
                    ? ` · ${r.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* -------------------------------------------------------- conversa */}
        <Card variant="bordered" className="order-2 lg:order-1">
          <CardTitle className="text-xl mb-3">Conversa</CardTitle>
          {/*
            A altura da conversa é relativa à tela no celular: um bloco fixo de
            32rem ocuparia quase tudo e o scroll aninhado prenderia o dedo.
          */}
          {messages.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhuma mensagem registrada. Este lead veio da planilha — conecte
              o WhatsApp e sincronize o histórico para ver a conversa aqui.
            </p>
          ) : (
            <ol className="space-y-2 max-h-[60vh] lg:max-h-[32rem] overflow-y-auto pr-1">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
            </ol>
          )}
        </Card>

        {/* -------------------------------------------- análise e sugestão */}
        <div className="order-1 lg:order-2 space-y-4">
          <Card variant="bordered">
            <div className="flex items-start justify-between gap-3 mb-3">
              <CardTitle className="text-xl">Leitura da IA</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                loading={pendente}
                onClick={() => analisar(true)}
              >
                {analysis ? "Reanalisar" : "Analisar"}
              </Button>
            </div>

            {!analysis ? (
              <p className="text-sm text-muted">
                Este lead ainda não foi analisado.
              </p>
            ) : (
              <div className="space-y-3 text-sm">
                {analysis.summary ? (
                  <p className="text-ink">{analysis.summary}</p>
                ) : null}

                {analysis.intent ? (
                  <p>
                    <span className="text-muted">O que ele quer: </span>
                    <span className="text-ink">{analysis.intent}</span>
                  </p>
                ) : null}

                {analysis.objections.length > 0 &&
                analysis.objections[0] !== "sem_objecao" ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted">Objeções:</span>
                    {analysis.objections.map((o) => (
                      <Badge key={o} variant="warning">
                        {OBJECTION_LABEL[o as Objection] ?? o}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {analysis.equipment_interest.length > 0 ? (
                  <p>
                    <span className="text-muted">Interesse: </span>
                    <span className="text-ink">
                      {analysis.equipment_interest.join(", ")}
                    </span>
                  </p>
                ) : null}

                <p className="text-xs text-muted pt-2 border-t border-line">
                  {analysis.model} · versão {analysis.version}
                  {analysis.confidence != null
                    ? ` · confiança ${Math.round(analysis.confidence * 100)}%`
                    : ""}
                  {analysis.cost_usd != null
                    ? ` · US$ ${Number(analysis.cost_usd).toFixed(4)}`
                    : ""}
                </p>
              </div>
            )}
          </Card>

          <Card variant="bordered">
            <CardTitle className="text-xl mb-1">Próxima mensagem</CardTitle>

            {analysis?.recommended_action ? (
              <p className="text-sm font-semibold text-accent tracking-tight mb-1">
                {ACTION_LABEL[analysis.recommended_action]}
              </p>
            ) : null}

            {analysis?.rationale ? (
              <p className="text-xs text-muted mb-3">{analysis.rationale}</p>
            ) : null}

            {analysis && !analysis.draft_message ? (
              <div className="mb-3">
                <p className="text-sm text-muted mb-2">
                  {analysis.recommended_action === "aguardar"
                    ? "A IA entendeu que a bola está com o lead e não há o que mandar agora."
                    : analysis.recommended_action === "descartar"
                      ? "A IA classificou este contato como fora do perfil."
                      : "Ainda não há rascunho para este lead."}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={pendente}
                  onClick={() => analisar(true)}
                >
                  Gerar mensagem assim mesmo
                </Button>
              </div>
            ) : null}

            {/*
              text-base no celular: abaixo de 16px o Safari do iPhone dá zoom
              na página inteira quando o campo recebe foco.
            */}
            <textarea
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              rows={7}
              placeholder="A mensagem sugerida aparece aqui. Você pode editar antes de enviar."
              className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none resize-y"
            />

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button size="sm" onClick={copiar} disabled={!rascunho.trim()}>
                {copiado ? "Copiado!" : "Copiar mensagem"}
              </Button>

              {linkWhatsApp ? (
                <a
                  href={linkWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
                >
                  Abrir no WhatsApp
                </a>
              ) : null}
            </div>

            <p className="text-xs text-muted mt-3">
              A mensagem sai pelo seu WhatsApp, não pelo sistema. Revise antes
              de enviar — a IA erra.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: WaMessage }) {
  const daEmpresa = msg.direction === "out";
  const texto = msg.body ?? msg.caption ?? "";
  const rotulo =
    msg.message_type !== "text" ? (MEDIA_LABEL[msg.message_type] ?? "anexo") : null;

  return (
    <li className={cn("flex", daEmpresa ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 text-sm",
          daEmpresa
            ? "bg-brand text-paper"
            : "bg-line/50 text-ink border border-line",
        )}
      >
        {rotulo ? (
          <p className={cn("text-xs mb-0.5", daEmpresa ? "text-paper/70" : "text-muted")}>
            {rotulo}
            {msg.media_url ? (
              <>
                {" · "}
                <a
                  href={msg.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  abrir
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        {texto ? <p className="whitespace-pre-wrap">{texto}</p> : null}

        <p
          className={cn(
            "text-[10px] mt-1",
            daEmpresa ? "text-paper/60" : "text-muted",
          )}
        >
          {new Date(msg.sent_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </li>
  );
}
