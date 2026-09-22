/**
 * Catálogo dos modelos que podem escrever a mensagem.
 *
 * Mora aqui, e não em `anthropic.ts`, porque a tela do lead precisa dele para
 * montar o seletor — e ela é client component. Importar de lá arrastaria o SDK
 * da Anthropic inteiro para o bundle do navegador.
 *
 * Os IDs são completos como estão; não acrescente sufixo de data.
 */
export const DRAFT_MODELS = [
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
] as const;

export type DraftModel = (typeof DRAFT_MODELS)[number];

export const DRAFT_MODEL_LABEL: Record<DraftModel, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-opus-5": "Opus 5",
};

/**
 * Uma linha sobre quando cada um vale a pena.
 *
 * Preço sozinho não decide nada — a diferença entre os três, num lead avulso,
 * é de centavos. O que decide é o tipo de mensagem que cada um escreve.
 */
export const DRAFT_MODEL_NOTE: Record<DraftModel, string> = {
  "claude-haiku-4-5": "rápido e direto; texto mais simples",
  "claude-sonnet-5": "o padrão — equilíbrio entre custo e escrita",
  "claude-opus-5": "o mais capaz; para o lead que vale a mensagem certa",
};

export function isDraftModel(valor: string): valor is DraftModel {
  return (DRAFT_MODELS as readonly string[]).includes(valor);
}
