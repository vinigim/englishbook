import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairVagasDoEmail } from "./ai/extracao-email";
import { ehRelevante, triarVaga, type PerfilTriagem } from "./ai/triagem";
import { chaveVaga, citaMainframe, claramenteJunior } from "./filtro";
import { coletarEmpresa, detalharVaga, FONTES_COM_DETALHE } from "./fontes/ats";
import { gmailConfigurado, lerAlertas } from "./fontes/gmail";
import { coletarGupy } from "./fontes/gupy";
import { EmpresaAlvoSchema, type Cv, type VagaColetada } from "./tipos";

// ---------------------------------------------------------------------
// Uma rodada de busca para um usuário: coleta → pré-filtro → grava o que
// é novo → triagem por IA do que está pendente. Cada fonte falha sozinha:
// a Gupy fora do ar não impede a leitura do Gmail.
// ---------------------------------------------------------------------

const DIAS_GMAIL = 3;
const TRIAGENS_POR_RODADA = 80;
const CONCORRENCIA = 4;
/** A função tem 300 s na Vercel; paramos a triagem antes disso. O resto fica pendente para amanhã. */
const PRAZO_MS = 240_000;
/** Buscar descrições não pode comer o tempo da triagem. */
const PRAZO_DETALHE_MS = 120_000;

type ResumoFonte = { trazidas?: number; novas?: number; erro?: string };

export interface ResultadoBusca {
  fontes: Record<string, ResumoFonte>;
  /** Vagas que vieram sem descrição e ganharam uma nesta rodada. */
  detalhadas: number;
  triadas: number;
  relevantes: number;
  pendentes: number;
}

function passaPreFiltro(v: VagaColetada): boolean {
  if (claramenteJunior(v.titulo)) return false;
  // Alertas de e-mail e buscas por termo no ATS já vêm filtrados pela própria busca.
  if (v.semDescricao) return true;
  return citaMainframe(`${v.titulo}\n${v.descricao}`);
}

