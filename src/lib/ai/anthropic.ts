import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente da Claude API, preguiçoso e memoizado.
 *
 * Mesmo espírito de getResend() em src/lib/email/client.ts: nada é lido do
 * ambiente no topo do módulo, então `npm run build` passa numa máquina sem a
 * chave, e o painel continua funcionando (só não gera sugestões).
 */
let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada — a análise de leads precisa dela.",
    );
  }

  cached = new Anthropic({ apiKey });
  return cached;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ============================================================================
//  Modelos
//  ----------------------------------------------------------------------------
//  Modo econômico, escolhido pelo dono: triagem barata em TODOS os leads e
//  redação com o modelo forte só onde vale a pena — lead quente/morno ou
//  clique explícito em "Gerar mensagem".
//
//  Os IDs abaixo são completos como estão; não acrescente sufixo de data.
// ============================================================================
export const TRIAGE_MODEL =
  process.env.LEAD_TRIAGE_MODEL ?? "claude-haiku-5-5";

/**
 * Busca de Instagram em lote. Continua no Haiku 4.5, à parte da triagem: no
 * teste com o Haiku 5.5 (23/10/2026) ele achou 1 perfil em 14 leads, contra
 * 8 em 38 do 4.5 na mesma fila, e o dono preferiu a busca completa à economia
 * — que ali é pequena, porque a maior parte do custo são as pesquisas na web.
 */
export const INSTAGRAM_LOTE_MODEL =
  process.env.INSTAGRAM_LOTE_MODEL ?? "claude-haiku-4-5";

/**
 * Padrão da redação. A tela do lead pode escolher outro por clique — ver
 * `DRAFT_MODELS` em ./models.ts —, mas a análise em lote sempre usa este, para
 * não existir jeito de a fatura crescer sem alguém ter decidido.
 */
export const DRAFT_MODEL =
  process.env.LEAD_DRAFT_MODEL ?? "claude-sonnet-5-5";
