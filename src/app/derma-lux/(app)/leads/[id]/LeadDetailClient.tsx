"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import {
  ACTION_LABEL,
  EFFECTIVE_TEMPERATURES,
  isConfirmada,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
  OBJECTION_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  type EffectiveTemperature,
  type Objection,
} from "@/lib/leads/taxonomy";
import {
  instagramDirectUrl,
  instagramProfileUrl,
} from "@/lib/leads/instagram";
import { cn } from "@/lib/utils";
import { toWhatsAppNumber } from "../../../shared";
import {
  extraFields,
  formatPhoneBR,
  instagramDoLead,
  leadDisplayName,
  relativeDays,
  situacaoEfetiva,
  temperaturaEfetiva,
} from "../../../leads-shared";
import {
  registerDraftCopied,
  reanalyzeLead,
  updateLeadStatus,
  updateLeadTemperature,
} from "../../../leads-actions";
import type { LeadDetail, WaMessage } from "../../../leads-types";

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

/**
 * Onde o retorno de uma ação aparece.
 *
 * Os botões desta tela ficam a mais de uma tela de rolagem do topo. Enquanto o
 * aviso era renderizado lá em cima, no celular o clique parecia não fazer nada:
 * a resposta existia — inclusive "a IA não escreveu mensagem" —, só que fora
 * da vista. Agora cada aviso nasce ao lado do botão que o provocou.
 */
type Onde = "analise" | "mensagem";
type Feedback = { onde: Onde; tipo: "erro" | "info"; texto: string };

