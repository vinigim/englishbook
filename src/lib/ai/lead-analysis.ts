import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadRental, WaMessage } from "@/app/derma-lux/leads-types";
import {
  daysSince,
  extraFields,
  leadDisplayName,
  parseSheetDate,
  relativeDays,
  sheetContactDate,
} from "@/app/derma-lux/leads-shared";
import { DRAFT_MODEL, TRIAGE_MODEL, getAnthropic } from "./anthropic";
import { estimateCostUsd } from "./cost";
import { PROMPT_VERSION, buildSystemPrompt, type EquipmentInfo } from "./prompt";
import {
  DRAFT_JSON_SCHEMA,
  TRIAGE_JSON_SCHEMA,
  draftSchema,
  triageSchema,
  type DraftOutput,
  type TriageOutput,
} from "./schema";

/** Janela de conversa enviada à IA. */
const MAX_MESSAGES = 60;
const MAX_TRANSCRIPT_CHARS = 12_000;


export type AnalysisInput = {
  lead: Lead;
  messages: WaMessage[];
  rentals: LeadRental[];
  equipment: EquipmentInfo[];
};

export type AnalysisRecord = {
  lead_id: string;
  version: number;
  content_hash: string;
  prompt_version: number;
  stage: TriageOutput["stage"];
  temperature: TriageOutput["temperature"];
  intent: string | null;
  summary: string | null;
  objections: string[];
  equipment_interest: string[];
  specialty: string | null;
  days_since_last_contact: number | null;
  is_existing_customer: boolean | null;
  recommended_action: DraftOutput["recommended_action"] | null;
  draft_message: string | null;
  rationale: string | null;
  confidence: number | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
};

// ============================================================================
//  Montagem do contexto
// ============================================================================

const MEDIA_LABEL: Record<string, string> = {
  image: "[imagem]",
  audio: "[áudio]",
  video: "[vídeo]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contact: "[contato]",
  other: "[anexo]",
};

/**
 * Transcrição da conversa.
 *
 * Mídia vira rótulo: o binário nunca é baixado nem enviado. Essa é a primeira
 * linha de defesa de LGPD — a regra no prompt é a segunda.
 *
 * A janela corta as mensagens mais antigas, mas SEMPRE preserva o final da
 * conversa, que é onde está a decisão a tomar.
 */
export function buildTranscript(messages: WaMessage[]): string {
  const recentes = messages.slice(-MAX_MESSAGES);

  const linhas = recentes.map((m) => {
    const quem = m.direction === "in" ? "CLIENTE" : "LUX DERMA";
    const quando = m.sent_at.slice(0, 10);

    let texto = m.body ?? "";
    if (m.message_type !== "text") {
      const rotulo = MEDIA_LABEL[m.message_type] ?? "[anexo]";
      const legenda = m.caption ?? m.body ?? "";
      texto = legenda ? `${rotulo} ${legenda}` : rotulo;
    }

    return `[${quando}] ${quem}: ${texto}`.trim();
  });

  let transcricao = linhas.join("\n");

  // Corta pelo começo se ainda estiver longa demais.
  if (transcricao.length > MAX_TRANSCRIPT_CHARS) {
    transcricao =
      "(…início da conversa omitido…)\n" +
      transcricao.slice(transcricao.length - MAX_TRANSCRIPT_CHARS);
  }

  return transcricao;
}

