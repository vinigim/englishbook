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
import { estimateCostUsd, type TokenUsage } from "@/lib/ai/cost";
import {
  DRAFT_MODELS,
  DRAFT_MODEL_LABEL,
  DRAFT_MODEL_NOTE,
  type DraftModel,
} from "@/lib/ai/models";
import {
  instagramDirectUrl,
  instagramProfileUrl,
} from "@/lib/leads/instagram";
import {
  apresentacaoInstagram,
  tratamentoDoMedico,
} from "@/lib/leads/apresentacao";
import { cn } from "@/lib/utils";
import { toWhatsAppNumber } from "../../../shared";
import {
  ajustarSaudacao,
  ehReacao,
  estadoContato,
  extraFields,
  formatPhoneBR,
  instagramDoLead,
  leadDisplayName,
  relativeDays,
  situacaoEfetiva,
  temperaturaEfetiva,
} from "../../../leads-shared";
import {
  marcarInstagramEnviado,
  registerDraftCopied,
  reanalyzeLead,
  updateLeadStatus,
  updateLeadTemperature,
} from "../../../leads-actions";
import type { LeadDetail, WaMessage } from "../../../leads-types";
import { BuscarInstagram } from "./BuscarInstagram";

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

/** O padrão da redação. Igual ao do servidor — aqui é só o valor inicial. */
const MODELO_PADRAO: DraftModel = "claude-sonnet-5";

