/**
 * Preços por milhão de tokens, para gravar o custo de cada análise.
 *
 * Existe para que o dono possa auditar a fatura sem adivinhar: toda linha de
 * wa_lead_analyses guarda o modelo, os tokens e o custo calculado aqui.
 *
 * Se um preço mudar, ou um modelo novo entrar, é este mapa que se atualiza —
 * análises antigas mantêm o custo que foi gravado na época.
 */
type Preco = {
  /** US$ por milhão de tokens de entrada. */
  input: number;
  /** US$ por milhão de tokens de saída. */
  output: number;
  /** Leitura de cache sai por volta de 10% da entrada. */
  cacheRead: number;
  /**
   * Tabela de prompt longo: o Haiku 5.5 cobra 5× mais quando o prompt de UMA
   * chamada passa de 100 mil tokens. Quem soma várias chamadas (a busca de
   * Instagram com continuação) calcula o custo chamada a chamada.
   */
  longo?: { acimaDe: number; input: number; output: number; cacheRead: number };
};

// Os modelos antigos ficam: a tela da ficha estima o custo com este mapa, e
// análises gravadas com eles continuam aparecendo.
const PRECOS: Record<string, Preco> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    longo: { acimaDe: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};

export type TokenUsage = {
  /**
   * TODA a entrada da chamada: a comum, a lida do cache e a gravada nele. A
   * API devolve as três separadas (`input_tokens` é só a parte sem cache);
   * quem chama soma.
   */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  /**
   * Tokens gravados no cache nesta chamada, já incluídos em `inputTokens`.
   * Custam mais que a entrada comum: 1,25× com TTL de 5 min, 2× com TTL de 1 h.
   */
  cacheWriteTokens?: number;
  cacheWriteMultiplier?: number;
};

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const tabela = PRECOS[model];
  // Modelo desconhecido: devolve 0 em vez de chutar. Melhor um custo ausente
  // do que um número inventado num relatório financeiro.
  if (!tabela) return 0;
  const preco =
    tabela.longo && usage.inputTokens > tabela.longo.acimaDe ? tabela.longo : tabela;

  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const entradaCheia = Math.max(usage.inputTokens - cacheRead - cacheWrite, 0);

  const total =
    (entradaCheia / 1_000_000) * preco.input +
    (cacheRead / 1_000_000) * preco.cacheRead +
    (cacheWrite / 1_000_000) * preco.input * (usage.cacheWriteMultiplier ?? 1.25) +
    (usage.outputTokens / 1_000_000) * preco.output;

  // 6 casas é a precisão da coluna numeric(10,6) em wa_lead_analyses.
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function knownModel(model: string): boolean {
  return model in PRECOS;
}

/**
 * Preço de tabela, para a tela poder mostrar de onde sai a estimativa.
 *
 * Este módulo não importa o SDK da Anthropic, então pode ser lido por client
 * component sem arrastar nada para o bundle do navegador.
 */
export function precoDoModelo(model: string): Preco | null {
  return PRECOS[model] ?? null;
}
