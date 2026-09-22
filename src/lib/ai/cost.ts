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
};

const PRECOS: Record<string, Preco> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
};

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const preco = PRECOS[model];
  // Modelo desconhecido: devolve 0 em vez de chutar. Melhor um custo ausente
  // do que um número inventado num relatório financeiro.
  if (!preco) return 0;

  const cacheRead = usage.cacheReadTokens ?? 0;
  const entradaCheia = Math.max(usage.inputTokens - cacheRead, 0);

  const total =
    (entradaCheia / 1_000_000) * preco.input +
    (cacheRead / 1_000_000) * preco.cacheRead +
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