export function LeadDetailClient({
  detail,
  tokenProfile,
}: {
  detail: LeadDetail;
  /** Média de tokens de uma análise com rascunho. Nulo = sem histórico ainda. */
  tokenProfile: TokenUsage | null;
}) {
  const { lead, messages, analysis, rentals } = detail;
  // A escolha vale por clique e não é gravada em lugar nenhum: assim não
  // existe jeito de ela ficar esquecida ligada no modelo caro.
  const [modelo, setModelo] = useState<DraftModel>(MODELO_PADRAO);
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
  // A saudação é ajustada à hora de agora: o rascunho pode ter sido escrito de
  // tarde e ser enviado de manhã.
  const [rascunho, setRascunho] = useState(() =>
    ajustarSaudacao(analysis?.draft_message ?? ""),
  );

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

  /**
   * Quanto uma reanálise com rascunho deve custar neste modelo.
   *
   * Em dólares, e não em dólares por milhão de tokens: ninguém decide nada com
   * o preço de tabela. Sem histórico ainda, cai para o preço por milhão em vez
   * de inventar uma média.
   */
  function custoEstimado(m: DraftModel): string {
    if (!tokenProfile) return "preço ainda sem histórico";
    const usd = estimateCostUsd(m, tokenProfile);
    // Meio centavo virando "US$ 0,01" esconde a diferença de 5x entre os
    // modelos, que é justamente o que a escolha precisa mostrar.
    return `~US$ ${usd.toFixed(4)}`;
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
    setRascunho(ajustarSaudacao(analysis?.draft_message ?? ""));
  }

  const numero = toWhatsAppNumber(lead.phone_e164);
  const linkWhatsApp =
    numero && rascunho.trim()
      ? `https://wa.me/${numero}?text=${encodeURIComponent(rascunho)}`
      : numero
        ? `https://wa.me/${numero}`
        : null;

  // O ig.me não aceita texto na URL como o wa.me. Então o texto vai pela
  // área de transferência, copiado no mesmo toque que abre o direct — é o que
  // mais perto chega de "abrir já com a mensagem pronta".
  const instagram = instagramDoLead(lead);
  const [trocarInstagram, setTrocarInstagram] = useState(false);

  const contato = estadoContato(lead);
  const tratamento = tratamentoDoMedico(lead.sheet_name, lead.display_name);

  /**
   * Copia a apresentação fixa, e não o rascunho da IA.
   *
   * Escolha do dono: pelo Instagram ele sempre se apresenta, em qualquer lead.
   * Não chama registerDraftCopied — o que saiu não foi o rascunho, e registrar
   * como se fosse estragaria a medida de quanto as mensagens da IA são usadas.
   */
  function aoAbrirInstagram() {
    const texto = apresentacaoInstagram(tratamento);
    // Primeiro a cópia síncrona. No iPhone, o link leva direto para o app do
    // Instagram e a página vai para o fundo antes de a Clipboard API (que é
    // assíncrona) terminar — a cópia falhava calada e o direct abria sem nada
    // para colar. A síncrona acaba antes de o toque seguir o link.
    if (copiarNaHora(texto)) return;
    // Reserva, sem await: segurar aqui adiaria a navegação.
    void navigator.clipboard.writeText(texto).catch(() => {
      setFeedback({
        onde: "mensagem",
        tipo: "erro",
        texto:
          "O navegador bloqueou a cópia da apresentação. Volte e toque de novo em \"Abrir no Instagram\".",
      });
    });
  }

  /**
   * Registra que a mensagem saiu pelo direct.
   *
   * O clique em "Abrir no Instagram" NÃO marca sozinho de propósito: abrir não
   * é enviar, e um lead marcado por engano é pior do que um não marcado — ele
   * sai da fila sem nunca ter recebido nada.
   */
  function marcarEnviado(enviado: boolean) {
    executar("mensagem", async () => {
      const r = await marcarInstagramEnviado(lead.id, enviado);
      if (!r.ok) {
        return {
          onde: "mensagem",
          tipo: "erro",
          texto: r.error ?? "Não consegui salvar a marcação.",
        };
      }
      router.refresh();
      return {
        onde: "mensagem",
        tipo: "info",
        texto: enviado
          ? "Marcado como enviado pelo Instagram e como frio confirmado."
          : "Marcação removida.",
      };
    });
  }

  function analisar(gerarRascunho: boolean, onde: Onde, exigirMensagem = false) {
    executar(onde, async () => {
      const r = await reanalyzeLead(lead.id, {
        force: true,
        gerarRascunho,
        exigirMensagem,
        draftModel: modelo,
      });

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
                  onClick={aoAbrirInstagram}
                  className="underline"
                >
                  @{instagram}
                </a>
                {/* O @ da planilha às vezes não existe mais, ou é de outra
                    pessoa. Daqui o dono busca outro (a IA evita o atual) ou
                    cola o certo. */}
                <button
                  type="button"
                  onClick={() => setTrocarInstagram((v) => !v)}
                  className="ml-2 text-xs text-muted underline"
                >
                  {trocarInstagram ? "cancelar" : "perfil errado?"}
                </button>
              </p>
            ) : (
              <BuscarInstagram leadId={lead.id} />
            )}
            {instagram && trocarInstagram ? (
              <BuscarInstagram
                leadId={lead.id}
                atual={instagram}
                onSalvo={() => setTrocarInstagram(false)}
              />
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
            {/* A situação marcada pelo dono ocupa o lugar da etapa lida pela
                IA, com ✓ como na temperatura. As duas usam "Novo", e mostrar
                a da IA depois de o dono marcar "Em conversa" parecia que a
                marcação não tinha pegado. */}
            {lead.status ? (
              <Badge variant="neutral">✓ {LEAD_STATUS_LABEL[lead.status]}</Badge>
            ) : analysis ? (
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

            {/* ------------------------------------ quem escreve */}
            <div className="mb-4 pb-4 border-b border-line">
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-muted mb-2">
                  Quem escreve a mensagem
                </span>
                <select
                  value={modelo}
                  disabled={pendente}
                  onChange={(e) => setModelo(e.target.value as DraftModel)}
                  className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none disabled:opacity-50"
                >
                  {DRAFT_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {DRAFT_MODEL_LABEL[m]} — {custoEstimado(m)} ·{" "}
                      {DRAFT_MODEL_NOTE[m]}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-xs text-muted mt-1.5">
                {tokenProfile
                  ? "Estimativa por cima, calculada em cima do que as suas últimas análises de fato gastaram. A triagem continua no Haiku — só a redação muda."
                  : "Ainda não há histórico para estimar o custo. Os preços aparecem depois da primeira mensagem gerada."}{" "}
                Vale só para este clique; o botão de analisar em lote continua
                no padrão.
              </p>
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
                  onClick={() => analisar(true, "mensagem", true)}
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

            {/*
              De quem é a bola, em uma linha. O caso do Instagram é o único que
              fica de fora: o bloco logo abaixo já diz isso, com o botão de
              desmarcar junto, e repetir seria dizer duas vezes no mesmo cartão.
            */}
            {contato.estado === "aguardando_ele" &&
            contato.canal === "instagram" ? null : (
              <p className="text-xs text-muted mt-3">
                {contato.estado === "devo_responder"
                  ? `Ele falou por último ${relativeDays(contato.desde)} — responder é com você.`
                  : contato.estado === "aguardando_ele" && !contato.canal
                    ? `Você marcou este lead como ${LEAD_STATUS_LABEL[lead.status ?? "em_conversa"]}, então ele não conta como nunca abordado — mas nenhuma mensagem sua está registrada aqui.`
                    : contato.estado === "aguardando_ele"
                    ? `Você mandou pelo WhatsApp ${relativeDays(contato.desde)} e ele ainda não respondeu.`
                    : lead.phone_e164
                      ? // Sem esta ressalva, o primeiro lead que ele abordar e
                        // vir marcado como "nunca abordado" parece defeito: a
                        // mensagem do WhatsApp só chega aqui quando volta do
                        // celular, na sincronização.
                        "Ninguém abordou este lead ainda — ou você mandou e ainda não sincronizou. O que sai pelo seu WhatsApp só aparece aqui depois de “Sincronizar histórico”."
                      : "Ninguém abordou este lead ainda."}
              </p>
            )}

            {/* A marcação de envio fica em linha própria: ela não é uma saída
                para outro app como as de cima, é o registro de que já saiu. */}
            {instagram ? (
              <div className="mt-3 pt-3 border-t border-line">
                {lead.instagram_sent_at ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success" className="whitespace-nowrap">
                      ✓ enviado pelo Instagram
                    </Badge>
                    <span className="text-xs text-muted">
                      {relativeDays(lead.instagram_sent_at)}
                    </span>
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => marcarEnviado(false)}
                      className="text-xs text-muted underline disabled:opacity-50"
                    >
                      desmarcar
                    </button>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pendente}
                      onClick={() => marcarEnviado(true)}
                    >
                      Já enviei pelo Instagram
                    </Button>
                    <p className="text-xs text-muted mt-1.5">
                      O que sai pelo WhatsApp volta na sincronização e o painel
                      percebe sozinho. O Instagram não volta nunca — essa marca
                      é a única forma de o sistema saber. Marcar também põe o
                      lead como frio confirmado.
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {aviso("mensagem")}

            <p className="text-xs text-muted mt-3">
              A mensagem sai pelo seu WhatsApp, não pelo sistema. Revise antes
              de enviar — a IA erra.
            </p>

            {instagram ? (
              <p className="text-xs text-muted mt-1">
                &ldquo;Abrir no Instagram&rdquo; copia a sua apresentação (não a
                mensagem acima), começando com &ldquo;
                {tratamento ? `Olá, ${tratamento}!` : "Olá!"}&rdquo;, no mesmo
                toque — é só colar no direct de{" "}
                <a
                  href={instagramProfileUrl(instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={aoAbrirInstagram}
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
  const rotulo = ehReacao(msg)
    ? "reação"
    : msg.message_type !== "text"
      ? (MEDIA_LABEL[msg.message_type] ?? "anexo")
      : null;

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
          {msg.provider === "instagram" ? " · Instagram" : null}
        </p>
      </div>
    </li>
  );
}

/**
 * Cópia síncrona, pelo caminho antigo (textarea + execCommand).
 *
 * Obsoleto no papel, mas é o único que termina DENTRO do toque em qualquer
 * navegador, inclusive o Safari do iPhone. Devolve falso quando o navegador
 * recusa, para quem chamou tentar a Clipboard API.
 */
function copiarNaHora(texto: string): boolean {
  if (typeof document === "undefined") return false;
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  // Fora da tela, e com fonte de 16px para o iOS não dar zoom ao focar.
  campo.style.position = "fixed";
  campo.style.top = "0";
  campo.style.left = "-9999px";
  campo.style.fontSize = "16px";
  document.body.appendChild(campo);
  try {
    campo.focus();
    campo.select();
    campo.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}
