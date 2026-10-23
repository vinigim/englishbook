import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Cv } from "../tipos";
import { anthropic, ErroIA, MODELO_ESCRITA, registrarUso } from "./cliente";

// ---------------------------------------------------------------------
// Roteiro de preparo para a entrevista de uma vaga: o que a vaga pede, o que
// o CV comprova, histórias STAR, perguntas prováveis e lacunas. Sai em
// português e em inglês na mesma chamada, com a mesma estrutura, para o
// candidato treinar nos dois idiomas. Como nos materiais, só fatos do CV.
// ---------------------------------------------------------------------
const PreparoSchema = z.object({
  o_que_buscam: z.string().describe("O que a empresa realmente procura nesta vaga, em 2 ou 3 frases"),
  pitch: z.string().describe('Resposta de 60 a 90 segundos para "fale sobre você", ligada a esta vaga'),
  requisitos: z.array(
    z.object({
      requisito: z.string(),
      aderencia: z.string().describe("Exatamente um de: forte, parcial, lacuna"),
      evidencia: z.string().describe("O que no CV comprova; vazio se nada comprova"),
      como_falar: z.string().describe("Como apresentar isso na entrevista, em uma ou duas frases"),
    }),
  ),
  historias: z.array(
    z.object({
      tema: z.string().describe("A pergunta ou competência que esta história responde"),
      situacao: z.string(),
      tarefa: z.string(),
      acao: z.string(),
      resultado: z.string(),
    }),
  ).describe("Histórias no formato STAR montadas só com experiências reais do CV"),
  perguntas_tecnicas: z.array(z.object({ pergunta: z.string(), como_responder: z.string() })),
  perguntas_comportamentais: z.array(z.object({ pergunta: z.string(), como_responder: z.string() })),
  lacunas: z.array(z.object({ lacuna: z.string(), como_abordar: z.string() })),
  perguntas_para_fazer: z.array(z.string()).describe("Perguntas inteligentes para o candidato fazer ao entrevistador"),
  cuidados: z.array(z.string()).describe("Pontos de atenção: modelo de trabalho, fuso, contratação, pretensão, o que evitar"),
});
export type Preparo = z.infer<typeof PreparoSchema>;

const PreparoBilingueSchema = z.object({
  pt: PreparoSchema.describe("O roteiro em português do Brasil"),
  en: PreparoSchema.describe("O mesmo roteiro em inglês, com o mesmo conteúdo e a mesma ordem"),
});
export type PreparoBilingue = z.infer<typeof PreparoBilingueSchema>;

const INSTRUCOES = `Você é um coach de entrevistas especializado em TI mainframe (z/OS, HLASM, COBOL, CICS, IMS, DB2, MQ, JCL, REXX, sysplex, modernização) para posições sênior, especialista, principal, arquiteto e liderança.

Com o CV, o perfil do candidato e a vaga, prepare um roteiro de entrevista:
- o_que_buscam: leia nas entrelinhas da descrição; diga o problema que a empresa quer resolver com essa contratação.
- pitch: em primeira pessoa, natural para falar em voz alta, ligando a trajetória do candidato ao que a vaga pede.
- requisitos: os 5 a 10 requisitos mais importantes da vaga. "forte" se o CV comprova com clareza, "parcial" se comprova algo próximo, "lacuna" se não comprova.
- historias: de 3 a 5 histórias STAR com projetos e resultados reais do CV, escolhidas para as competências que esta vaga mais cobra. Não invente números, prazos, nomes ou tecnologias; se o CV não tiver um número, descreva o resultado em palavras.
- perguntas_tecnicas: de 6 a 10 perguntas técnicas prováveis para esta vaga, com os pontos-chave de uma boa resposta e, quando couber, que experiência do CV citar.
- perguntas_comportamentais: de 4 a 6, com a história ou experiência a usar em cada uma.
- lacunas: para cada lacuna, como reconhecer com honestidade e mostrar experiência transferível ou plano de aprendizado. Nunca sugira mentir ou exagerar.
- perguntas_para_fazer: de 4 a 6, específicas da vaga e da empresa.
- cuidados: o que considerar nesta conversa (trabalho remoto a partir do Brasil, fuso horário, forma de contratação, pretensão, temas a evitar).
Gere tudo em português (pt) e o mesmo roteiro em inglês (en). O inglês é para o candidato treinar a entrevista em inglês: natural, profissional e fluente, não uma tradução literal.`;

export interface ContextoEntrevista {
  cv: Cv;
  perfil: string;
  vaga: { titulo: string; empresa: string; local: string; modelo: string; pais: string; descricao: string; url: string };
  /** Notas e linha do tempo da candidatura, quando a vaga já está no funil. */
  candidatura?: string;
}

export async function gerarPreparoEntrevista(
  supabase: SupabaseClient,
  userId: string,
  ctx: ContextoEntrevista,
): Promise<PreparoBilingue> {
  const { vaga } = ctx;
  const res = await anthropic.beta.messages.parse({
    model: MODELO_ESCRITA,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(PreparoBilingueSchema) },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `<cv>
${JSON.stringify(ctx.cv, null, 2)}
</cv>

<perfil>
${ctx.perfil.trim() || "(não preenchido)"}
</perfil>

<vaga>
Título: ${vaga.titulo}
Empresa: ${vaga.empresa || "não informada"}
Local: ${vaga.local || "não informado"} · País: ${vaga.pais || "não informado"} · Modelo: ${vaga.modelo}
Link: ${vaga.url}

${vaga.descricao.trim() || "(A descrição completa não está disponível; trabalhe com o título e a empresa e diga isso em cuidados.)"}
</vaga>
${ctx.candidatura ? `\n<candidatura>\n${ctx.candidatura}\n</candidatura>` : ""}`,
      },
    ],
  });
  await registrarUso(supabase, userId, "entrevista", res.model, res.usage as Anthropic.Usage);
  if (res.stop_reason === "refusal") throw new ErroIA("A IA recusou preparar a entrevista desta vaga.");
  if (res.stop_reason === "max_tokens") throw new ErroIA("A resposta ficou longa demais. Tente de novo.");
  if (!res.parsed_output) throw new ErroIA("A IA não devolveu o roteiro no formato esperado.");
  return res.parsed_output;
}
