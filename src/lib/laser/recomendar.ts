import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/ai/anthropic";
import { estimateCostUsd } from "@/lib/ai/cost";
import { IDS_BASE, KB_VERSAO } from "./base-conhecimento";
import { lerLocacao } from "./consultas";
import {
  motivoDeBloqueio,
  recomendacaoBloqueada,
  verificarRecomendacao,
} from "./guardas";
import { PROMPT_VERSAO, buildSystemPrompt, descreverCaso } from "./prompt";
import { RECOMENDACAO_JSON_SCHEMA, recomendacaoSchema } from "./schema";
import {
  normalizarEntrada,
  type EntradaConsulta,
  type Recomendacao,
  type RespostaConsulta,
} from "./tipos";

/**
 * Modelo da recomendação.
 *
 * Opus, e não Haiku como na triagem de leads: aqui o erro custa uma mancha na
 * pele de um paciente, não uma mensagem mal escrita. Uma consulta sai por
 * volta de US$ 0,05–0,15, e consultas iguais são reaproveitadas de graça.
 *
 * O ID é completo como está; não acrescente sufixo de data.
 */
export const LASER_MODEL = process.env.LASER_MODEL ?? "claude-opus-5-5";

const TABELA = "laser_consultas";

/**
 * Hash do que decide a resposta.
 *
 * Mesmo caso + mesma base + mesmo prompt + mesmo modelo = mesma consulta, e a
 * resposta gravada é devolvida sem chamar a API. A entrada é normalizada
 * antes (listas ordenadas, campos que não se aplicam zerados), para que marcar
 * as caixas em outra ordem não gere um hash diferente.
 */
export function hashConsulta(e: EntradaConsulta, fotos: string[] = []): string {
  const chave = {
    entrada: normalizarEntrada(e),
    v: `kb${KB_VERSAO}-p${PROMPT_VERSAO}-${LASER_MODEL}`,
    // Só entra quando há foto, para não mudar o hash das consultas sem foto.
    ...(fotos.length > 0 ? { fotos: [...fotos].sort() } : {}),
  };
  return createHash("sha256").update(jsonOrdenado(chave)).digest("hex");
}

/**
 * JSON com as chaves ordenadas em todos os níveis.
 *
 * Não use `JSON.stringify(obj, listaDeChaves)`: a lista vale para os objetos
 * aninhados também, e os campos da sessão anterior sumiriam do hash.
 */
