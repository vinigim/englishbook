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
//
// Os links dos alertas (o LinkedIn principalmente) têm centenas de caracteres
// de rastreamento. Copiados pela IA, estouravam o limite de saída e o JSON
// vinha cortado. Por isso a IA vê cada link como um código curto (L1, L2…) e
// devolve o código; o link original volta aqui. Código que não existe no
// e-mail é descartado, então a IA continua sem poder inventar link.
const ExtracaoSchema = z.object({
  vagas: z.array(
    z.object({
      titulo: z.string(),
      empresa: z.string(),
      local: z.string(),
      link: z.string().describe('O código do link da vaga, exatamente como aparece no e-mail (ex.: "L12")'),
    }),
  ),
});

const INSTRUCOES = `Você recebe o texto de um e-mail de alerta de vagas (LinkedIn, Indeed, Glassdoor ou Catho). Cada link foi trocado por um código entre colchetes, como "texto [L12]".
Liste cada vaga anunciada no e-mail com título, empresa, local e o código do link da vaga. Use só códigos que aparecem no e-mail.
Ignore anúncios, cursos, "vagas que você salvou", links de configuração e rodapé. Se o e-mail não for um alerta de vagas, devolva a lista vazia.`;

const URL_NO_TEXTO = /https?:\/\/[^\s<>"'\[\]]+/g;

/** Troca cada URL do texto por um código curto; o mesmo link repetido ganha o mesmo código. */
export function encurtarLinks(texto: string): { texto: string; links: Map<string, string> } {
  const porUrl = new Map<string, string>();
  const links = new Map<string, string>();
  const curto = texto.replace(URL_NO_TEXTO, (url) => {
    let codigo = porUrl.get(url);
    if (!codigo) {
      codigo = `L${porUrl.size + 1}`;
      porUrl.set(url, codigo);
      links.set(codigo, url);
    }
    return codigo;
  });
  return { texto: curto, links };
}

export async function extrairVagasDoEmail(
  supabase: SupabaseClient,
  userId: string,
  email: EmailAlerta,
): Promise<VagaColetada[]> {
  const { texto, links } = encurtarLinks(email.texto);
  const res = await anthropic.messages.parse({
    model: MODELO_TRIAGEM,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(ExtracaoSchema) },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Assunto: ${email.assunto}\nDe: ${email.remetente}\n\n${texto}` }],
  });
  await registrarUso(supabase, userId, "extracao_email", res.model, res.usage);
  const vagas = res.parsed_output?.vagas ?? [];

  return vagas
    .map((v) => ({ ...v, original: links.get(v.link.trim().replace(/^\[|\]$/g, "").toUpperCase()) }))
    // Só aceitamos link que está de fato no e-mail.
    .filter((v): v is typeof v & { original: string } => Boolean(v.original) && Boolean(v.titulo.trim()))
    .map((v) => {
      const { url, idExterno } = urlCanonica(v.original);
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