export function LeadDetailClient({ detail }: { detail: LeadDetail }) {
  const { lead, messages, analysis, rentals } = detail;
  // Mesma normalização que alimenta a IA, para a tela mostrar exatamente o que
  // o modelo leu — nem mais, nem menos.
  const extras = extraFields(lead.extra);
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const temperatura = temperaturaEfetiva(lead, analysis);
  // As locações já vêm ordenadas da mais recente para a mais antiga, então a
  // primeira é a última que aconteceu — é só disso que a derivação precisa.
  const agenda = rentals.length > 0 ? { ultima: rentals[0].date } : null;
  const situacao = situacaoEfetiva(lead, agenda);
  const [rascunho, setRascunho] = useState(analysis?.draft_message ?? "");

  /**
   * Marca a temperatura à mão, ou devolve o lead para a leitura da IA.
   *
   * Não mexe na análise: o que o modelo concluiu continua gravado e visível,
   * para a divergência ficar à vista em vez de sumir.
   */
  /**
   * Marca a situação à mão, ou devolve o lead para a derivação da agenda.
   *
   * Nulo não significa "novo": significa "deduza do fato". Quem alugou há
   * pouco volta a ser cliente sozinho.
   */
  /**
   * Roda uma ação e SEMPRE deixa um retorno na tela, ao lado do botão clicado.
   *
   * O try/catch não é decorativo. Sem ele, uma Server Action que estoura — a
   * função da Vercel cortada por tempo no meio de uma redação, a rede caindo no
   * meio — rejeitava dentro do `startTransition` sem ninguém escutando: o
   * spinner sumia, nada mudava na tela, e não havia como distinguir isso de um
   * botão quebrado.
   */
  function executar(onde: Onde, acao: () => Promise<Feedback | null>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const f = await acao();
        if (f) setFeedback(f);
      } catch (err) {
        setFeedback({
          onde,
          tipo: "erro",
          texto:
            err instanceof Error && err.message
              ? `Falhou: ${err.message}`
              : "A resposta não chegou. Se a IA estava escrevendo, pode ter passado do tempo limite do servidor — tente de novo.",
        });
      }
    });
  }

  /** O aviso da última ação, renderizado só no cartão que a disparou. */
  function aviso(onde: Onde) {
    if (!feedback || feedback.onde !== onde) return null;
    return (
      <Alert
        variant={feedback.tipo === "erro" ? "danger" : "info"}
        className="mt-3"
      >
        {feedback.texto}
      </Alert>
    );
  }

  function marcarSituacao(valor: LeadStatus | null) {
    executar("analise", async () => {
      const r = await updateLeadStatus(lead.id, valor);
      if (!r.ok) {
        return {
          onde: "analise",
          tipo: "erro",
          texto: r.error ?? "Não consegui salvar a situação.",
        };
      }
      router.refresh();
      return {
        onde: "analise",
        tipo: "info",
        texto:
          valor === null
            ? "Voltou a seguir a agenda."
            : `Marcado como ${LEAD_STATUS_LABEL[valor]}.`,
      };
    });
  }

  function marcarTemperatura(valor: EffectiveTemperature | null) {
    executar("analise", async () => {
      const r = await updateLeadTemperature(lead.id, valor);
      if (!r.ok) {
        return {
          onde: "analise",
          tipo: "erro",
          texto: r.error ?? "Não consegui salvar a temperatura.",
        };
      }
      router.refresh();
      return {
        onde: "analise",
        tipo: "info",
        texto:
          valor === null
            ? "Voltou a seguir a leitura da IA."
            : `Marcado como ${TEMPERATURE_LABEL[valor]}.`,
      };
    });
  }
  const [copiado, setCopiado] = useState(false);

  // O inicializador do useState roda uma vez só, na montagem. Depois de
  // router.refresh() a análise nova chega por props, mas o textarea ficaria
  // preso no valor antigo — na prática, uma mensagem recém-escrita pela IA
  // nunca apareceria na tela. Resetar comparando o id da análise durante o
  // render é o padrão do React para isso, e dispensa um efeito.
  const [analiseVista, setAnaliseVista] = useState(analysis?.id ?? null);
  if ((analysis?.id ?? null) !== analiseVista) {
    setAnaliseVista(analysis?.id ?? null);
    setRascunho(analysis?.draft_message ?? "");
  }

  const numero = toWhatsAppNumber(lead.phone_e164);
  const linkWhatsApp =
    numero && rascunho.trim()
      ? `https://wa.me/${numero}?text=${encodeURIComponent(rascunho)}`
      : numero
        ? `https://wa.me/${numero}`
        : null;

  // O ig.me não aceita texto na URL como o wa.me. Então o rascunho vai pela
  // área de transferência, copiado no mesmo toque que abre o direct — é o que
  // mais perto chega de "abrir já com a mensagem pronta".
  const instagram = instagramDoLead(lead);

  function aoAbrirInstagram() {
    if (!rascunho.trim()) return;
    // Sem await: segurar aqui adiaria a navegação, e a cópia precisa
    // acontecer dentro do gesto do toque para o navegador permitir.
    void copiar();
  }

  function analisar(gerarRascunho: boolean, onde: Onde) {
    executar(onde, async () => {
      const r = await reanalyzeLead(lead.id, { force: true, gerarRascunho });

      if (!r.ok) {
        return { onde, tipo: "erro", texto: r.error ?? "Falha na análise." };
      }

      router.refresh();

      // Sem isto, uma recusa da IA é indistinguível de um botão quebrado:
      // o spinner some e nada muda na tela.
      if (r.gerouRascunho) {
        return { onde, tipo: "info", texto: "Mensagem gerada abaixo." };
      }
      if (r.acao) {
        return {
          onde,
          tipo: "info",
          texto: `A IA reavaliou e manteve "${ACTION_LABEL[r.acao]}" — não escreveu mensagem.`,
        };
      }
      return { onde, tipo: "info", texto: "Análise concluída." };
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
      setFeedback({
        onde: "mensagem",
        tipo: "erro",
        texto:
          "O navegador bloqueou a cópia. Selecione o texto e copie à mão.",
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- identificação */}
      <Card variant="bordered">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm text-ink space-y-0.5">
            <p className="font-medium">{formatPhoneBR(lead.phone_e164)}</p>
            {lead.clinic_name ? <p>{lead.clinic_name}</p> : null}
            {instagram ? (
              <p>
                <a
                  href={instagramProfileUrl(instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  @{instagram}
                </a>
              </p>
            ) : null}
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
            {temperatura ? (
              <Badge variant={TEMPERATURE_VARIANT[temperatura]}>
                {isConfirmada(temperatura) ? "✓ " : ""}
                {TEMPERATURE_LABEL[temperatura]}
              </Badge>
            ) : null}
            {analysis ? (
              <Badge variant="neutral">{STAGE_LABEL[analysis.stage]}</Badge>
            ) : (
              <Badge variant="neutral">sem análise</Badge>
            )}
            {lead.needs_analysis ? (
              <Badge variant="warning">análise desatualizada</Badge>
            ) : null}
          </div>
        </div>

        {extras.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-xs uppercase tracking-wide text-muted mb-1.5">
              Da sua planilha
            </p>
            <dl className="text-sm grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
              {extras.map(([chave, valor]) => (
                <div key={chave} className="sm:contents">
                  <dt className="text-muted sm:text-right">{chave}</dt>
                  <dd className="text-ink m-0 break-words">{valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

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
                onClick={() => analisar(true, "analise")}
              >
                {analysis ? "Reanalisar" : "Analisar"}
              </Button>
            </div>

            {aviso("analise")}

            {/* -------------------------------------- situação à mão */}
            <div className="mb-4 pb-4 border-b border-line">
              <p className="text-xs uppercase tracking-wide text-muted mb-2">
                Situação
              </p>

              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUSES.map((v) => {
                  const ativo = situacao === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={pendente}
                      onClick={() => marcarSituacao(ativo ? null : v)}
                      className={cn(
                        "px-2.5 py-1 text-xs border transition-colors disabled:opacity-50",
                        ativo
                          ? "bg-ink text-paper border-ink"
                          : "bg-paper text-ink border-line hover:border-ink",
                      )}
                    >
                      {LEAD_STATUS_LABEL[v]}
                    </button>
                  );
                })}
              </div>

              {/* O que a agenda sabe. Antes da conciliação da 0014 isto era
                  sempre vazio, inclusive para clientes antigos. */}
              {agenda ? (
                <p className="text-xs text-muted mt-2">
                  {rentals.length} locação(ões) na agenda · última{" "}
                  {relativeDays(rentals[0].date)}
                  {lead.status ? null : " · situação derivada daí"}
                </p>
              ) : (
                <p className="text-xs text-muted mt-2">
                  Nenhuma locação na agenda.
                </p>
              )}

              {lead.status ? (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => marcarSituacao(null)}
                  className="text-xs text-muted underline mt-2 disabled:opacity-50"
                >
                  Voltar a seguir a agenda
                </button>
              ) : null}
            </div>

            {/* ------------------------------------ temperatura à mão */}
            <div className="mb-4 pb-4 border-b border-line">
              <p className="text-xs uppercase tracking-wide text-muted mb-2">
                Qualificação
              </p>

              <div className="flex flex-wrap gap-1.5">
                {EFFECTIVE_TEMPERATURES.map((t) => {
                  const ativo = temperatura === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={pendente}
                      onClick={() => marcarTemperatura(ativo ? null : t)}
                      className={cn(
                        "px-2.5 py-1 text-xs border transition-colors disabled:opacity-50",
                        ativo
                          ? "bg-ink text-paper border-ink"
                          : "bg-paper text-ink border-line hover:border-ink",
                      )}
                    >
                      {isConfirmada(t) ? "✓ " : ""}
                      {TEMPERATURE_LABEL[t]}
                    </button>
                  );
                })}
              </div>

              {/* A divergência fica à vista: marcar à mão não apaga o que o
                  modelo concluiu, e saber que ele discorda é informação. */}
              {lead.temperature_manual && analysis &&
              lead.temperature_manual !== analysis.temperature ? (
                <p className="text-xs text-muted mt-2">
                  Você marcou{" "}
                  <strong>{TEMPERATURE_LABEL[lead.temperature_manual]}</strong>;
                  a IA leu como {TEMPERATURE_LABEL[analysis.temperature]}.
                </p>
              ) : null}

              {lead.temperature_manual ? (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => marcarTemperatura(null)}
                  className="text-xs text-muted underline mt-2 disabled:opacity-50"
                >
                  Voltar a seguir a IA
                </button>
              ) : (
                <p className="text-xs text-muted mt-2">
                  Seguindo a leitura da IA. Toque para marcar à mão — só você
                  pode confirmar.
                </p>
              )}
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
                  onClick={() => analisar(true, "mensagem")}
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

              {instagram ? (
                <a
                  href={instagramDirectUrl(instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={aoAbrirInstagram}
                  className="px-4 py-2 text-sm font-medium border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
                >
                  Abrir no Instagram
                </a>
              ) : null}
            </div>

            {aviso("mensagem")}

            <p className="text-xs text-muted mt-3">
              A mensagem sai pelo seu WhatsApp, não pelo sistema. Revise antes
              de enviar — a IA erra.
            </p>

            {instagram ? (
              <p className="text-xs text-muted mt-1">
                No Instagram o texto não viaja no link: ele é copiado no mesmo
                toque, é só colar no direct de{" "}
                <a
                  href={instagramProfileUrl(instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  @{instagram}
                </a>
                .
              </p>
            ) : null}
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