function jsonOrdenado(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonOrdenado).join(",")}]`;
  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonOrdenado(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

/**
 * Foto do paciente, já comprimida no navegador.
 *
 * Só existe durante a requisição: vai para a IA e é descartada. Nada daqui é
 * gravado — nem a imagem, nem o base64. Fica só o `sha256`, dentro do hash da
 * consulta, para a resposta não ser reaproveitada para outra foto.
 */
export type FotoEnviada = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
  sha256: string;
};

/**
 * A recomendação chega como chamada de ferramenta, e não por
 * `output_config.format`.
 *
 * Com saída estruturada, a API compila o schema numa gramática, e a nossa
 * passou do tamanho que ela aceita ("The compiled grammar is too large", 400
 * em toda consulta) quando o schema cresceu. Ferramenta não estrita não
 * compila gramática: o schema guia a IA, e quem garante o formato é o zod,
 * com até duas devoluções para correção.
 */
const NOME_FERRAMENTA = "entregar_recomendacao";
const MAX_TENTATIVAS = 3;
const FERRAMENTA: Anthropic.Beta.BetaTool = {
  name: NOME_FERRAMENTA,
  description:
    "Entrega ao médico a recomendação final de parâmetros. Chame exatamente uma vez, com todos os campos do schema.",
  input_schema: RECOMENDACAO_JSON_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
};

type Resultado =
  | { ok: true; resposta: RespostaConsulta }
  | { ok: false; error: string; message: string };

export async function recomendarParametros(
  supabase: SupabaseClient,
  entradaBruta: EntradaConsulta,
  opcoes: { forcar?: boolean; rentalId?: string | null; fotos?: FotoEnviada[] } = {},
): Promise<Resultado> {
  const fotos = opcoes.fotos ?? [];
  // Normalizada uma vez: é ela que vai para a IA, para o hash e para o banco.
  const entrada = normalizarEntrada(entradaBruta);
  const rentalId = opcoes.rentalId ?? null;
  // Lida uma vez, em paralelo com o resto: a resposta mostra médico e data.
  const locacaoPromise = rentalId ? lerLocacao(supabase, rentalId) : Promise.resolve(null);

  // --- 1. Contraindicação absoluta: nem chama a IA ---------------------------
  const bloqueio = motivoDeBloqueio(entrada);
  if (bloqueio) {
    const recomendacao = recomendacaoBloqueada(bloqueio);
    const id = await gravar(supabase, {
      entrada,
      hash: hashConsulta(entrada),
      recomendacao,
      verificacoes: [],
      bloqueadoPor: bloqueio,
      model: null,
      tokens: SEM_TOKENS,
      costUsd: 0,
      rentalId,
      reaproveitadaDe: null,
    });
    return {
      ok: true,
      resposta: {
        id,
        locacao: await locacaoPromise,
        realizado: null,
        recomendacao,
        verificacoes: [],
        bloqueadoPor: bloqueio,
        reaproveitada: false,
        model: null,
        costUsd: 0,
      },
    };
  }

  // --- 2. Mesma consulta já feita: devolve a gravada -------------------------
  // Com foto, a resposta depende daquela imagem: o hash leva o sha256 dela, e
  // não se reaproveita nada — nem se oferece esta resposta a outro caso.
  const hash = hashConsulta(entrada, fotos.map((f) => f.sha256));
  if (!opcoes.forcar && fotos.length === 0) {
    const anterior = await buscarPorHash(supabase, hash);
    if (anterior) {
      // Cada pedido vira uma linha própria, para ter a sua locação e os seus
      // parâmetros realizados; a resposta da IA é copiada, sem custo.
      const id = await gravar(supabase, {
        entrada,
        hash,
        recomendacao: anterior.recomendacao,
        verificacoes: anterior.verificacoes,
        bloqueadoPor: null,
        model: anterior.model,
        tokens: SEM_TOKENS,
        costUsd: 0,
        rentalId,
        reaproveitadaDe: anterior.id,
      });
      return {
        ok: true,
        resposta: {
          ...anterior,
          id: id ?? anterior.id,
          locacao: await locacaoPromise,
          realizado: null,
          reaproveitada: true,
        },
      };
    }
  }

  // --- 3. Chamada à IA --------------------------------------------------------
  // A conversa só cresce (append-only): a resposta inteira volta, com os
  // blocos de thinking, quando é preciso pedir uma correção.
  const conversa: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: montarMensagem(entrada, fotos) },
  ];
  const uso = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let model = LASER_MODEL;
  let dados: z.infer<typeof recomendacaoSchema> | null = null;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS && !dados; tentativa += 1) {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await getAnthropic().beta.messages.create({
        model: LASER_MODEL,
        max_tokens: 16000,
        // Se o modelo recusar por política, a API repete a mesma chamada num
        // modelo de reserva escolhido por ela, dentro da mesma requisição.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // A ferramenta vem antes do system no prefixo, então entra no cache.
        tools: [FERRAMENTA],
        // "auto": o Opus 5.5 recusa tool_choice forçado (400). O prompt manda
        // chamar a ferramenta, e o laço abaixo confere que ela foi chamada.
        tool_choice: { type: "auto" },
        system: [
          {
            type: "text",
            text: buildSystemPrompt(),
            // 1 h e não 5 min: consultas chegam espaçadas, ao longo do
            // atendimento. Gravar custa 2× a entrada, mas uma única leitura
            // dentro da hora já paga a diferença.
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: conversa,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return {
          ok: false,
          error: "rate_limited",
          message: "Limite de uso da IA atingido. Tente de novo em um minuto.",
        };
      }
      if (err instanceof Anthropic.APIError) {
        console.error("[laser-recomendar] erro da API", err.status, err.message);
        // O motivo vai para a tela: "erro 400" sozinho não dá pista nenhuma, e
        // quem vê a tela é a equipe (rota restrita a lux_staff), não o paciente.
        const corpo = err.error as { error?: { message?: unknown } } | undefined;
        const motivo =
          typeof corpo?.error?.message === "string" ? corpo.error.message : err.message;
        return {
          ok: false,
          error: "ai_error",
          message: `A IA respondeu com erro ${err.status ?? ""}: ${motivo.slice(0, 300)}`,
        };
      }
      throw err;
    }

    const u = message.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    // input_tokens da API não inclui o que foi lido ou gravado em cache.
    uso.input += u.input_tokens + cacheRead + cacheWrite;
    uso.output += u.output_tokens;
    uso.cacheRead += cacheRead;
    uso.cacheWrite += cacheWrite;
    // Em caso de fallback, `message.model` é o modelo que de fato respondeu.
    model = message.model;

    if (message.stop_reason === "refusal") {
      return {
        ok: false,
        error: "ai_refusal",
        message: "A IA recusou este caso. Reformule as observações e tente de novo.",
      };
    }
    if (message.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "ai_truncated",
        message: "A resposta da IA veio cortada. Tente de novo.",
      };
    }

    const chamada = message.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock =>
        b.type === "tool_use" && b.name === NOME_FERRAMENTA,
    );
    conversa.push({ role: "assistant", content: message.content });

    if (!chamada) {
      conversa.push({
        role: "user",
        content: `Entregue a recomendação chamando a ferramenta ${NOME_FERRAMENTA}, com todos os campos.`,
      });
      continue;
    }

    const parsed = recomendacaoSchema.safeParse(chamada.input);
    if (parsed.success) {
      dados = parsed.data;
      break;
    }

    // Sem gramática, o formato não é garantido pela API: o erro volta para a
    // IA corrigir, em vez de virar "formato inesperado" para o médico.
    const problemas = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    console.error("[laser-recomendar] formato inválido, pedindo correção", problemas);
    conversa.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: chamada.id,
          is_error: true,
          content: `Formato inválido: ${problemas}. Chame ${NOME_FERRAMENTA} de novo com o formato certo.`,
        },
      ],
    });
  }

  if (!dados) {
    return {
      ok: false,
      error: "ai_bad_format",
      message: "A IA não entregou a recomendação no formato esperado. Tente de novo.",
    };
  }

  const recomendacao: Recomendacao = {
    ...dados,
    fontes: dados.fontes.filter((id) => IDS_BASE.includes(id)),
    // Sem foto não há o que analisar, diga o modelo o que disser.
    analise_foto: fotos.length > 0 ? dados.analise_foto : null,
    // Peça focada só existe na indicação de lesão focal, e vice-versa.
    parametros_focada:
      entrada.indicacao === "lesao_focal" ? dados.parametros_focada : null,
  };
  const verificacoes = verificarRecomendacao(entrada, recomendacao);

  // --- 4. Custo ----------------------------------------------------------------
  const tokens = uso;
  const costUsd = estimateCostUsd(model, {
    inputTokens: uso.input,
    outputTokens: uso.output,
    cacheReadTokens: uso.cacheRead,
    cacheWriteTokens: uso.cacheWrite,
    cacheWriteMultiplier: 2,
  });

  const id = await gravar(supabase, {
    entrada,
    hash,
    recomendacao,
    verificacoes,
    bloqueadoPor: null,
    model,
    tokens,
    costUsd,
    rentalId,
    reaproveitadaDe: null,
  });

  return {
    ok: true,
    resposta: {
      id,
      locacao: await locacaoPromise,
      realizado: null,
      recomendacao,
      verificacoes,
      bloqueadoPor: null,
      reaproveitada: false,
      model,
      costUsd,
    },
  };
}

/**
 * As fotos vêm antes do texto: o modelo lê melhor a imagem quando a pergunta
 * chega depois dela. Tudo isso fica depois do bloco em cache.
 */
function montarMensagem(
  entrada: EntradaConsulta,
  fotos: FotoEnviada[],
): string | Anthropic.Beta.BetaContentBlockParam[] {
  const caso = descreverCaso(entrada);
  if (fotos.length === 0) return caso;
  return [
    ...fotos.map(
      (f): Anthropic.Beta.BetaContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: f.mediaType, data: f.base64 },
      }),
    ),
    {
      type: "text",
      text: `${caso}\n\nHá ${fotos.length} foto(s) do paciente acima, da área a tratar. Preencha "analise_foto".`,
    },
  ];
}

// ============================================================================
//  Persistência
//  ----------------------------------------------------------------------------
//  Gravar é útil (histórico, custo, reaproveitamento), mas não essencial: se a
//  migração 0021 ainda não foi rodada, a recomendação aparece do mesmo jeito.
// ============================================================================

type Gravacao = {
  entrada: EntradaConsulta;
  hash: string;
  recomendacao: Recomendacao;
  verificacoes: string[];
  bloqueadoPor: string | null;
  model: string | null;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  rentalId: string | null;
  reaproveitadaDe: string | null;
};

const SEM_TOKENS = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function gravar(
  supabase: SupabaseClient,
  g: Gravacao,
): Promise<string | null> {
  const base = {
    entrada: g.entrada,
    content_hash: g.hash,
    kb_versao: KB_VERSAO,
    prompt_versao: PROMPT_VERSAO,
    recomendacao: g.recomendacao,
    verificacoes: g.verificacoes,
    bloqueado_por: g.bloqueadoPor,
    model: g.model,
    input_tokens: g.tokens.input,
    output_tokens: g.tokens.output,
    cache_read_tokens: g.tokens.cacheRead,
    cache_write_tokens: g.tokens.cacheWrite,
    cost_usd: g.costUsd,
  };
  const inserir = (linha: Record<string, unknown>) =>
    supabase.from(TABELA).insert(linha).select("id").single();

  let { data, error } = await inserir({
    ...base,
    rental_id: g.rentalId,
    reaproveitada_de: g.reaproveitadaDe,
  });

  // Sem a migração 0022 as colunas novas não existem: grava sem elas, e a
  // consulta só perde o vínculo com a locação.
  if (error && /rental_id|reaproveitada_de/.test(error.message)) {
    console.error("[laser-recomendar] 0022 não aplicada; gravando sem locação");
    ({ data, error } = await inserir(base));
  }

  if (error || !data) {
    console.error("[laser-recomendar] falha ao gravar consulta", error?.message);
    return null;
  }
  return data.id as string;
}

async function buscarPorHash(
  supabase: SupabaseClient,
  hash: string,
): Promise<RespostaConsulta | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("id, recomendacao, verificacoes, bloqueado_por, model")
    .eq("content_hash", hash)
    .is("bloqueado_por", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const rec = recomendacaoSchema.safeParse(data.recomendacao);
  if (!rec.success) return null;

  return {
    id: data.id as string,
    locacao: null,
    realizado: null,
    recomendacao: rec.data,
    verificacoes: (data.verificacoes as string[] | null) ?? [],
    bloqueadoPor: null,
    reaproveitada: true,
    model: (data.model as string | null) ?? null,
    costUsd: 0,
  };
}
