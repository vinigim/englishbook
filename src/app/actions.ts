"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ehRelevante, triarVaga } from "@/lib/ai/triagem";
import { resumoDoCv } from "@/lib/busca";
import { chaveVaga, inferirModelo } from "@/lib/filtro";
import { usuarioAtual } from "@/lib/supabase/server";
import { CvSchema, EmpresaAlvoSchema, RESULTADOS, STATUS, type ActionResult } from "@/lib/tipos";

async function exigirUsuario() {
  const { supabase, user } = await usuarioAtual();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  return { supabase, user };
}

function falha(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------
const PerfilSchema = z.object({
  nome: z.string().max(200),
  resumo_profissional: z.string().max(5000),
  termos_busca: z.array(z.string().trim().min(2)).min(1, "Informe ao menos um termo de busca."),
  aceita_remoto: z.boolean(),
  aceita_hibrido: z.boolean(),
  aceita_presencial: z.boolean(),
  aceita_internacional: z.boolean(),
  cidades: z.array(z.string().trim().min(2)),
  empresas_alvo: z.array(EmpresaAlvoSchema),
  busca_ativa: z.boolean(),
});

export async function salvarPerfil(input: z.infer<typeof PerfilSchema>): Promise<ActionResult> {
  const parsed = PerfilSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const { supabase, user } = await exigirUsuario();
    const { error } = await supabase
      .from("perfil")
      .upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/perfil");
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

// ---------------------------------------------------------------------
// CV
// ---------------------------------------------------------------------
export async function salvarCv(id: string | null, cv: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = CvSchema.safeParse(cv);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const { supabase, user } = await exigirUsuario();
    const agora = new Date().toISOString();
    if (id) {
      const { error } = await supabase.from("cvs").update({ conteudo: parsed.data, updated_at: agora }).eq("id", id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/cv");
      return { ok: true, id };
    }
    const { data, error } = await supabase
      .from("cvs")
      .insert({ user_id: user.id, titulo: "CV base", base: true, conteudo: parsed.data })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/cv");
    return { ok: true, id: data.id };
  } catch (e) {
    return falha(e);
  }
}

// ---------------------------------------------------------------------
// Vagas
// ---------------------------------------------------------------------
export async function arquivarVaga(id: string, arquivada: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await exigirUsuario();
    const { error } = await supabase.from("vagas").update({ arquivada }).eq("id", z.uuid().parse(id));
    if (error) return { ok: false, error: error.message };
    revalidatePath("/vagas");
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

/** Quando a triagem errou: traz a vaga descartada de volta para a lista. */
export async function marcarRelevante(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await exigirUsuario();
    const { error } = await supabase
      .from("vagas")
      .update({ triagem_status: "relevante" })
      .eq("id", z.uuid().parse(id));
    if (error) return { ok: false, error: error.message };
    revalidatePath("/vagas");
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

const VagaManualSchema = z.object({
  url: z.url("Informe o link da vaga."),
  titulo: z.string().trim().min(3, "Informe o título."),
  empresa: z.string().trim(),
  local: z.string().trim(),
  descricao: z.string().trim().max(30000),
});

/** Vaga achada fora do radar (indicação, site da empresa, grupo de WhatsApp). */
export async function adicionarVagaManual(
  input: z.infer<typeof VagaManualSchema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = VagaManualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const { supabase, user } = await exigirUsuario();
    const v = parsed.data;
    const { data, error } = await supabase
      .from("vagas")
      .insert({
        user_id: user.id,
        fonte: "manual",
        chave: chaveVaga(v.titulo, v.empresa),
        url: v.url,
        titulo: v.titulo,
        empresa: v.empresa,
        local: v.local,
        modelo: inferirModelo(`${v.local} ${v.descricao}`),
        descricao: v.descricao,
        // Vaga escolhida por você não passa pelo filtro: entra como relevante.
        triagem_status: "relevante",
      })
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: error.code === "23505" ? "Essa vaga já está na lista." : error.message };
    }

    // A triagem aqui só preenche nota e resumo; não descarta.
    const [{ data: perfil }, { data: cv }] = await Promise.all([
      supabase.from("perfil").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("cvs").select("conteudo").eq("user_id", user.id).eq("base", true).maybeSingle(),
    ]);
    if (perfil) {
      try {
        const t = await triarVaga(supabase, user.id, {
          ...perfil,
          resumo_profissional: [perfil.resumo_profissional, cv ? resumoDoCv(cv.conteudo) : ""].filter(Boolean).join("\n\n"),
        }, data);
        await supabase.from("vagas").update({ triagem: t, nota: t.nota }).eq("id", data.id);
      } catch (e) {
        console.error("[vaga-manual] triagem", e);
      }
    }
    revalidatePath("/vagas");
    return { ok: true, id: data.id };
  } catch (e) {
    return falha(e);
  }
}

// ---------------------------------------------------------------------
// Candidaturas
// ---------------------------------------------------------------------
export async function criarCandidatura(vagaId: string, status: "interessado" | "aplicado"): Promise<ActionResult> {
  try {
    const { supabase, user } = await exigirUsuario();
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("candidaturas")
      .insert({
        user_id: user.id,
        vaga_id: z.uuid().parse(vagaId),
        status,
        aplicada_em: status === "aplicado" ? hoje : null,
        // Follow-up padrão: uma semana depois de aplicar.
        proximo_followup: status === "aplicado" ? somarDias(hoje, 7) : null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.code === "23505" ? "Já existe candidatura para esta vaga." : error.message };
    await supabase.from("candidatura_eventos").insert({
      user_id: user.id, candidatura_id: data.id, tipo: "status", para_status: status,
    });
    revalidatePath(`/vagas/${vagaId}`);
    revalidatePath("/candidaturas");
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const MudarStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUS),
  resultado: z.enum(RESULTADOS).nullable(),
});

export async function mudarStatus(input: z.infer<typeof MudarStatusSchema>): Promise<ActionResult> {
  const parsed = MudarStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const { supabase, user } = await exigirUsuario();
    const { id, status, resultado } = parsed.data;
    const { data: atual } = await supabase.from("candidaturas").select("status, vaga_id, aplicada_em").eq("id", id).single();
    if (!atual) return { ok: false, error: "Candidatura não encontrada." };

    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("candidaturas")
      .update({
        status,
        resultado: status === "encerrado" ? resultado : null,
        ...(status === "aplicado" && !atual.aplicada_em
          ? { aplicada_em: hoje, proximo_followup: somarDias(hoje, 7) }
          : {}),
        ...(status === "encerrado" ? { proximo_followup: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (atual.status !== status) {
      await supabase.from("candidatura_eventos").insert({
        user_id: user.id, candidatura_id: id, tipo: "status", de_status: atual.status, para_status: status,
        texto: status === "encerrado" && resultado ? resultado : null,
      });
    }
    revalidatePath("/candidaturas");
    revalidatePath(`/vagas/${atual.vaga_id}`);
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}

const DetalhesSchema = z.object({
  id: z.uuid(),
  aplicada_em: z.iso.date().nullable(),
  proximo_followup: z.iso.date().nullable(),
  contatos: z.string().max(5000),
  notas: z.string().max(20000),
  nova_nota: z.string().max(5000),
});

export async function salvarDetalhesCandidatura(input: z.infer<typeof DetalhesSchema>): Promise<ActionResult> {
  const parsed = DetalhesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try {
    const { supabase, user } = await exigirUsuario();
    const { id, nova_nota, ...campos } = parsed.data;
    const { data, error } = await supabase
      .from("candidaturas")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("vaga_id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (nova_nota.trim()) {
      await supabase.from("candidatura_eventos").insert({
        user_id: user.id, candidatura_id: id, tipo: "nota", texto: nova_nota.trim(),
      });
    }
    revalidatePath("/candidaturas");
    revalidatePath(`/vagas/${data.vaga_id}`);
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}
