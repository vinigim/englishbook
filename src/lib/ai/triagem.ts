import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTriagem, TriagemRespostaSchema, type Nivel, type Triagem } from "../tipos";
import { anthropic, MODELO_TRIAGEM, registrarUso } from "./cliente";

// Níveis que interessam: sênior para cima, incluindo liderança.
export const NIVEIS_ALVO: Nivel[] = ["senior", "especialista", "tech_lead", "coordenador", "gerente"];

export interface PerfilTriagem {
  resumo_profissional: string;
  aceita_remoto: boolean;
  aceita_hibrido: boolean;
  aceita_presencial: boolean;
  aceita_internacional: boolean;
  cidades: string[];
}

export interface VagaParaTriagem {
  titulo: string;
  empresa: string;
  local: string;
  modelo: string;
  pais: string;
  descricao: string;
  fonte: string;
}

// Instruções fixas primeiro; o perfil vem depois e é igual em todo o lote,
// então o bloco inteiro pode ser reaproveitado do cache entre as vagas.
const INSTRUCOES = `Você faz a triagem de vagas de emprego para um profissional de TI mainframe IBM que procura posições de nível sênior ou de liderança no Brasil ou no exterior.

Para cada vaga, responda:
- eh_mainframe: true só se o dia a dia da vaga envolve a plataforma mainframe IBM (z/OS, COBOL, CICS, JCL, DB2 for z/OS, IMS, VSAM, Natural/Adabas, PL/I, REXX, HLASM, "alta plataforma", modernização/migração de mainframe). Vagas de AS/400 (IBM i, RPG), DB2 LUW sem mainframe ou que só citam mainframe como "diferencial" distante devem ser false.
- nivel: o nível da posição. Se o título não diz, deduza pelos requisitos (anos de experiência, responsabilidades, gestão de pessoas). "Especialista" = individual contributor acima de sênior; "tech_lead" = liderança técnica; "coordenador" e "gerente" = gestão. Use "outro" só para vagas que não são de TI.
- modelo: remoto, hibrido, presencial ou desconhecido.
- internacional: true se a vaga é fora do Brasil ou para empresa estrangeira contratando do exterior.
- nota (0 a 100): aderência ao perfil e às preferências do candidato abaixo. Vaga que não é mainframe ou abaixo de sênior fica abaixo de 30.
- resumo: uma ou duas frases em português.
- motivos: de 2 a 5 itens curtos, a favor e contra.
- tecnologias: as tecnologias citadas na vaga.
- salario: a faixa salarial se a vaga informar, senão null.

Quando a descrição não estiver disponível (vaga vinda de alerta de e-mail), julgue pelo título e pela empresa e seja prudente na nota.`;

function blocoPerfil(p: PerfilTriagem): string {
  const modelos = [
    p.aceita_remoto && "remoto",
    p.aceita_hibrido && "híbrido",
    p.aceita_presencial && "presencial",
  ].filter(Boolean);
  return `## Perfil do candidato
${p.resumo_profissional.trim() || "(o candidato ainda não preencheu o resumo profissional)"}

## Preferências
- Modelos de trabalho aceitos: ${modelos.join(", ") || "qualquer"}
- Cidades para híbrido/presencial: ${p.cidades.join(", ") || "não informadas"}
- Aceita vagas internacionais: ${p.aceita_internacional ? "sim" : "não"}`;
}

export async function triarVaga(
  supabase: SupabaseClient,
  userId: string,
  perfil: PerfilTriagem,
  v: VagaParaTriagem,
): Promise<Triagem> {
  // Descrições de vaga são curtas; o corte só protege contra páginas malformadas.
  const descricao = v.descricao.length > 20000 ? `${v.descricao.slice(0, 20000)}\n[...]` : v.descricao;
  const res = await anthropic.messages.parse({
    model: MODELO_TRIAGEM,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(TriagemRespostaSchema) },
    system: [
      { type: "text", text: INSTRUCOES },
      { type: "text", text: blocoPerfil(perfil), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Vaga (fonte: ${v.fonte})
Título: ${v.titulo}
Empresa: ${v.empresa || "não informada"}
Local: ${v.local || "não informado"} · País: ${v.pais || "não informado"} · Modelo: ${v.modelo}

Descrição:
${descricao.trim() || "(indisponível)"}`,
      },
    ],
  });
  await registrarUso(supabase, userId, "triagem", res.model, res.usage);
  if (!res.parsed_output) throw new Error(`triagem_sem_resposta_${res.stop_reason}`);
  return normalizarTriagem(res.parsed_output);
}

export function ehRelevante(t: Triagem): boolean {
  return t.eh_mainframe && NIVEIS_ALVO.includes(t.nivel);
}
