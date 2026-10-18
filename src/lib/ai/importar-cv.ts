import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CvSchema, type Cv } from "../tipos";
import { anthropic, ErroIA, MODELO_ESCRITA, registrarUso } from "./cliente";

const INSTRUCOES = `Converta o currículo recebido para o formato estruturado pedido.
- Transcreva fielmente: não melhore, não resuma e não invente nada. Campos ausentes ficam como string vazia ou lista vazia.
- Datas no formato MM/AAAA quando possível; "Atual" para o emprego atual.
- Separe realizações (resultados, projetos, números) do resumo de cada experiência.
- Agrupe as habilidades em grupos como "Mainframe", "Linguagens", "Banco de dados", "Ferramentas", "Metodologias", "Gestão".`;

/** Lê um CV em PDF ou texto colado e devolve o formato estruturado. */
export async function importarCv(
  supabase: SupabaseClient,
  userId: string,
  entrada: { pdfBase64: string } | { texto: string },
): Promise<Cv> {
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    "pdfBase64" in entrada
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.pdfBase64 } },
          { type: "text", text: "Converta este currículo." },
        ]
      : [{ type: "text", text: `Converta este currículo:\n\n${entrada.texto}` }];

  const res = await anthropic.beta.messages.parse({
    model: MODELO_ESCRITA,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(CvSchema) },
    system: INSTRUCOES,
    messages: [{ role: "user", content }],
  });
  await registrarUso(supabase, userId, "importar_cv", res.model, res.usage as Anthropic.Usage);
  if (res.stop_reason === "refusal") throw new ErroIA("A IA recusou ler este arquivo.");
  if (!res.parsed_output) throw new ErroIA("Não consegui ler o CV. Tente colar o texto.");
  return res.parsed_output;
}
