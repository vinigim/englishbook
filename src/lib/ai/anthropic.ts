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
  process.env.LEAD_TRIAGE_MODEL ?? "claude-haiku-4-5";

export const DRAFT_MODEL =
  process.env.LEAD_DRAFT_MODEL ?? "claude-sonnet-5";