function buildContext(input: AnalysisInput): string {
  const { lead, messages, rentals } = input;

  const ultima = messages[messages.length - 1];
  const diasSemContato = daysSince(lead.last_message_at);
  const diasDesdeEntrada = daysSince(lead.last_inbound_at);

  const extras = extraFields(lead.extra);

  // Lead vindo da planilha não tem mensagem, então `last_message_at` é nulo e
  // o modelo ficaria sem qualquer noção de tempo. A data anotada na planilha é
  // a única pista de quando houve contato — e dois meses de silêncio pedem
  // follow-up, não "aguardar resposta".
  const contatoNaPlanilha =
    diasSemContato == null ? sheetContactDate(extras) : null;
  const diasPelaPlanilha = contatoNaPlanilha
    ? daysSince(contatoNaPlanilha.data.toISOString())
    : null;

  const esperandoResposta =
    lead.last_inbound_at != null &&
    (lead.last_outbound_at == null ||
      new Date(lead.last_inbound_at) > new Date(lead.last_outbound_at));

  const contato = [
    `Nome: ${leadDisplayName(lead)}`,
    lead.clinic_name ? `Clínica: ${lead.clinic_name}` : null,
    lead.specialty ? `Especialidade: ${lead.specialty}` : null,
    lead.city ? `Cidade: ${lead.city}${lead.uf ? `/${lead.uf}` : ""}` : null,
    `Origem do cadastro: ${lead.source}`,
    diasSemContato != null
      ? `Dias desde a última mensagem (qualquer lado): ${diasSemContato}`
      : contatoNaPlanilha && diasPelaPlanilha != null
        ? `Nenhuma mensagem de WhatsApp registrada. Mas a planilha anota, em "${contatoNaPlanilha.chave}", um contato em ${contatoNaPlanilha.data.toISOString().slice(0, 10)} — ou seja, há ${diasPelaPlanilha} dias (${relativeDays(contatoNaPlanilha.data.toISOString())}).`
        : "Nenhuma mensagem registrada",
    diasDesdeEntrada != null
      ? `Dias desde a última mensagem DELE: ${diasDesdeEntrada}`
      : null,
    `Quem falou por último: ${ultima ? (ultima.direction === "in" ? "o cliente" : "nós") : "ninguém"}`,
    esperandoResposta
      ? "ATENÇÃO: o cliente falou por último e ainda não foi respondido."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const historico =
    rentals.length > 0
      ? rentals
          .map((r) => {
            const partes = [
              r.date,
              r.equipmentName ?? "equipamento não informado",
              r.price != null ? `R$ ${r.price.toFixed(2)}` : null,
              r.specialty,
            ].filter(Boolean);
            return `- ${partes.join(" · ")}`;
          })
          .join("\n")
      : "- Nenhuma locação registrada na agenda.";

  const transcricao = messages.length
    ? buildTranscript(messages)
    : "(Nenhuma conversa registrada. Este lead veio da planilha de clientes.)";

  // Colunas que vieram da planilha e não têm campo próprio. Costumam trazer
  // justamente o que decide a abordagem: status do último contato, se o
  // número tem WhatsApp, o Instagram da clínica.
  const blocoExtras =
    extras.length > 0
      ? `\n\n<ficha_da_planilha>
${extras
  .map(([chave, valor]) => {
    // Toda data ganha o tempo decorrido ao lado: "17/07/2026" sozinho não
    // diz nada ao modelo, "há 2 meses" diz tudo.
    const data = parseSheetDate(valor);
    return data
      ? `${chave}: ${valor} (${relativeDays(data.toISOString())})`
      : `${chave}: ${valor}`;
  })
  .join("\n")}
</ficha_da_planilha>`
      : "";

  return `<contato>
${contato}
</contato>

<historico_lux_derma>
${historico}
</historico_lux_derma>${blocoExtras}

<conversa>
${transcricao}
</conversa>`;
}

/**
 * Hash do que foi efetivamente enviado à IA.
 *
 * Se a conversa e os dados não mudaram, o hash é o mesmo e reaproveitamos a
 * análise em vez de pagar de novo. PROMPT_VERSION entra no cálculo: mudar o
 * prompt invalida tudo, que é o comportamento desejado.
 */
export function contentHash(input: AnalysisInput): string {
  const partes = [
    String(PROMPT_VERSION),
    input.lead.status,
    input.lead.specialty ?? "",
    input.lead.clinic_name ?? "",
    // Sem isto, corrigir um extra não invalidaria a análise vigente.
    extraFields(input.lead.extra)
      .map(([c, v]) => `${c}=${v}`)
      .join(";"),
    input.rentals
      .map((r) => r.id)
      .sort()
      .join(","),
    input.equipment
      .map((e) => e.name)
      .sort()
      .join(","),
    ...input.messages.slice(-MAX_MESSAGES).map((m) => m.provider_message_id),
  ];

  return createHash("sha256").update(partes.join("|")).digest("hex");
}

// ============================================================================
//  Chamadas ao modelo
// ============================================================================

type Usage = { input: number; output: number; cacheRead: number };

function readUsage(message: { usage?: Anthropic.Usage }): Usage {
  const u = message.usage;
  return {
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
  };
}

async function runTriage(
  system: Anthropic.TextBlockParam[],
  context: string,
): Promise<{ output: TriageOutput; usage: Usage }> {
  const client = getAnthropic();

  const message = await client.messages.parse({
    model: TRIAGE_MODEL,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: "user",
        content: `${context}\n\nClassifique este lead.`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(TRIAGE_JSON_SCHEMA) },
  });

  const parsed = triageSchema.safeParse(message.parsed_output);
  if (!parsed.success) {
    throw new Error(
      `triagem devolveu formato inesperado: ${parsed.error.issues[0]?.message ?? "sem detalhe"}`,
    );
  }

  return { output: parsed.data, usage: readUsage(message) };
}

async function runDraft(
  system: Anthropic.TextBlockParam[],
  context: string,
  triage: TriageOutput,
): Promise<{ output: DraftOutput; usage: Usage }> {
  const client = getAnthropic();

  const resumoTriagem = `Leitura da triagem:
- Estágio: ${triage.stage}
- Temperatura: ${triage.temperature}
- Intenção: ${triage.intent}
- Objeções: ${triage.objections.join(", ") || "nenhuma"}
- Equipamentos de interesse: ${triage.equipment_interest.join(", ") || "não identificado"}
- Já é cliente: ${triage.is_existing_customer ? "sim" : "não"}`;

  const message = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4000,
    system,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `${context}\n\n${resumoTriagem}\n\nEscolha a ação e escreva a mensagem.`,
      },
    ],
    output_config: {
      effort: "low",
      format: jsonSchemaOutputFormat(DRAFT_JSON_SCHEMA),
    },
  });

  const parsed = draftSchema.safeParse(message.parsed_output);
  if (!parsed.success) {
    throw new Error(
      `redação devolveu formato inesperado: ${parsed.error.issues[0]?.message ?? "sem detalhe"}`,
    );
  }

  return { output: parsed.data, usage: readUsage(message) };
}

