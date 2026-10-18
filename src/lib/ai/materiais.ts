import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CvSchema, type Cv } from "../tipos";
import { anthropic, ErroIA, MODELO_ESCRITA, registrarUso } from "./cliente";

// ---------------------------------------------------------------------
// Materiais de candidatura para uma vaga: CV adaptado, carta, respostas
// prontas e a análise de aderência. Tudo a partir do CV base — a IA pode
// reordenar, resumir e trocar palavras, nunca inventar experiência.
// ---------------------------------------------------------------------
export const MateriaisSchema = z.object({
  idioma: z.string().describe('"pt-BR" ou "en"'),
  cv: CvSchema,
  mudancas_no_cv: z.array(z.string()).describe("O que foi ajustado no CV em relação ao base, e por quê"),
  carta: z.string().describe("Carta de apresentação / mensagem para o recrutador, pronta para colar"),
  mensagem_linkedin: z.string().describe("Mensagem curta (até 300 caracteres) para o recrutador no LinkedIn"),
  respostas: z.array(z.object({ pergunta: z.string(), resposta: z.string() }))
    .describe("Perguntas comuns no formulário desta vaga com respostas sugeridas"),
  aderencia: z.object({
    pontos_fortes: z.array(z.string()),
    lacunas: z.array(z.string()).describe("Requisitos da vaga que o CV não comprova"),
    palavras_chave_faltando: z.array(z.string())
      .describe("Termos da vaga que não aparecem no CV; só inclua no CV se o candidato de fato tiver a experiência"),
  }),
  preparo_entrevista: z.array(z.object({ pergunta: z.string(), dica: z.string() }))
    .describe("Perguntas técnicas e comportamentais prováveis nesta entrevista"),
});
export type Materiais = z.infer<typeof MateriaisSchema>;

const INSTRUCOES = `Você é um consultor de carreira especializado em TI mainframe (z/OS, COBOL, CICS, DB2, JCL, IMS, modernização) para posições sênior, especialista, tech lead, coordenação e gerência.

A partir do CV base do candidato e de uma vaga, prepare os materiais de candidatura:

1. cv: uma versão do CV adaptada para esta vaga. Regras inegociáveis:
   - Use somente fatos que estão no CV base. Nunca invente cargos, empresas, datas, certificações, números ou tecnologias.
   - Você pode reordenar experiências e realizações, reescrever o resumo e o título profissional, destacar o que a vaga pede, usar os mesmos termos da vaga quando forem sinônimos do que o candidato já fez, e encurtar o que for irrelevante.
   - Para vagas de liderança, dê destaque a gestão de pessoas, decisões técnicas, projetos e resultados que já estão no CV.
   - Mantenha as datas exatamente como estão.
2. idioma: "en" se a vaga está em inglês ou é internacional, senão "pt-BR". Escreva o CV e a carta nesse idioma; os demais campos sempre em português.
3. carta: objetiva (até 250 palavras), sem clichês, ligando 2 ou 3 experiências reais aos requisitos principais.
4. respostas: as perguntas que esse tipo de formulário costuma fazer (pretensão salarial, disponibilidade, por que esta empresa, experiência com X) com respostas sugeridas. Onde depender de uma decisão do candidato (ex.: pretensão salarial), escreva a resposta com um marcador [preencher].
5. aderencia e preparo_entrevista: análise honesta; lacunas são lacunas.`;

export async function gerarMateriais(
  supabase: SupabaseClient,
  userId: string,
  cvBase: Cv,
  vaga: { titulo: string; empresa: string; local: string; modelo: string; pais: string; descricao: string; url: string },
): Promise<Materiais> {
  const res = await anthropic.beta.messages.parse({
    model: MODELO_ESCRITA,
    max_tokens: 16000,
    // Se o modelo principal recusar, a API repete a chamada em outro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(MateriaisSchema) },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `<cv_base>
${JSON.stringify(cvBase, null, 2)}
</cv_base>

<vaga>
Título: ${vaga.titulo}
Empresa: ${vaga.empresa || "não informada"}
Local: ${vaga.local || "não informado"} · País: ${vaga.pais || "não informado"} · Modelo: ${vaga.modelo}
Link: ${vaga.url}

${vaga.descricao.trim() || "(A descrição completa não está disponível; trabalhe com o título e a empresa e diga isso na análise de aderência.)"}
</vaga>`,
      },
    ],
  });
  await registrarUso(supabase, userId, "materiais", res.model, res.usage as Anthropic.Usage);
  if (res.stop_reason === "refusal") throw new ErroIA("A IA recusou gerar os materiais para esta vaga.");
  if (res.stop_reason === "max_tokens") throw new ErroIA("A resposta ficou longa demais. Tente de novo.");
  if (!res.parsed_output) throw new ErroIA("A IA não devolveu os materiais no formato esperado.");
  return res.parsed_output;
}
