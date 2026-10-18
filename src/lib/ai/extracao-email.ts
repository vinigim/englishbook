import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inferirModelo } from "../filtro";
import { urlCanonica, type EmailAlerta } from "../fontes/gmail";
import type { VagaColetada } from "../tipos";
import { anthropic, MODELO_TRIAGEM, registrarUso } from "./cliente";

// O HTML dos alertas muda sem aviso de site para site; em vez de manter um
// parser por remetente, a IA lista as vagas e o código confere cada link.
const ExtracaoSchema = z.object({
  vagas: z.array(
    z.object({
      titulo: z.string(),
      empresa: z.string(),
      local: z.string(),
      url: z.string().describe("O link da vaga copiado exatamente como aparece entre colchetes no e-mail"),
    }),
  ),
});

const INSTRUCOES = `Você recebe o texto de um e-mail de alerta de vagas (LinkedIn, Indeed, Glassdoor ou Catho). Os links aparecem como "texto [url]".
Liste cada vaga anunciada no e-mail com título, empresa, local e o link da vaga. Copie a URL exatamente como está no e-mail; não invente nem complete links.
Ignore anúncios, cursos, "vagas que você salvou", links de configuração e rodapé. Se o e-mail não for um alerta de vagas, devolva a lista vazia.`;

export async function extrairVagasDoEmail(
  supabase: SupabaseClient,
  userId: string,
  email: EmailAlerta,
): Promise<VagaColetada[]> {
  const res = await anthropic.messages.parse({
    model: MODELO_TRIAGEM,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(ExtracaoSchema) },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Assunto: ${email.assunto}\nDe: ${email.remetente}\n\n${email.texto}` }],
  });
  await registrarUso(supabase, userId, "extracao_email", res.model, res.usage);
  const vagas = res.parsed_output?.vagas ?? [];

  return vagas
    // Só aceitamos URL que está de fato no e-mail.
    .filter((v) => v.url.startsWith("http") && email.texto.includes(v.url) && v.titulo.trim())
    .map((v) => {
      const { url, idExterno } = urlCanonica(v.url);
      return {
        fonte: email.fonte,
        idExterno,
        url,
        titulo: v.titulo.trim(),
        empresa: v.empresa.trim(),
        local: v.local.trim(),
        modelo: inferirModelo(v.local),
        pais: "",
        descricao: "",
        publicadaEm: email.data,
        semDescricao: true,
      };
    });
}