// ============================================================================
//  Orquestração
// ============================================================================

export type AnalyzeOptions = {
  /** Ignora o cache por hash e reanalisa do zero. */
  force?: boolean;
  /** Gera o rascunho mesmo num lead frio (o botão "Gerar mensagem"). */
  forceDraft?: boolean;
};

export type AnalyzeOutcome =
  | { status: "cached"; analysisId: string }
  | { status: "analyzed"; record: AnalysisRecord }
  | { status: "skipped"; reason: string };

/**
 * Analisa um lead e grava o resultado.
 *
 * Modo econômico: a triagem (modelo barato) roda em todo mundo; a redação
 * (modelo forte) só entra em lead quente ou morno, ou quando o dono pede
 * explicitamente. Lead frio fica classificado e ranqueado, mas não consome o
 * modelo caro só para produzir uma mensagem que ninguém vai mandar.
 */
export async function analyzeLead(
  admin: SupabaseClient,
  input: AnalysisInput,
  options: AnalyzeOptions = {},
): Promise<AnalyzeOutcome> {
  const hash = contentHash(input);

  if (!options.force) {
    const { data: existente } = await admin
      .from("wa_lead_analyses")
      .select("id")
      .eq("lead_id", input.lead.id)
      .eq("content_hash", hash)
      .limit(1)
      .maybeSingle();

    if (existente) {
      // Nada mudou desde a última análise: não há o que pagar de novo.
      await admin
        .from("wa_leads")
        .update({ needs_analysis: false })
        .eq("id", input.lead.id);
      return { status: "cached", analysisId: (existente as { id: string }).id };
    }
  }

  const context = buildContext(input);

  // O bloco estável leva cache_control e vem ANTES do contexto volátil: numa
  // rodada em lote, só a primeira análise paga o prompt inteiro.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(input.equipment),
      cache_control: { type: "ephemeral" },
    },
  ];

  const triagem = await runTriage(system, context);

  const valeRascunho =
    options.forceDraft ||
    triagem.output.temperature === "quente" ||
    triagem.output.temperature === "morno";

  let redacao: { output: DraftOutput; usage: Usage } | null = null;
  if (valeRascunho) {
    redacao = await runDraft(system, context, triagem.output);
  }

  const custo =
    estimateCostUsd(TRIAGE_MODEL, {
      inputTokens: triagem.usage.input,
      outputTokens: triagem.usage.output,
      cacheReadTokens: triagem.usage.cacheRead,
    }) +
    (redacao
      ? estimateCostUsd(DRAFT_MODEL, {
          inputTokens: redacao.usage.input,
          outputTokens: redacao.usage.output,
          cacheReadTokens: redacao.usage.cacheRead,
        })
      : 0);

  // Versão seguinte deste lead. A constraint unique (lead_id, version) é a
  // rede caso dois cliques simultâneos tentem gravar a mesma versão.
  const { data: ultima } = await admin
    .from("wa_lead_analyses")
    .select("version")
    .eq("lead_id", input.lead.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((ultima as { version: number } | null)?.version ?? 0) + 1;

  const record: AnalysisRecord = {
    lead_id: input.lead.id,
    version,
    content_hash: hash,
    prompt_version: PROMPT_VERSION,
    stage: triagem.output.stage,
    temperature: triagem.output.temperature,
    intent: triagem.output.intent,
    summary: triagem.output.summary,
    objections: triagem.output.objections,
    equipment_interest: triagem.output.equipment_interest,
    specialty: triagem.output.specialty,
    days_since_last_contact: daysSince(input.lead.last_message_at),
    is_existing_customer: triagem.output.is_existing_customer,
    recommended_action: redacao?.output.recommended_action ?? null,
    draft_message: redacao?.output.draft_message ?? null,
    rationale: redacao?.output.rationale ?? null,
    confidence: redacao?.output.confidence ?? triagem.output.confidence,
    // O modelo gravado é o que produziu a recomendação final.
    model: redacao ? DRAFT_MODEL : TRIAGE_MODEL,
    input_tokens: triagem.usage.input + (redacao?.usage.input ?? 0),
    output_tokens: triagem.usage.output + (redacao?.usage.output ?? 0),
    cache_read_tokens:
      triagem.usage.cacheRead + (redacao?.usage.cacheRead ?? 0),
    cost_usd: custo,
  };

  const { error } = await admin.from("wa_lead_analyses").insert(record);

  if (error) {
    // 23505: outra requisição gravou esta mesma análise primeiro. Não é falha.
    if (error.code === "23505") {
      return { status: "skipped", reason: "análise concorrente já gravada" };
    }
    throw new Error(`falha ao gravar análise: ${error.message}`);
  }

  await admin
    .from("wa_leads")
    .update({ needs_analysis: false })
    .eq("id", input.lead.id);

  return { status: "analyzed", record };
}
