import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export const anthropic = new Anthropic();

/** Triagem e extração rodam em volume: modelo barato. */
export const MODELO_TRIAGEM = process.env.MODELO_TRIAGEM ?? "claude-haiku-5-5";
/** CV adaptado, carta e importação do CV: qualidade importa mais que custo. */
export const MODELO_ESCRITA = process.env.MODELO_ESCRITA ?? "claude-opus-5-5";

// US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache.
// O modelo de fallback (quando o principal recusa) é cobrado pelo preço dele.
const PRECOS: Record<string, [number, number, number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-opus-4-8": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
};

export interface Uso {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function custoUsd(modelo: string, u: Uso): number {
  const [i, o, cr, cw] = PRECOS[modelo] ?? PRECOS["claude-opus-5-5"];
  return (
    (u.input_tokens * i +
      u.output_tokens * o +
      (u.cache_read_input_tokens ?? 0) * cr +
      (u.cache_creation_input_tokens ?? 0) * cw) /
    1_000_000
  );
}

/** Grava cada chamada em `uso_ia`. Falha de log nunca derruba a tarefa. */
export async function registrarUso(
  supabase: SupabaseClient,
  userId: string,
  tarefa: string,
  modelo: string,
  u: Uso,
) {
  const { error } = await supabase.from("uso_ia").insert({
    user_id: userId,
    tarefa,
    modelo,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cost_usd: custoUsd(modelo, u),
  });
  if (error) console.error("[uso_ia]", error.message);
}

/** Erro que vale mostrar para o usuário em vez de um 500 genérico. */
export class ErroIA extends Error {}
