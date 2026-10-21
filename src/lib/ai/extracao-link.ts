import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inferirModelo } from "../filtro";
import type { PaginaVaga } from "../fontes/link";
import type { Modelo } from "../tipos";
import { anthropic, ErroIA, MODELO_TRIAGEM, registrarUso } from "./cliente";

// Campos do formulário "+ Vaga manual" a partir da página lida em fontes/link.ts.

const ExtracaoSchema = z.object({
  eh_vaga: z.boolean().describe("A página anuncia uma vaga de emprego específica?"),
  titulo: z.string(),
  empresa: z.string().describe("Empresa contratante; vazio se a página não diz"),
  local: z.string().describe("Cidade/estado/país como a vaga informa; vazio se não diz"),
  modelo: z.string().describe("Exatamente um de: remoto, hibrido, presencial, desconhecido"),
  descricao: z.string(),
});

const INSTRUCOES = `Você recebe o texto de uma página da web que deve conter uma vaga de emprego.
Extraia os campos pedidos sem inventar nada.
- descricao: copie o texto da vaga (sobre a vaga, responsabilidades, requisitos, diferenciais, benefícios, como se candidatar) fielmente, sem resumir nem traduzir. Deixe de fora menus, rodapé, avisos de cookies e outras vagas listadas na página. Mantenha os tópicos em linhas que começam com "• ".
- Se a página não for o anúncio de uma vaga específica, responda eh_vaga = false e deixe os outros campos vazios.`;

export interface VagaExtraida {
  titulo: string;
  empresa: string;
  local: string;
  modelo: Modelo;
  descricao: string;
  /** De onde vieram os campos, para a tela dizer se a IA foi usada. */
  origem: "pagina" | "ia";
}

const MODELOS: Modelo[] = ["remoto", "hibrido", "presencial", "desconhecido"];

function modeloDe(bruto: string, contexto: string): Modelo {
  const m = bruto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() as Modelo;
  if (MODELOS.includes(m) && m !== "desconhecido") return m;
  return inferirModelo(contexto);
}

export async function extrairVagaDoLink(
  supabase: SupabaseClient,
  userId: string,
  pagina: PaginaVaga,
): Promise<VagaExtraida> {
  const j = pagina.jsonLd;
  // JSON-LD com título e descrição de verdade dispensa a IA.
  if (j && j.titulo && j.descricao.length >= 200) {
    return {
      ...j,
      modelo: j.modelo !== "desconhecido" ? j.modelo : inferirModelo(`${j.local}\n${j.titulo}\n${j.descricao}`),
      origem: "pagina",
    };
  }

  const meta = Object.entries(pagina.meta).map(([k, v]) => `${k}: ${v}`).join("\n");
  const res = await anthropic.messages.parse({
    model: MODELO_TRIAGEM,
    max_tokens: 12000,
    output_config: { effort: "low", format: zodOutputFormat(ExtracaoSchema) },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `URL: ${pagina.url}\n${meta}\n${j ? `Dados estruturados da página: ${JSON.stringify(j)}\n` : ""}\n--- Texto da página ---\n${pagina.texto}`,
      },
    ],
  });
  await registrarUso(supabase, userId, "extracao_link", res.model, res.usage);
  if (res.stop_reason === "refusal") throw new ErroIA("A IA recusou ler esta página.");
  const r = res.parsed_output;
  if (!r) throw new ErroIA("Não consegui extrair a vaga desta página. Preencha os campos manualmente.");
  if (!r.eh_vaga || !r.titulo.trim()) {
    throw new ErroIA("Não encontrei uma vaga nesta página. Confira o link ou preencha os campos manualmente.");
  }
  return {
    titulo: r.titulo.trim(),
    empresa: r.empresa.trim() || j?.empresa || "",
    local: r.local.trim() || j?.local || "",
    modelo: modeloDe(r.modelo, `${r.local}\n${r.descricao}`),
    descricao: r.descricao.trim(),
    origem: "ia",
  };
}