async function gravar(supabase: SupabaseClient, userId: string, vagas: VagaColetada[]): Promise<number> {
  const linhas = new Map<string, Record<string, unknown>>();
  for (const v of vagas.filter(passaPreFiltro)) {
    const chave = chaveVaga(v.titulo, v.empresa);
    if (linhas.has(chave)) continue;
    linhas.set(chave, {
      user_id: userId,
      fonte: v.fonte,
      id_externo: v.idExterno,
      chave,
      url: v.url,
      titulo: v.titulo,
      empresa: v.empresa,
      local: v.local,
      modelo: v.modelo,
      pais: v.pais,
      descricao: v.descricao,
      publicada_em: v.publicadaEm,
    });
  }
  if (linhas.size === 0) return 0;
  const { data, error } = await supabase
    .from("vagas")
    .upsert([...linhas.values()], { onConflict: "user_id,chave", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Versão curta do CV para a triagem: o suficiente para dar a nota de aderência. */
export function resumoDoCv(cv: Cv): string {
  const experiencias = (cv.experiencias ?? [])
    .slice(0, 6)
    .map((e) => `- ${e.cargo} — ${e.empresa} (${e.inicio} a ${e.fim})`)
    .join("\n");
  const habilidades = (cv.habilidades ?? []).map((h) => `${h.grupo}: ${h.itens.join(", ")}`).join("\n");
  return [
    `CV: ${cv.titulo}`,
    cv.resumo,
    experiencias && `Experiências:\n${experiencias}`,
    habilidades && `Habilidades:\n${habilidades}`,
    cv.certificacoes?.length ? `Certificações: ${cv.certificacoes.join(", ")}` : "",
    cv.idiomas?.length ? `Idiomas: ${cv.idiomas.map((i) => `${i.idioma} (${i.nivel})`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function emLotes<T>(itens: T[], n: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let item = fila.shift(); item !== undefined; item = fila.shift()) await fn(item);
    }),
  );
}

export async function rodarBusca(
  supabase: SupabaseClient,
  userId: string,
  origem: "cron" | "manual",
): Promise<ResultadoBusca> {
  const inicio = Date.now();
  const { data: execucao } = await supabase
    .from("execucoes_busca")
    .insert({ user_id: userId, origem })
    .select("id")
    .single();

  const { data: perfil, error: erroPerfil } = await supabase
    .from("perfil")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroPerfil) throw new Error(erroPerfil.message);
  if (!perfil) throw new Error("perfil_nao_encontrado");

  const fontes: Record<string, ResumoFonte> = {};
  const coletar = async (nome: string, fn: () => Promise<VagaColetada[]>) => {
    try {
      const vagas = await fn();
      fontes[nome] = { trazidas: vagas.length, novas: await gravar(supabase, userId, vagas) };
    } catch (e) {
      fontes[nome] = { erro: e instanceof Error ? e.message : String(e) };
      console.error(`[busca] ${nome}`, e);
    }
  };

  // 1. Gupy
  await coletar("gupy", () => coletarGupy(perfil.termos_busca));

  // 2. Empresas-alvo
  for (const bruto of perfil.empresas_alvo ?? []) {
    const e = EmpresaAlvoSchema.safeParse(bruto);
    if (e.success) await coletar(`${e.data.ats}:${e.data.nome}`, () => coletarEmpresa(e.data, perfil.termos_busca));
  }

  // 3. Alertas do Gmail (LinkedIn, Indeed, Glassdoor, Catho)
  if (gmailConfigurado()) {
    await coletar("gmail", async () => {
      const { data: lidos } = await supabase
        .from("emails_processados")
        .select("message_id")
        .eq("user_id", userId)
        .gte("processado_em", new Date(Date.now() - (DIAS_GMAIL + 2) * 86_400_000).toISOString());
      const emails = await lerAlertas(DIAS_GMAIL, new Set((lidos ?? []).map((l) => l.message_id)));
      const vagas: VagaColetada[] = [];
      for (const email of emails) {
        const extraidas = await extrairVagasDoEmail(supabase, userId, email);
        vagas.push(...extraidas);
        await supabase.from("emails_processados").upsert({
          user_id: userId,
          message_id: email.messageId,
          remetente: email.remetente,
          vagas_extraidas: extraidas.length,
        });
      }
      return vagas;
    });
  } else {
    fontes.gmail = { erro: "nao_configurado" };
  }

  // 4. Triagem de tudo que está pendente (inclusive o que sobrou de rodadas anteriores)
  const { data: pendentes } = await supabase
    .from("vagas")
    .select("id, url, titulo, empresa, local, modelo, pais, descricao, fonte")
    .eq("user_id", userId)
    .eq("triagem_status", "pendente")
    .order("encontrada_em", { ascending: false })
    .limit(TRIAGENS_POR_RODADA);

  // Workday e SmartRecruiters vêm sem descrição: busca o detalhe antes de triar.
  const semDescricao = (pendentes ?? []).filter((v) => !v.descricao && FONTES_COM_DETALHE.includes(v.fonte));
  let detalhadas = 0;
  await emLotes(semDescricao, CONCORRENCIA, async (v) => {
    if (Date.now() - inicio > PRAZO_DETALHE_MS) return;
    try {
      const d = await detalharVaga(v.fonte, v.url);
      if (!d?.descricao) return;
      v.descricao = d.descricao;
      if (v.modelo === "desconhecido") v.modelo = d.modelo;
      await supabase.from("vagas").update({ descricao: v.descricao, modelo: v.modelo }).eq("id", v.id);
      detalhadas++;
    } catch (e) {
      console.error("[busca] detalhe", v.id, e);
    }
  });

  const { data: cvBase } = await supabase
    .from("cvs")
    .select("conteudo")
    .eq("user_id", userId)
    .eq("base", true)
    .maybeSingle();
  const perfilTriagem: PerfilTriagem = {
    ...perfil,
    resumo_profissional: [perfil.resumo_profissional, cvBase ? resumoDoCv(cvBase.conteudo) : ""]
      .filter(Boolean)
      .join("\n\n"),
  };
  let triadas = 0;
  let relevantes = 0;
  await emLotes(pendentes ?? [], CONCORRENCIA, async (v) => {
    if (Date.now() - inicio > PRAZO_MS) return;
    try {
      const t = await triarVaga(supabase, userId, perfilTriagem, v);
      const relevante = ehRelevante(t);
      await supabase
        .from("vagas")
        .update({
          triagem: t,
          nota: t.nota,
          triagem_status: relevante ? "relevante" : "descartada",
          // A IA lê o modelo de trabalho melhor que as regex quando a fonte não diz.
          ...(v.modelo === "desconhecido" ? { modelo: t.modelo } : {}),
        })
        .eq("id", v.id);
      triadas++;
      if (relevante) relevantes++;
    } catch (e) {
      console.error("[busca] triagem", v.id, e);
    }
  });

  const { count } = await supabase
    .from("vagas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("triagem_status", "pendente");

  const resultado: ResultadoBusca = { fontes, detalhadas, triadas, relevantes, pendentes: count ?? 0 };
  if (execucao) {
    await supabase
      .from("execucoes_busca")
      .update({ terminada_em: new Date().toISOString(), resumo: resultado })
      .eq("id", execucao.id);
  }
  return resultado;
}
